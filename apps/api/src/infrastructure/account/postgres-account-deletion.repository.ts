import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { AccountDeletionRepository } from '../../application/ports/account-deletion.repository';
import type { AccountDeletionBlocker } from '../../domain/account/account-deletion';
import { revokeAllInTransaction } from '../auth/postgres-auth-session.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

/**
 * Engel sorgusu — her satır bir engel türü. Tek tur, kilit altında da aynı
 * sorgu koşar.
 */
const BLOCKERS_SQL = `
  SELECT 'auction_leading_bid' AS blocker WHERE EXISTS (
    SELECT 1 FROM market_bids WHERE bidder_id = $1 AND status = 'leading')
  UNION ALL
  SELECT 'auction_with_bids' WHERE EXISTS (
    SELECT 1 FROM market_listings l JOIN market_bids b ON b.listing_id = l.id AND b.status = 'leading'
     WHERE l.seller_id = $1 AND l.status = 'active')
  UNION ALL
  SELECT 'open_race_entry' WHERE EXISTS (
    SELECT 1 FROM race_entries e JOIN races r ON r.id = e.race_id
     WHERE e.player_id = $1 AND e.status IS DISTINCT FROM 'cancelled'
       AND r.status IN ('scheduled', 'locking'))
  UNION ALL
  SELECT 'interactive_race_running' WHERE EXISTS (
    SELECT 1 FROM interactive_races WHERE player_id = $1 AND status = 'running')
  UNION ALL
  SELECT 'pvp_match_active' WHERE EXISTS (
    SELECT 1 FROM pvp_matches WHERE (player_a_id = $1 OR player_b_id = $1) AND status IN ('matched', 'in_progress'))
  UNION ALL
  SELECT 'club_leader_with_members' WHERE EXISTS (
    SELECT 1 FROM club_members m
     WHERE m.player_id = $1 AND m.role = 'leader'
       AND EXISTS (SELECT 1 FROM club_members o WHERE o.club_id = m.club_id AND o.player_id <> $1))`;

async function queryBlockers(executor: Pool | PoolClient, playerId: string): Promise<AccountDeletionBlocker[]> {
  const result = await executor.query<{ blocker: AccountDeletionBlocker }>(BLOCKERS_SQL, [playerId]);
  return result.rows.map((row) => row.blocker);
}

/** `account-deletion.repository.ts` port doc yorumu okunmalıdır. */
@Injectable()
export class PostgresAccountDeletionRepository implements AccountDeletionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  findBlockers(playerId: string): Promise<AccountDeletionBlocker[]> {
    return queryBlockers(this.pool, playerId);
  }

  async deleteAccount(input: {
    playerId: string;
    anonymousUsername: string;
    anonymousDisplayName: string;
    now: Date;
  }): Promise<AccountDeletionBlocker[]> {
    const { playerId, now } = input;
    return withTransaction(this.pool, async (client) => {
      // Kilit sırası para yollarıyla AYNI: önce ilanlar, sonra oyuncu
      // (müzayede/satın alma: ilan → teklif → at → oyuncu).
      await client.query(
        `SELECT id FROM market_listings WHERE seller_id = $1 AND status = 'active' ORDER BY id FOR UPDATE`,
        [playerId],
      );
      await client.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [playerId]);

      const blockers = await queryBlockers(client, playerId);
      if (blockers.length > 0) {
        return blockers;
      }

      // Teklifsiz ilanlar kapanır (teklifli müzayede yukarıda engellendi).
      await client.query(
        `UPDATE market_listings SET status = 'cancelled' WHERE seller_id = $1 AND status = 'active'`,
        [playerId],
      );
      // Tek başına liderin kulübü kapanır (üyesi olan lider yukarıda engellendi).
      await client.query(
        `DELETE FROM clubs WHERE id IN (
           SELECT club_id FROM club_members WHERE player_id = $1 AND role = 'leader')`,
        [playerId],
      );
      await client.query('DELETE FROM club_members WHERE player_id = $1', [playerId]);

      // KİŞİSEL VERİ — giriş bilgisi, dış kimlik, bekleyen bağlantılar.
      for (const table of [
        'player_credentials',
        'player_auth_providers',
        'password_reset_tokens',
        'email_verification_tokens',
        'matchmaking_tickets',
        'notifications',
        'race_messages',
      ]) {
        await client.query(`DELETE FROM ${table} WHERE player_id = $1`, [playerId]);
      }
      // Başkalarının bildirimlerinde bu oyuncuya atıf (ad, kimlik) kalmasın.
      await client.query(`DELETE FROM notifications WHERE payload::text LIKE '%' || $1 || '%'`, [playerId]);
      // Sosyal bağlar ve yazışmalar (iki yön).
      await client.query('DELETE FROM direct_messages WHERE sender_id = $1 OR recipient_id = $1', [playerId]);
      await client.query('DELETE FROM friendships WHERE player_low_id = $1 OR player_high_id = $1', [playerId]);
      await client.query('DELETE FROM race_invites WHERE inviter_id = $1 OR invitee_id = $1', [playerId]);
      await client.query('DELETE FROM player_blocks WHERE blocker_id = $1 OR blocked_id = $1', [playerId]);

      // Oturumlar kapanır; cihaz etiketi (kullanıcı aracısı) de silinir.
      await revokeAllInTransaction(client, playerId, 'account_deleted', now);
      await client.query('UPDATE auth_sessions SET user_agent = NULL WHERE player_id = $1', [playerId]);

      await client.query(
        `UPDATE players
            SET username = $2, display_name = $3, avatar_id = NULL, is_admin = false,
                deleted_at = $4, updated_at = $4
          WHERE id = $1`,
        [playerId, input.anonymousUsername, input.anonymousDisplayName, now],
      );
      return [];
    });
  }
}
