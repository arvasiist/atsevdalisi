import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  FriendGiftBoardFacts,
  FriendGiftBoardQuery,
  FriendGiftCollectInput,
  FriendGiftCollectOutcome,
  FriendGiftRepository,
  FriendGiftSendAllInput,
} from '../../application/ports/friend-gift.repository';
import { credit } from '../../domain/economy/wallet';
import { remainingCollects } from '../../domain/social/friend-gift';
import { PG_POOL, withTransaction } from '../database/database.module';

/**
 * Hediye gönderilebilecek arkadaşlar: kabul edilmiş arkadaşlık, silinmemiş
 * hesap ve iki yönde de engel YOK (`isBlockedBetween` ile aynı soru — engel
 * arkadaşlığı silmez, o yüzden burada ayrıca süzülür).
 */
const ELIGIBLE_FRIENDS_SQL = `
  SELECT o.id AS friend_id
    FROM friendships f
    JOIN players o ON o.id = CASE WHEN f.player_low_id = $1::uuid THEN f.player_high_id ELSE f.player_low_id END
   WHERE (f.player_low_id = $1::uuid OR f.player_high_id = $1::uuid)
     AND f.status = 'accepted'
     AND o.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM player_blocks b
        WHERE (b.blocker_id = $1::uuid AND b.blocked_id = o.id)
           OR (b.blocker_id = o.id AND b.blocked_id = $1::uuid))`;

interface PendingRow {
  id: string;
  sender_id: string;
  username: string;
  display_name: string;
  amount: string;
  created_at: Date;
}

async function countPending(db: Pool | PoolClient, playerId: string, expiryCutoff: Date): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::bigint AS count FROM friend_gifts
      WHERE recipient_id = $1 AND collected_at IS NULL AND created_at >= $2`,
    [playerId, expiryCutoff],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countCollectedSince(db: Pool | PoolClient, playerId: string, dayStart: Date): Promise<number> {
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(*)::bigint AS count FROM friend_gifts WHERE recipient_id = $1 AND collected_at >= $2',
    [playerId, dayStart],
  );
  return Number(result.rows[0]?.count ?? 0);
}

@Injectable()
export class PostgresFriendGiftRepository implements FriendGiftRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async board(query: FriendGiftBoardQuery): Promise<FriendGiftBoardFacts> {
    const [collectedToday, pendingTotals, pending, friendCount, sentToday] = await Promise.all([
      countCollectedSince(this.pool, query.playerId, query.dayStart),
      this.pool.query<{ count: string; total: string | null }>(
        `SELECT COUNT(*)::bigint AS count, SUM(amount)::bigint AS total FROM friend_gifts
          WHERE recipient_id = $1 AND collected_at IS NULL AND created_at >= $2`,
        [query.playerId, query.expiryCutoff],
      ),
      this.pool.query<PendingRow>(
        `SELECT g.id, g.sender_id, p.username, p.display_name, g.amount, g.created_at
           FROM friend_gifts g JOIN players p ON p.id = g.sender_id
          WHERE g.recipient_id = $1 AND g.collected_at IS NULL AND g.created_at >= $2
          ORDER BY g.created_at ASC, g.id ASC LIMIT $3`,
        [query.playerId, query.expiryCutoff, query.pendingLimit],
      ),
      this.pool.query<{ count: string }>(`SELECT COUNT(*)::bigint AS count FROM (${ELIGIBLE_FRIENDS_SQL}) eligible`, [
        query.playerId,
      ]),
      this.pool.query<{ count: string }>(
        'SELECT COUNT(*)::bigint AS count FROM friend_gifts WHERE sender_id = $1 AND gift_day = $2::date',
        [query.playerId, query.dayKey],
      ),
    ]);
    return {
      collectedToday,
      // BIGINT metin döner (CLAUDE.md) — `Number(...)` şart.
      pendingCount: Number(pendingTotals.rows[0]?.count ?? 0),
      pendingAmount: Number(pendingTotals.rows[0]?.total ?? 0),
      pending: pending.rows.map((row) => ({
        giftId: row.id,
        senderId: row.sender_id,
        senderUsername: row.username,
        senderDisplayName: row.display_name,
        amount: Number(row.amount),
        createdAt: row.created_at,
      })),
      friendCount: Number(friendCount.rows[0]?.count ?? 0),
      sentToday: Number(sentToday.rows[0]?.count ?? 0),
    };
  }

  async sendToAllFriends(input: FriendGiftSendAllInput): Promise<{ sent: number; alreadySentToday: number }> {
    // Para taşımaz; tekrar kapısı `(sender_id, recipient_id, gift_day)`
    // tekilliğidir — eşzamanlı iki "hepsine gönder" aynı arkadaşa iki hediye
    // yazamaz.
    const inserted = await this.pool.query<{ recipient_id: string }>(
      `INSERT INTO friend_gifts (sender_id, recipient_id, amount, gift_day, created_at)
       SELECT $1::uuid, eligible.friend_id, $3::bigint, $2::date, $4::timestamptz
         FROM (${ELIGIBLE_FRIENDS_SQL}) eligible
       ON CONFLICT (sender_id, recipient_id, gift_day) DO NOTHING
       RETURNING recipient_id`,
      [input.senderId, input.dayKey, input.amount, input.now],
    );
    const already = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM friend_gifts g
        WHERE g.sender_id = $1::uuid AND g.gift_day = $2::date
          AND g.recipient_id IN (SELECT friend_id FROM (${ELIGIBLE_FRIENDS_SQL}) eligible)`,
      [input.senderId, input.dayKey],
    );
    const sent = inserted.rowCount ?? 0;
    return { sent, alreadySentToday: Math.max(0, Number(already.rows[0]?.count ?? 0) - sent) };
  }

  async collect(input: FriendGiftCollectInput): Promise<FriendGiftCollectOutcome> {
    return withTransaction(this.pool, async (client) => {
      // Oyuncu kilidi aynı oyuncunun eşzamanlı toplamalarını sıraya sokar:
      // günlük sınır KİLİT ALTINDA sayılır (iki istek sınırı ikiye katlayamaz).
      const balance = await client.query<{ money: string }>(
        'SELECT money FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.playerId],
      );
      const player = balance.rows[0];
      if (!player) return { kind: 'not_found' };
      const before = Number(player.money);

      const remaining = remainingCollects(
        await countCollectedSince(client, input.playerId, input.dayStart),
        input.dailyCollectLimit,
      );
      let collected = 0;
      let amount = 0;
      if (remaining > 0) {
        const collectId = randomUUID();
        const marked = await client.query<{ amount: string }>(
          `UPDATE friend_gifts SET collected_at = $3, collect_id = $4
            WHERE id IN (
              SELECT id FROM friend_gifts
               WHERE recipient_id = $1 AND collected_at IS NULL AND created_at >= $2
               ORDER BY created_at ASC, id ASC
               LIMIT $5
               FOR UPDATE)
           RETURNING amount`,
          [input.playerId, input.expiryCutoff, input.now, collectId, remaining],
        );
        collected = marked.rows.length;
        amount = marked.rows.reduce((sum, row) => sum + Number(row.amount), 0);
        if (amount > 0) {
          const after = credit({ money: before, gems: 0 }, amount, 'money').money;
          await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
            input.playerId,
            after,
            input.now,
          ]);
          await client.query(
            `INSERT INTO economy_transactions
               (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
             VALUES ($1, 'friend_gift_collect', $2, 'money', 'friend_gifts', $3, $4, $5)`,
            [input.playerId, after - before, collectId, before, after],
          );
        }
      }
      return {
        kind: 'ok',
        collected,
        amount,
        balanceAfter: before + amount,
        remainingCollectsToday: Math.max(0, remaining - collected),
        stillPending: await countPending(client, input.playerId, input.expiryCutoff),
      };
    });
  }
}
