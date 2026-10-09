import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type {
  Club,
  ClubDetailView,
  ClubInviteView,
  ClubMembership,
  ClubMemberView,
  ClubRole,
  ClubSummaryView,
} from '@at-sevdalisi/shared-types';
import type { ClubRepository } from '../../application/ports/club.repository';
import {
  addClubPoints,
  clubNameKey,
  createClub,
  joinClub,
  kickMember,
  leaveClub,
  assertHasClubPermission,
  planRoleChange,
} from '../../domain/club/club';
import {
  AlreadyClubMemberError,
  ClubInviteExistsError,
  ClubInviteExpiredError,
  ClubInviteLimitError,
  ClubInviteNotFoundError,
  ClubNameTakenError,
  ClubNotFoundError,
  NotClubMemberError,
} from '../../domain/club/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PlayerBlockedError } from '../../domain/social/errors';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';

interface ClubRow {
  id: string;
  name: string;
  tag: string | null;
  logo_id: string | null;
  leader_id: string;
  level: number;
  points: string;
  created_at: Date;
}

interface MembershipRow {
  player_id: string;
  club_id: string;
  role: string;
  contribution_points: string;
  joined_at: Date;
}

interface SummaryRow extends ClubRow {
  member_count: string;
  leader_username: string;
  leader_display_name: string;
}

function rowToClub(row: ClubRow): Club {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    logoId: row.logo_id,
    leaderId: row.leader_id,
    level: row.level,
    // `pg` BIGINT'i metin döner (CLAUDE.md) — `Number(...)` şart.
    points: Number(row.points),
    createdAt: row.created_at.toISOString(),
  };
}

function rowToMembership(row: MembershipRow): ClubMembership {
  return {
    clubId: row.club_id,
    playerId: row.player_id,
    role: row.role as ClubRole,
    contributionPoints: Number(row.contribution_points),
    joinedAt: row.joined_at.toISOString(),
  };
}

/** Sonraki seviyenin eşiği (kümülatif); en üst seviyede `null`. */
function nextLevelPoints(level: number, config: OnlineConfig): number | null {
  const next = config.club.levelThresholds[String(level + 1)];
  return next === undefined ? null : next;
}

function rowToSummary(row: SummaryRow, config: OnlineConfig): ClubSummaryView {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    level: row.level,
    points: Number(row.points),
    nextLevelPoints: nextLevelPoints(row.level, config),
    memberCount: Number(row.member_count),
    maxMembers: config.club.maxMembers,
    leaderUsername: row.leader_username,
    leaderDisplayName: row.leader_display_name,
    createdAt: row.created_at.toISOString(),
  };
}

const SUMMARY_SELECT = `
  SELECT c.*, p.username AS leader_username, p.display_name AS leader_display_name,
         (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id) AS member_count
    FROM clubs c
    JOIN players p ON p.id = c.leader_id`;

/** `unique_violation` — kulüp adı tekilliği ya da tek-kulüp birincil anahtarı. */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = error as { code?: string; constraint?: string };
  return pgError?.code === '23505' && pgError.constraint === constraint;
}

async function lockClub(client: PoolClient, clubId: string): Promise<Club> {
  const result = await client.query<ClubRow>('SELECT * FROM clubs WHERE id = $1 FOR UPDATE', [
    clubId,
  ]);
  const row = result.rows[0];
  if (!row) {
    throw new ClubNotFoundError(clubId);
  }
  return rowToClub(row);
}

async function lockMembership(
  client: PoolClient,
  playerId: string,
): Promise<ClubMembership | null> {
  const result = await client.query<MembershipRow>(
    'SELECT * FROM club_members WHERE player_id = $1 FOR UPDATE',
    [playerId],
  );
  const row = result.rows[0];
  return row ? rowToMembership(row) : null;
}

/**
 * Kulüp üyeliği ve seviye/puan (brief §44, migration 0049).
 *
 * Kilit sırası HER ZAMAN önce `clubs` satırı, sonra `club_members`
 * satırlarıdır — iki işlem ters sırada kilitleyip kilitlenmesin.
 */
@Injectable()
export class PostgresClubRepository implements ClubRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async listClubs(search: string | null, limit: number): Promise<ClubSummaryView[]> {
    const params: unknown[] = [limit];
    let where = '';
    if (search) {
      // LIKE joker karakterleri kaçırılır: "%" araması tüm tabloyu döndürmesin.
      params.push(`%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
      where = 'WHERE c.name ILIKE $2 OR c.tag ILIKE $2';
    }
    const result = await this.pool.query<SummaryRow>(
      `${SUMMARY_SELECT} ${where} ORDER BY c.points DESC, c.created_at ASC LIMIT $1`,
      params,
    );
    return result.rows.map((row) => rowToSummary(row, this.config.online));
  }

  async findDetail(clubId: string, viewerId: string): Promise<ClubDetailView | null> {
    const club = (await this.pool.query<SummaryRow>(`${SUMMARY_SELECT} WHERE c.id = $1`, [clubId]))
      .rows[0];
    if (!club) {
      return null;
    }
    const members = await this.pool.query<
      MembershipRow & { username: string; display_name: string; level: number }
    >(
      `SELECT m.*, p.username, p.display_name, p.level
         FROM club_members m JOIN players p ON p.id = m.player_id
        WHERE m.club_id = $1
        ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,
                 m.contribution_points DESC, m.joined_at ASC`,
      [clubId],
    );
    const memberViews: ClubMemberView[] = members.rows.map((row) => ({
      playerId: row.player_id,
      username: row.username,
      displayName: row.display_name,
      playerLevel: row.level,
      role: row.role as ClubRole,
      contributionPoints: Number(row.contribution_points),
      joinedAt: row.joined_at.toISOString(),
    }));
    return {
      club: rowToSummary(club, this.config.online),
      members: memberViews,
      myRole: memberViews.find((member) => member.playerId === viewerId)?.role ?? null,
    };
  }

  async findMembership(playerId: string): Promise<ClubMembership | null> {
    const result = await this.pool.query<MembershipRow>(
      'SELECT * FROM club_members WHERE player_id = $1',
      [playerId],
    );
    const row = result.rows[0];
    return row ? rowToMembership(row) : null;
  }

  async createClub(input: {
    id: string;
    name: string;
    tag: string | null;
    leaderId: string;
    now: Date;
  }): Promise<void> {
    const { club, leaderMembership } = createClub({ ...input, logoId: null });
    try {
      await withTransaction(this.pool, async (client) => {
        // Kurucu zaten bir kulüpteyse kulüp hiç yazılmasın (birincil anahtar
        // da yakalardı ama önce kulüp satırı eklenmiş olurdu → geri alınır;
        // açık kontrol hatayı DOĞRU koda çevirir).
        const existing = await lockMembership(client, input.leaderId);
        joinClub(club, input.leaderId, 0, existing !== null, this.config.online, input.now);
        await client.query(
          `INSERT INTO clubs (id, name, name_key, tag, logo_id, leader_id, level, points, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            club.id,
            club.name,
            clubNameKey(club.name),
            club.tag,
            club.logoId,
            club.leaderId,
            club.level,
            club.points,
            club.createdAt,
          ],
        );
        await client.query(
          `INSERT INTO club_members (player_id, club_id, role, contribution_points, joined_at)
           VALUES ($1, $2, $3, 0, $4)`,
          [leaderMembership.playerId, club.id, leaderMembership.role, leaderMembership.joinedAt],
        );
      });
    } catch (error) {
      if (isUniqueViolation(error, 'clubs_name_key_uq')) {
        throw new ClubNameTakenError();
      }
      throw this.mapMembershipRace(error, input.leaderId);
    }
  }

  async joinClub(clubId: string, playerId: string, now: Date): Promise<void> {
    try {
      await withTransaction(this.pool, async (client) => {
        // Kulüp satırı kilitlenir: iki eşzamanlı katılım son koltuğu
        // birlikte dolduramaz (sayım kilit altında yapılır).
        const club = await lockClub(client, clubId);
        await this.insertMembershipLocked(client, club, playerId, now);
      });
    } catch (error) {
      throw this.mapMembershipRace(error, playerId);
    }
  }

  async leaveClub(playerId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const membership = await this.lockOwnMembership(client, playerId);
      leaveClub(membership);
      await client.query('DELETE FROM club_members WHERE player_id = $1', [playerId]);
    });
  }

  async kickMember(actorId: string, clubId: string, targetId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await lockClub(client, clubId);
      const acting = await this.lockOwnMembership(client, actorId, clubId);
      const target = await lockMembership(client, targetId);
      if (!target) {
        throw new NotClubMemberError(targetId, clubId);
      }
      kickMember(acting, target, clubId);
      await client.query('DELETE FROM club_members WHERE player_id = $1', [targetId]);
    });
  }

  async changeRole(
    actorId: string,
    clubId: string,
    targetId: string,
    rawRole: unknown,
  ): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await lockClub(client, clubId);
      const acting = await this.lockOwnMembership(client, actorId, clubId);
      const target = await lockMembership(client, targetId);
      if (!target) {
        throw new NotClubMemberError(targetId, clubId);
      }
      const plan = planRoleChange(acting, target, rawRole);
      await client.query('UPDATE club_members SET role = $2 WHERE player_id = $1', [
        targetId,
        plan.targetRole,
      ]);
      if (plan.targetRole === 'leader') {
        // Liderlik devri: eski lider `officer` olur, `clubs.leader_id` aynı
        // transaction'da güncellenir — kulüp bir an bile iki liderli kalmaz.
        await client.query('UPDATE club_members SET role = $2 WHERE player_id = $1', [
          actorId,
          plan.actingRole,
        ]);
        await client.query('UPDATE clubs SET leader_id = $2 WHERE id = $1', [clubId, targetId]);
      }
    });
  }

  async disbandClub(actorId: string, clubId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await lockClub(client, clubId);
      const acting = await this.lockOwnMembership(client, actorId, clubId);
      assertHasClubPermission(acting, 'leader');
      // `club_members.club_id` ON DELETE CASCADE — üyelikler de silinir.
      await client.query('DELETE FROM clubs WHERE id = $1', [clubId]);
    });
  }

  /**
   * Kulüp satırı KİLİTLİYKEN üyelik yazar: kapasite kilit altında sayılır,
   * tek kulüp kuralı domain + `club_members_pkey` ile. Katılım ve davet
   * kabulü AYNI yoldan geçer (ikinci bir kural kopyası yok).
   */
  private async insertMembershipLocked(client: PoolClient, club: Club, playerId: string, now: Date): Promise<void> {
    const count = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM club_members WHERE club_id = $1', [
      club.id,
    ]);
    const existing = await lockMembership(client, playerId);
    const membership = joinClub(club, playerId, Number(count.rows[0]?.n ?? 0), existing !== null, this.config.online, now);
    await client.query(
      `INSERT INTO club_members (player_id, club_id, role, contribution_points, joined_at)
       VALUES ($1, $2, $3, 0, $4)`,
      [membership.playerId, membership.clubId, membership.role, membership.joinedAt],
    );
  }

  async inviteToClub(input: {
    inviteId: string;
    clubId: string;
    inviterId: string;
    inviteeUsername: string;
    now: Date;
    expiresAt: Date;
    maxPendingPerClub: number;
  }): Promise<void> {
    try {
      await withTransaction(this.pool, async (client) => {
        const club = await lockClub(client, input.clubId);
        const acting = await this.lockOwnMembership(client, input.inviterId, input.clubId);
        assertHasClubPermission(acting, 'officer');

        const invitee = await client.query<{ id: string; display_name: string }>(
          'SELECT id, display_name FROM players WHERE username = $1 AND deleted_at IS NULL',
          [input.inviteeUsername],
        );
        const inviteeRow = invitee.rows[0];
        if (!inviteeRow || inviteeRow.id === input.inviterId) {
          throw new PlayerNotFoundError(input.inviteeUsername);
        }
        // Tek kulüp kuralı: kulübü olan oyuncu davet edilemez (kabul anında
        // yine denetlenir — arada başka kulübe girmiş olabilir).
        const existing = await client.query('SELECT 1 FROM club_members WHERE player_id = $1', [inviteeRow.id]);
        if (existing.rows.length > 0) {
          throw new AlreadyClubMemberError(inviteeRow.id);
        }
        // Engel iki yönlüdür ve yön sızdırılmaz (PLAYER_BLOCKED).
        const blocked = await client.query(
          `SELECT 1 FROM player_blocks
            WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
            LIMIT 1`,
          [input.inviterId, inviteeRow.id],
        );
        if (blocked.rows.length > 0) {
          throw new PlayerBlockedError();
        }
        // Süresi geçmiş bekleyenler önce kapanır (tekil indeks + sayım doğru kalsın).
        await client.query(
          "UPDATE club_invites SET status = 'expired', responded_at = $2 WHERE club_id = $1 AND status = 'pending' AND expires_at <= $2",
          [input.clubId, input.now],
        );
        const pending = await client.query<{ n: string }>(
          "SELECT COUNT(*) AS n FROM club_invites WHERE club_id = $1 AND status = 'pending'",
          [input.clubId],
        );
        if (Number(pending.rows[0]?.n ?? 0) >= input.maxPendingPerClub) {
          throw new ClubInviteLimitError(input.maxPendingPerClub);
        }
        await client.query(
          `INSERT INTO club_invites (id, club_id, inviter_id, invitee_id, status, created_at, expires_at)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
          [input.inviteId, input.clubId, input.inviterId, inviteeRow.id, input.now, input.expiresAt],
        );
        const inviter = await client.query<{ display_name: string }>('SELECT display_name FROM players WHERE id = $1', [
          input.inviterId,
        ]);
        // Bildirim davetle AYNI transaction'da (geri alınan davetin haberi kalmasın).
        await client.query(
          `INSERT INTO notifications (player_id, type, payload, created_at)
           VALUES ($1, 'club_invite', $2::jsonb, $3)`,
          [
            inviteeRow.id,
            JSON.stringify({
              inviteId: input.inviteId,
              clubId: club.id,
              clubName: club.name,
              inviterId: input.inviterId,
              inviterName: inviter.rows[0]?.display_name ?? '',
            }),
            input.now,
          ],
        );
      });
    } catch (error) {
      if (isUniqueViolation(error, 'club_invites_pending_uq')) {
        throw new ClubInviteExistsError();
      }
      throw error;
    }
  }

  async listInvitesForPlayer(playerId: string, now: Date, limit: number): Promise<ClubInviteView[]> {
    const result = await this.pool.query<{
      id: string;
      club_id: string;
      club_name: string;
      club_tag: string | null;
      inviter_name: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `SELECT i.id, i.club_id, c.name AS club_name, c.tag AS club_tag, p.display_name AS inviter_name,
              i.created_at, i.expires_at
         FROM club_invites i
         JOIN clubs c ON c.id = i.club_id
         JOIN players p ON p.id = i.inviter_id
        WHERE i.invitee_id = $1 AND i.status = 'pending' AND i.expires_at > $2
        ORDER BY i.created_at DESC
        LIMIT $3`,
      [playerId, now, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      clubId: row.club_id,
      clubName: row.club_name,
      clubTag: row.club_tag,
      inviterName: row.inviter_name,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    }));
  }

  async respondToInvite(input: { inviteId: string; playerId: string; accept: boolean; now: Date }): Promise<string> {
    try {
      return await withTransaction(this.pool, async (client) => {
        // Kilit sırası katılımla aynı: önce kulüp. Kulüp kimliği kilitsiz okunur,
        // davet satırı kulüp kilitlendikten SONRA kilitlenip yeniden doğrulanır.
        const peek = await client.query<{ club_id: string }>(
          'SELECT club_id FROM club_invites WHERE id = $1 AND invitee_id = $2',
          [input.inviteId, input.playerId],
        );
        const clubId = peek.rows[0]?.club_id;
        if (clubId === undefined) {
          throw new ClubInviteNotFoundError(input.inviteId);
        }
        const club = input.accept ? await lockClub(client, clubId) : null;
        // Kabulde oyuncunun BÜTÜN bekleyen davetleri kimlik sırasıyla kilitlenir:
        // aynı oyuncunun iki daveti eşzamanlı kabul edilirse ikincisi birincinin
        // commit'ini bekler ve `cancelled` görür (aksi hâlde "diğerlerini iptal
        // et" adımı ile üyelik PK'si arasında kilitlenme döngüsü olurdu).
        const locked = await client.query<{ id: string; status: string; expires_at: Date }>(
          input.accept
            ? `SELECT id, status, expires_at FROM club_invites
                WHERE invitee_id = $2 AND (status = 'pending' OR id = $1)
                ORDER BY id FOR UPDATE`
            : 'SELECT id, status, expires_at FROM club_invites WHERE id = $1 AND invitee_id = $2 FOR UPDATE',
          [input.inviteId, input.playerId],
        );
        const invite = locked.rows.find((row) => row.id === input.inviteId);
        if (!invite || invite.status !== 'pending') {
          throw new ClubInviteNotFoundError(input.inviteId);
        }
        if (invite.expires_at.getTime() <= input.now.getTime()) {
          await client.query("UPDATE club_invites SET status = 'expired', responded_at = $2 WHERE id = $1", [
            input.inviteId,
            input.now,
          ]);
          return 'expired';
        }
        if (!input.accept || club === null) {
          await client.query("UPDATE club_invites SET status = 'declined', responded_at = $2 WHERE id = $1", [
            input.inviteId,
            input.now,
          ]);
          return clubId;
        }
        await this.insertMembershipLocked(client, club, input.playerId, input.now);
        await client.query("UPDATE club_invites SET status = 'accepted', responded_at = $2 WHERE id = $1", [
          input.inviteId,
          input.now,
        ]);
        // Artık kulübü var: diğer bekleyen davetleri geçersiz.
        await client.query(
          "UPDATE club_invites SET status = 'cancelled', responded_at = $2 WHERE invitee_id = $1 AND status = 'pending'",
          [input.playerId, input.now],
        );
        return clubId;
      }).then((result) => {
        if (result === 'expired') {
          throw new ClubInviteExpiredError();
        }
        return result;
      });
    } catch (error) {
      throw this.mapMembershipRace(error, input.playerId);
    }
  }

  private async lockOwnMembership(
    client: PoolClient,
    playerId: string,
    clubId?: string,
  ): Promise<ClubMembership> {
    const membership = await lockMembership(client, playerId);
    if (!membership || (clubId !== undefined && membership.clubId !== clubId)) {
      throw new NotClubMemberError(playerId, clubId ?? '-');
    }
    return membership;
  }

  /** İki eşzamanlı katılım: birincil anahtar ikinciyi keser → doğru alan hatası. */
  private mapMembershipRace(error: unknown, playerId: string): unknown {
    if (isUniqueViolation(error, 'club_members_pkey')) {
      return new AlreadyClubMemberError(playerId);
    }
    return error;
  }
}

/**
 * Yarış XP'sinin kulübe katkısı (01.10.2026). Oyuncu bir kulüpteyse
 * kazandığı oyuncu XP'si hem kendi katkısına hem kulüp puanına eklenir ve
 * kulüp seviyesi `levelThresholds`ten yeniden hesaplanır. ÇAĞIRANIN
 * transaction'ında koşar (XP ile aynı) — geri alınan bir yarışın puanı
 * kulüpte kalmasın.
 */
export async function addClubPointsInTransaction(
  client: PoolClient,
  playerId: string,
  points: number,
  config: OnlineConfig,
): Promise<void> {
  if (points <= 0) {
    return;
  }
  const membership = await client.query<{ club_id: string }>(
    'SELECT club_id FROM club_members WHERE player_id = $1',
    [playerId],
  );
  const clubId = membership.rows[0]?.club_id;
  if (!clubId) {
    return;
  }
  const club = await lockClub(client, clubId);
  const lockedMembership = await lockMembership(client, playerId);
  if (!lockedMembership || lockedMembership.clubId !== club.id) {
    return; // Kilitler arasında kulüpten ayrıldı — puan kimseye yazılmaz.
  }
  const result = addClubPoints(club, lockedMembership, points, config);
  await client.query('UPDATE clubs SET points = $2, level = $3 WHERE id = $1', [
    club.id,
    result.club.points,
    result.club.level,
  ]);
  await client.query('UPDATE club_members SET contribution_points = $2 WHERE player_id = $1', [
    playerId,
    result.membership.contributionPoints,
  ]);
}
