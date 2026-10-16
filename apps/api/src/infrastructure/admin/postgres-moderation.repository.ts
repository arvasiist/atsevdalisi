import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { AnnouncementLevel, AssignableRole, ModerationRole, SanctionKind } from '@at-sevdalisi/shared-types';
import type {
  AnnouncementRecord,
  ModerationRepository,
  SanctionRecord,
} from '../../application/ports/moderation.repository';
import { resolveStaffRole, roleFlags } from '../../domain/admin/staff';
import { revokeAllInTransaction } from '../auth/postgres-auth-session.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

interface SanctionRow {
  id: string;
  player_id: string;
  kind: SanctionKind;
  reason: string;
  created_by: string;
  created_at: Date;
  expires_at: Date | null;
  lifted_at: Date | null;
  lifted_by: string | null;
  lift_reason: string | null;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  level: AnnouncementLevel;
  starts_at: Date;
  ends_at: Date | null;
  created_by: string;
  created_at: Date;
  archived_at: Date | null;
}

const SANCTION_COLUMNS =
  'id, player_id, kind, reason, created_by, created_at, expires_at, lifted_at, lifted_by, lift_reason';
const ANNOUNCEMENT_COLUMNS = 'id, title, body, level, starts_at, ends_at, created_by, created_at, archived_at';
/** Duyuru açılışlarını sıraya sokan danışma kilidi anahtarı (sayım + ekleme atomik). */
const ANNOUNCEMENT_LOCK_KEY = 60_001;

function toSanction(row: SanctionRow): SanctionRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    kind: row.kind,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    liftedAt: row.lifted_at,
    liftedBy: row.lifted_by,
    liftReason: row.lift_reason,
  };
}

function toAnnouncement(row: AnnouncementRow): AnnouncementRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    level: row.level,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

async function audit(
  client: PoolClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, action, targetType, targetId, JSON.stringify(details)],
  );
}

/** `moderation.repository.ts` port doc yorumu okunmalıdır. */
@Injectable()
export class PostgresModerationRepository implements ModerationRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findRole(playerId: string): Promise<ModerationRole | null> {
    const result = await this.pool.query<{ is_admin: boolean; is_moderator: boolean }>(
      'SELECT is_admin, is_moderator FROM players WHERE id = $1 AND deleted_at IS NULL',
      [playerId],
    );
    const row = result.rows[0];
    return row === undefined ? null : resolveStaffRole(row.is_admin, row.is_moderator);
  }

  async findActiveSanction(playerId: string, now: Date): Promise<SanctionRecord | null> {
    const result = await this.pool.query<SanctionRow>(
      `SELECT ${SANCTION_COLUMNS} FROM player_sanctions
        WHERE player_id = $1 AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at > $2)
        ORDER BY expires_at DESC NULLS FIRST
        LIMIT 1`,
      [playerId, now],
    );
    return result.rows[0] ? toSanction(result.rows[0]) : null;
  }

  async listSanctions(playerId: string, limit: number): Promise<SanctionRecord[]> {
    const result = await this.pool.query<SanctionRow>(
      `SELECT ${SANCTION_COLUMNS} FROM player_sanctions WHERE player_id = $1
        ORDER BY created_at DESC, id DESC LIMIT $2`,
      [playerId, limit],
    );
    return result.rows.map(toSanction);
  }

  async createSanction(input: {
    actorId: string;
    playerId: string;
    kind: SanctionKind;
    reason: string;
    expiresAt: Date | null;
    now: Date;
    check: (targetRole: ModerationRole | null) => void;
  }): Promise<SanctionRecord | null> {
    return withTransaction(this.pool, async (client) => {
      const target = await client.query<{ is_admin: boolean; is_moderator: boolean }>(
        'SELECT is_admin, is_moderator FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.playerId],
      );
      const row = target.rows[0];
      if (row === undefined) {
        return null;
      }
      input.check(resolveStaffRole(row.is_admin, row.is_moderator));
      const inserted = await client.query<SanctionRow>(
        `INSERT INTO player_sanctions (player_id, kind, reason, created_by, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${SANCTION_COLUMNS}`,
        [input.playerId, input.kind, input.reason, input.actorId, input.now, input.expiresAt],
      );
      const sanction = toSanction(inserted.rows[0]!);
      if (input.kind === 'ban') {
        // Yasak kalıcıdır: açık oturumlar da kapanır (askıda gerek yok —
        // oturum kapısı zaten 403 verir, süre bitince oyuncu kaldığı yerden döner).
        await revokeAllInTransaction(client, input.playerId, 'revoked', input.now);
      }
      await audit(client, input.actorId, 'player.sanctioned', 'player', input.playerId, {
        sanctionId: sanction.id,
        kind: sanction.kind,
        reason: sanction.reason,
        expiresAt: sanction.expiresAt?.toISOString() ?? null,
      });
      return sanction;
    });
  }

  async liftSanction(input: {
    actorId: string;
    sanctionId: string;
    reason: string;
    now: Date;
    check: (sanction: SanctionRecord) => void;
  }): Promise<SanctionRecord | null> {
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<SanctionRow>(
        `SELECT ${SANCTION_COLUMNS} FROM player_sanctions WHERE id = $1 AND lifted_at IS NULL FOR UPDATE`,
        [input.sanctionId],
      );
      const row = found.rows[0];
      if (row === undefined) {
        return null;
      }
      const sanction = toSanction(row);
      input.check(sanction);
      const updated = await client.query<SanctionRow>(
        `UPDATE player_sanctions SET lifted_at = $2, lifted_by = $3, lift_reason = $4
          WHERE id = $1 RETURNING ${SANCTION_COLUMNS}`,
        [input.sanctionId, input.now, input.actorId, input.reason],
      );
      await audit(client, input.actorId, 'player.sanction_lifted', 'player', sanction.playerId, {
        sanctionId: sanction.id,
        kind: sanction.kind,
        reason: input.reason,
      });
      return toSanction(updated.rows[0]!);
    });
  }

  async setRole(input: {
    actorId: string;
    playerId: string;
    role: AssignableRole;
    now: Date;
  }): Promise<{ from: AssignableRole; to: AssignableRole } | null> {
    return withTransaction(this.pool, async (client) => {
      const target = await client.query<{ is_admin: boolean; is_moderator: boolean }>(
        'SELECT is_admin, is_moderator FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.playerId],
      );
      const row = target.rows[0];
      if (row === undefined) {
        return null;
      }
      const from: AssignableRole = resolveStaffRole(row.is_admin, row.is_moderator) ?? 'player';
      const flags = roleFlags(input.role);
      await client.query('UPDATE players SET is_admin = $2, is_moderator = $3, updated_at = $4 WHERE id = $1', [
        input.playerId,
        flags.isAdmin,
        flags.isModerator,
        input.now,
      ]);
      await audit(client, input.actorId, 'player.role_changed', 'player', input.playerId, { from, to: input.role });
      return { from, to: input.role };
    });
  }

  async createAnnouncement(input: {
    actorId: string;
    title: string;
    body: string;
    level: AnnouncementLevel;
    startsAt: Date;
    endsAt: Date | null;
    maxLive: number;
    now: Date;
  }): Promise<AnnouncementRecord | 'limit_reached'> {
    return withTransaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [ANNOUNCEMENT_LOCK_KEY]);
      // Yeni duyurunun penceresiyle çakışan yayındaki/yayına girecek duyurular.
      const overlapping = await client.query<{ count: string }>(
        `SELECT COUNT(*)::bigint AS count FROM announcements
          WHERE archived_at IS NULL
            AND (ends_at IS NULL OR ends_at > $1)
            AND ($2::timestamptz IS NULL OR starts_at < $2)`,
        [input.startsAt, input.endsAt],
      );
      if (Number(overlapping.rows[0]!.count) >= input.maxLive) {
        return 'limit_reached';
      }
      const inserted = await client.query<AnnouncementRow>(
        `INSERT INTO announcements (title, body, level, starts_at, ends_at, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${ANNOUNCEMENT_COLUMNS}`,
        [input.title, input.body, input.level, input.startsAt, input.endsAt, input.actorId, input.now],
      );
      const announcement = toAnnouncement(inserted.rows[0]!);
      await audit(client, input.actorId, 'announcement.created', 'announcement', announcement.id, {
        title: announcement.title,
        level: announcement.level,
      });
      return announcement;
    });
  }

  async archiveAnnouncement(actorId: string, announcementId: string, now: Date): Promise<AnnouncementRecord | null> {
    return withTransaction(this.pool, async (client) => {
      const updated = await client.query<AnnouncementRow>(
        `UPDATE announcements SET archived_at = $2, archived_by = $3
          WHERE id = $1 AND archived_at IS NULL RETURNING ${ANNOUNCEMENT_COLUMNS}`,
        [announcementId, now, actorId],
      );
      const row = updated.rows[0];
      if (row === undefined) {
        return null;
      }
      await audit(client, actorId, 'announcement.archived', 'announcement', announcementId, {});
      return toAnnouncement(row);
    });
  }

  async listLiveAnnouncements(now: Date): Promise<AnnouncementRecord[]> {
    const result = await this.pool.query<AnnouncementRow>(
      `SELECT ${ANNOUNCEMENT_COLUMNS} FROM announcements
        WHERE archived_at IS NULL AND starts_at <= $1 AND (ends_at IS NULL OR ends_at > $1)
        ORDER BY starts_at DESC, id DESC`,
      [now],
    );
    return result.rows.map(toAnnouncement);
  }

  async listAnnouncements(limit: number): Promise<AnnouncementRecord[]> {
    const result = await this.pool.query<AnnouncementRow>(
      `SELECT ${ANNOUNCEMENT_COLUMNS} FROM announcements ORDER BY created_at DESC, id DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map(toAnnouncement);
  }
}
