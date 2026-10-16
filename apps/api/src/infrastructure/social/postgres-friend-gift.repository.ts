import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  FriendGiftBoardFacts,
  FriendGiftBoardQuery,
  FriendGiftCollectInput,
  FriendGiftCollectOutcome,
  FriendGiftRecipientFacts,
  FriendGiftRepository,
  FriendGiftSendAllInput,
  FriendGiftSendAllOutcome,
} from '../../application/ports/friend-gift.repository';
import { credit, debit } from '../../domain/economy/wallet';
import { planFriendGiftSend, remainingCollects } from '../../domain/social/friend-gift';
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
      WHERE recipient_id = $1 AND collected_at IS NULL AND refunded_at IS NULL AND created_at >= $2`,
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

interface RecipientRow {
  id: string;
  username: string;
  display_name: string;
}

const toRecipient = (row: RecipientRow): FriendGiftRecipientFacts => ({
  playerId: row.id,
  username: row.username,
  displayName: row.display_name,
});

/**
 * Uygun arkadaşlar, bugün hediye gönderilmiş/gönderilmemiş diye ayrılmış.
 * Gönderim sırası kullanıcı adına göredir (önizleme ile gönderim AYNI sırayı
 * kullanır → ekranda "şunlara gidecek" denen kişilere gider).
 */
async function eligibleSplit(
  db: Pool | PoolClient,
  senderId: string,
  dayKey: string,
): Promise<{ unsent: FriendGiftRecipientFacts[]; alreadySent: FriendGiftRecipientFacts[] }> {
  const result = await db.query<RecipientRow & { sent_today: boolean }>(
    `SELECT o.id, o.username, o.display_name,
            EXISTS (SELECT 1 FROM friend_gifts g
                     WHERE g.sender_id = $1::uuid AND g.recipient_id = o.id AND g.gift_day = $2::date) AS sent_today
       FROM (${ELIGIBLE_FRIENDS_SQL}) eligible
       JOIN players o ON o.id = eligible.friend_id
      ORDER BY o.username ASC, o.id ASC`,
    [senderId, dayKey],
  );
  return {
    unsent: result.rows.filter((row) => !row.sent_today).map(toRecipient),
    alreadySent: result.rows.filter((row) => row.sent_today).map(toRecipient),
  };
}

async function spentOnDay(db: Pool | PoolClient, senderId: string, dayKey: string): Promise<number> {
  const result = await db.query<{ total: string | null }>(
    'SELECT SUM(sender_paid)::bigint AS total FROM friend_gifts WHERE sender_id = $1 AND gift_day = $2::date',
    [senderId, dayKey],
  );
  return Number(result.rows[0]?.total ?? 0);
}

@Injectable()
export class PostgresFriendGiftRepository implements FriendGiftRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async board(query: FriendGiftBoardQuery): Promise<FriendGiftBoardFacts> {
    const [collectedToday, pendingTotals, pending, split, spentToday, balance] = await Promise.all([
      countCollectedSince(this.pool, query.playerId, query.dayStart),
      this.pool.query<{ count: string; total: string | null }>(
        `SELECT COUNT(*)::bigint AS count, SUM(amount)::bigint AS total FROM friend_gifts
          WHERE recipient_id = $1 AND collected_at IS NULL AND refunded_at IS NULL AND created_at >= $2`,
        [query.playerId, query.expiryCutoff],
      ),
      this.pool.query<PendingRow>(
        `SELECT g.id, g.sender_id, p.username, p.display_name, g.amount, g.created_at
           FROM friend_gifts g JOIN players p ON p.id = g.sender_id
          WHERE g.recipient_id = $1 AND g.collected_at IS NULL AND g.refunded_at IS NULL AND g.created_at >= $2
          ORDER BY g.created_at ASC, g.id ASC LIMIT $3`,
        [query.playerId, query.expiryCutoff, query.pendingLimit],
      ),
      eligibleSplit(this.pool, query.playerId, query.dayKey),
      spentOnDay(this.pool, query.playerId, query.dayKey),
      this.pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [query.playerId]),
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
      friendCount: split.unsent.length + split.alreadySent.length,
      sentToday: split.alreadySent.length,
      spentToday,
      balance: Number(balance.rows[0]?.money ?? 0),
      unsent: split.unsent,
    };
  }

  async sendToAllFriends(input: FriendGiftSendAllInput): Promise<FriendGiftSendAllOutcome> {
    // 16.10.2026 — PARA YOLU (gönderen öder). Sıra: gönderen `FOR UPDATE` →
    // süresi dolmuş ödenmiş hediyelerin iadesi → günlük harcama + bakiye KİLİT
    // ALTINDA → satırlar + tek `friend_gift_send` defter satırı, hepsi tek
    // transaction. Aynı gönderenin eşzamanlı iki basışı kilitte sıraya girer;
    // ikincisi bütçeyi ve "bugün gönderildi"yi yeniden okur → çift tahsilat
    // yok. `(sender, recipient, gift_day)` tekilliği ikinci savunma hattıdır.
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query<{ money: string; username: string; display_name: string }>(
        'SELECT money, username, display_name FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.senderId],
      );
      const row = locked.rows[0];
      if (!row) return { kind: 'not_found' };
      let balance = Number(row.money);

      const refundedRows = await client.query<{ sender_paid: string }>(
        `UPDATE friend_gifts SET refunded_at = $3
          WHERE sender_id = $1 AND collected_at IS NULL AND refunded_at IS NULL
            AND sender_paid > 0 AND created_at < $2
        RETURNING sender_paid`,
        [input.senderId, input.expiryCutoff, input.now],
      );
      const refunded = refundedRows.rows.reduce((sum, gift) => sum + Number(gift.sender_paid), 0);
      if (refunded > 0) {
        const after = credit({ money: balance, gems: 0 }, refunded, 'money').money;
        await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
          input.senderId,
          after,
          input.now,
        ]);
        // Referans: iade edilen satırlar (sender_id, refunded_at) ile bulunur.
        await client.query(
          `INSERT INTO economy_transactions
             (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
           VALUES ($1, 'friend_gift_refund', $2, 'money', 'friend_gifts_refund', $3, $4, $5)`,
          [input.senderId, refunded, input.now.toISOString(), balance, after],
        );
        balance = after;
      }

      const split = await eligibleSplit(client, input.senderId, input.dayKey);
      const plan = planFriendGiftSend({
        amount: input.amount,
        dailySendBudget: input.dailySendBudget,
        spentToday: await spentOnDay(client, input.senderId, input.dayKey),
        balance,
        candidates: split.unsent.length,
      });
      const chosen = split.unsent.slice(0, plan.maxRecipients);
      const skipped = split.unsent.slice(plan.maxRecipients);

      let sent: FriendGiftRecipientFacts[] = [];
      if (chosen.length > 0) {
        const sendId = randomUUID();
        const inserted = await client.query<{ recipient_id: string }>(
          `INSERT INTO friend_gifts (sender_id, recipient_id, amount, sender_paid, send_id, gift_day, created_at)
           SELECT $1::uuid, recipient, $3::bigint, $3::bigint, $4::uuid, $2::date, $5::timestamptz
             FROM unnest($6::uuid[]) AS recipient
           ON CONFLICT (sender_id, recipient_id, gift_day) DO NOTHING
           RETURNING recipient_id`,
          [input.senderId, input.dayKey, input.amount, sendId, input.now, chosen.map((friend) => friend.playerId)],
        );
        const insertedIds = new Set(inserted.rows.map((gift) => gift.recipient_id));
        sent = chosen.filter((friend) => insertedIds.has(friend.playerId));
        const cost = sent.length * input.amount;
        if (cost > 0) {
          const after = debit({ money: balance, gems: 0 }, cost, 'money').money;
          await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
            input.senderId,
            after,
            input.now,
          ]);
          await client.query(
            `INSERT INTO economy_transactions
               (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
             VALUES ($1, 'friend_gift_send', $2, 'money', 'friend_gifts', $3, $4, $5)`,
            [input.senderId, after - balance, sendId, balance, after],
          );
          balance = after;
          // 16.10.2026 (brief §6.4) — alıcıya haber, hediye satırlarıyla AYNI
          // transaction'da (geri alınan gönderimin bildirimi kalmasın). Canlı
          // yayını COMMIT'teki tetikleyici yapar (migration 0088).
          await client.query(
            `INSERT INTO notifications (player_id, type, payload)
             SELECT g.recipient_id, 'friend_gift_received',
                    jsonb_build_object('giftId', g.id, 'senderId', $2::text, 'senderUsername', $3::text,
                                       'senderName', $4::text, 'amount', g.amount)
               FROM friend_gifts g
              WHERE g.send_id = $1`,
            [sendId, input.senderId, row.username, row.display_name],
          );
        }
      }
      return {
        kind: 'ok',
        sent,
        alreadySent: split.alreadySent,
        skipped,
        limitedBy: plan.limitedBy,
        cost: sent.length * input.amount,
        refunded,
        balanceAfter: balance,
      };
    });
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
               WHERE recipient_id = $1 AND collected_at IS NULL AND refunded_at IS NULL AND created_at >= $2
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
