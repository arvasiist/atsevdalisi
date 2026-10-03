import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AccountExportSection, AccountExportSectionName } from '@at-sevdalisi/shared-types';
import type { AccountExportRepository } from '../../application/ports/account-export.repository';
import { PG_POOL } from '../database/database.module';

/**
 * Bölüm sorguları — `$1` oyuncu, `$2` satır sınırı (+1: kırpılma tespiti).
 * Sütunlar AÇIKÇA seçilir (`SELECT *` YOK): yeni eklenen bir sütun — örn.
 * bir özet ya da iç bayrak — dışa aktarıma kendiliğinden SIZMAZ.
 * Diğer oyuncular yalnızca herkese açık kullanıcı adıyla görünür.
 * BIGINT/NUMERIC `::float8` ile sayıya çevrilir (pg metin döner — CLAUDE.md).
 */
const SECTION_SQL: Record<AccountExportSectionName, string> = {
  account: `
    SELECT p.username, p.display_name AS "displayName", p.level, p.xp::float8 AS xp,
           p.money::float8 AS money, p.gems::float8 AS gems, p.reputation, p.rating,
           p.stable_level AS "stableLevel", p.created_at AS "createdAt",
           c.email, c.email_verified_at AS "emailVerifiedAt"
      FROM players p LEFT JOIN player_credentials c ON c.player_id = p.id
     WHERE p.id = $1 LIMIT $2`,
  loginMethods: `
    SELECT provider, email, created_at AS "linkedAt"
      FROM player_auth_providers WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
  sessions: `
    SELECT user_agent AS "device", created_at AS "createdAt", last_used_at AS "lastUsedAt",
           expires_at AS "expiresAt", revoked_at AS "revokedAt"
      FROM auth_sessions WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
  horses: `
    SELECT id, name, gender, breed, birth_date AS "birthDate", level, status, created_at AS "createdAt"
      FROM horses WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2`,
  transactions: `
    SELECT id, type, amount::float8 AS amount, currency, balance_before::float8 AS "balanceBefore",
           balance_after::float8 AS "balanceAfter", reference_type AS "referenceType",
           reference_id AS "referenceId", created_at AS "createdAt"
      FROM economy_transactions WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
  raceEntries: `
    SELECT e.race_id AS "raceId", r.name AS "raceName", e.horse_id AS "horseId",
           e.finish_position AS "finishPosition", r.start_time AS "startTime"
      FROM race_entries e JOIN races r ON r.id = e.race_id LEFT JOIN horses h ON h.id = e.horse_id
     WHERE e.bot_label IS NULL AND COALESCE(e.player_id, h.owner_id) = $1
     ORDER BY r.start_time DESC LIMIT $2`,
  messages: `
    SELECT CASE WHEN m.sender_id = $1 THEN 'sent' ELSE 'received' END AS direction,
           o.username AS "otherPlayer", m.body, m.created_at AS "createdAt", m.read_at AS "readAt"
      FROM direct_messages m
      JOIN players o ON o.id = CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
     WHERE m.sender_id = $1 OR m.recipient_id = $1 ORDER BY m.created_at DESC LIMIT $2`,
  friendships: `
    SELECT o.username AS "otherPlayer", f.status, (f.requested_by_id = $1) AS "requestedByMe",
           f.created_at AS "createdAt", f.responded_at AS "respondedAt"
      FROM friendships f
      JOIN players o ON o.id = CASE WHEN f.player_low_id = $1 THEN f.player_high_id ELSE f.player_low_id END
     WHERE f.player_low_id = $1 OR f.player_high_id = $1 ORDER BY f.created_at DESC LIMIT $2`,
  // Yalnızca BENİM engellediklerim — "beni engelleyenler" listesi yoktur (CLAUDE.md).
  blocks: `
    SELECT o.username AS "blockedPlayer", b.created_at AS "createdAt"
      FROM player_blocks b JOIN players o ON o.id = b.blocked_id
     WHERE b.blocker_id = $1 ORDER BY b.created_at DESC LIMIT $2`,
  // Yalnızca BENİM yaptığım şikâyetler — hakkımdaki şikâyet şikâyetçiyi açığa çıkarırdı.
  reportsFiled: `
    SELECT o.username AS "reportedPlayer", r.category, r.reason, r.status, r.created_at AS "createdAt"
      FROM player_reports r JOIN players o ON o.id = r.reported_id
     WHERE r.reporter_id = $1 ORDER BY r.created_at DESC LIMIT $2`,
  gifts: `
    SELECT CASE WHEN g.sender_id = $1 THEN 'sent' ELSE 'received' END AS direction,
           o.username AS "otherPlayer", g.currency, g.amount::float8 AS amount, g.created_at AS "createdAt"
      FROM gift_sends g
      JOIN players o ON o.id = CASE WHEN g.sender_id = $1 THEN g.recipient_id ELSE g.sender_id END
     WHERE g.sender_id = $1 OR g.recipient_id = $1 ORDER BY g.created_at DESC LIMIT $2`,
  notifications: `
    SELECT type, payload, read_at AS "readAt", created_at AS "createdAt"
      FROM notifications WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
  club: `
    SELECT c.name, c.tag, m.role, m.contribution_points AS "contributionPoints", m.joined_at AS "joinedAt"
      FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE m.player_id = $1 LIMIT $2`,
  // Yaptırımı veren/kaldıran yöneticinin kimliği VERİLMEZ (personelin kişisel verisi).
  sanctions: `
    SELECT kind, reason, created_at AS "createdAt", expires_at AS "expiresAt",
           lifted_at AS "liftedAt", lift_reason AS "liftReason"
      FROM player_sanctions WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
  questClaims: `
    SELECT quest_key AS "questKey", period_start AS "periodStart", reward_money::float8 AS "rewardMoney",
           claimed_at AS "claimedAt"
      FROM quest_claims WHERE player_id = $1 ORDER BY claimed_at DESC LIMIT $2`,
};

@Injectable()
export class PostgresAccountExportRepository implements AccountExportRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async exportSections(
    playerId: string,
    maxRows: number,
  ): Promise<Record<AccountExportSectionName, AccountExportSection> | null> {
    const exists = await this.pool.query('SELECT 1 FROM players WHERE id = $1 AND deleted_at IS NULL', [playerId]);
    if (exists.rows.length === 0) return null;
    const names = Object.keys(SECTION_SQL) as AccountExportSectionName[];
    const results = await Promise.all(
      names.map((name) => this.pool.query<Record<string, unknown>>(SECTION_SQL[name], [playerId, maxRows + 1])),
    );
    const sections = {} as Record<AccountExportSectionName, AccountExportSection>;
    names.forEach((name, index) => {
      const rows = results[index]!.rows;
      sections[name] = { rows: rows.slice(0, maxRows), truncated: rows.length > maxRows };
    });
    return sections;
  }
}
