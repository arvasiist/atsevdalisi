import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { QuestMetric } from '@at-sevdalisi/shared-types';
import { credit } from '../../domain/economy/wallet';
import {
  claimId,
  type LiveEventRecord,
  type MetricWindow,
  type QuestClaimInput,
  type QuestClaimOutcome,
  type QuestRepository,
} from '../../application/ports/quest.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

/**
 * İLERLEME SORGULARI — her ölçüt mevcut tablolardan pencere içinde sayılır.
 * Yarış sahibi `COALESCE(e.player_id, h.owner_id)`: lobi katılımında
 * dondurulmuş katılımcı, pratik/PvP'de atın sahibi (sezon sıralamasıyla
 * aynı kural). Yarış penceresi `races.start_time`tır (sezonla aynı).
 * `$1` oyuncu, `$2` başlangıç (dahil), `$3` bitiş (hariç), `$4` asgari alım fiyatı.
 * Her sorgu dört parametreyi de alır; `$4`ü kullanmayanlar `$4::bigint IS NOT
 * NULL` ile tipini bildirir (Postgres kullanılmayan parametrenin tipini çıkaramaz).
 */
const RACE_BASE = `
  SELECT COUNT(*)::bigint AS count
    FROM race_entries e
    JOIN races r ON r.id = e.race_id
    LEFT JOIN horses h ON h.id = e.horse_id
   WHERE e.bot_label IS NULL
     AND COALESCE(e.player_id, h.owner_id) = $1
     AND r.status = 'finished'
     AND e.finish_position IS NOT NULL
     AND e.status IS DISTINCT FROM 'cancelled'
     AND r.start_time >= $2 AND r.start_time < $3`;

const METRIC_SQL: Record<QuestMetric, string> = {
  races_entered: `${RACE_BASE} AND $4::bigint IS NOT NULL`,
  race_wins: `${RACE_BASE} AND e.finish_position = 1 AND $4::bigint IS NOT NULL`,
  top3_finishes: `${RACE_BASE} AND e.finish_position <= 3 AND $4::bigint IS NOT NULL`,
  // Dinlenme (`rest`) bir antrenman değildir — görevi bedavaya tamamlatmasın.
  trainings: `
    SELECT COUNT(*)::bigint AS count
      FROM training_sessions t
      JOIN horses h ON h.id = t.horse_id
     WHERE h.owner_id = $1 AND t.type <> 'rest'
       AND t.created_at >= $2 AND t.created_at < $3 AND $4::bigint IS NOT NULL`,
  // Bakım günlüğü yalnızca (at, iş) başına SON zamanı tutar: aynı atta aynı
  // iş pencerede bir kez sayılır. Görev metni bu yüzden "farklı bakım işi"dir.
  care_actions: `
    SELECT COUNT(*)::bigint AS count
      FROM horse_care_log c
      JOIN horses h ON h.id = c.horse_id
     WHERE h.owner_id = $1
       AND c.last_performed_at >= $2 AND c.last_performed_at < $3 AND $4::bigint IS NOT NULL`,
  // Sabit fiyatlı alım (alıcının defter satırı) + kazanılmış müzayede
  // (satıcının satış satırı, kazanan teklif sahibi oyuncu).
  horse_purchases: `
    SELECT (
      (SELECT COUNT(*) FROM economy_transactions t
        WHERE t.player_id = $1::uuid AND t.type = 'market_purchase_debit'
          AND -t.amount >= $4 AND t.created_at >= $2 AND t.created_at < $3)
      +
      (SELECT COUNT(*) FROM economy_transactions t
         JOIN market_bids b ON b.listing_id::text = t.reference_id AND b.status = 'won'
        WHERE b.bidder_id = $1::uuid AND t.type = 'auction_sale_credit'
          AND t.amount >= $4 AND t.created_at >= $2 AND t.created_at < $3)
    )::bigint AS count`,
};

async function countMetric(
  db: Pool | PoolClient,
  playerId: string,
  window: MetricWindow,
  minPrice: number,
): Promise<number> {
  const result = await db.query<{ count: string }>(METRIC_SQL[window.metric], [
    playerId,
    window.from,
    window.to,
    minPrice,
  ]);
  return Number(result.rows[0]?.count ?? 0);
}

interface EventRow {
  id: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  reward_money: string;
  starts_at: Date;
  ends_at: Date;
  created_by: string;
  created_at: Date;
  archived_at: Date | null;
  claim_count: string;
}

const EVENT_SELECT = `
  SELECT ev.id, ev.title, ev.description, ev.metric, ev.target, ev.reward_money, ev.starts_at, ev.ends_at,
         ev.created_by, ev.created_at, ev.archived_at,
         (SELECT COUNT(*) FROM quest_claims q WHERE q.live_event_id = ev.id)::bigint AS claim_count
    FROM live_events ev`;

/** Etkinlik açılışlarını sıraya sokan danışma kilidi (sayım + ekleme atomik). */
const EVENT_LOCK_KEY = 60_002;

function toEvent(row: EventRow): LiveEventRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    metric: row.metric,
    target: row.target,
    // BIGINT metin döner (CLAUDE.md) — `Number(...)` şart.
    rewardMoney: Number(row.reward_money),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    claimCount: Number(row.claim_count),
  };
}

@Injectable()
export class PostgresQuestRepository implements QuestRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async countMetrics(playerId: string, windows: MetricWindow[], minPrice: number): Promise<number[]> {
    return Promise.all(windows.map((window) => countMetric(this.pool, playerId, window, minPrice)));
  }

  async findClaims(playerId: string, since: Date): Promise<Set<string>> {
    const result = await this.pool.query<{ quest_key: string; period_start: Date }>(
      'SELECT quest_key, period_start FROM quest_claims WHERE player_id = $1 AND period_start >= $2',
      [playerId, since],
    );
    return new Set(result.rows.map((row) => claimId(row.quest_key, row.period_start)));
  }

  async claim(input: QuestClaimInput): Promise<QuestClaimOutcome> {
    return withTransaction(this.pool, async (client) => {
      // Etkinlik kapısı KİLİT ALTINDA: yönetici arşivlerken ödeme yarışmasın.
      if (input.liveEventId !== null) {
        const event = await client.query<{ archived_at: Date | null; starts_at: Date }>(
          'SELECT archived_at, starts_at FROM live_events WHERE id = $1 FOR SHARE',
          [input.liveEventId],
        );
        const row = event.rows[0];
        if (
          !row ||
          row.archived_at !== null ||
          row.starts_at.getTime() > input.now.getTime() ||
          (input.claimableUntil !== null && input.now.getTime() >= input.claimableUntil.getTime())
        ) {
          return { kind: 'not_found' };
        }
      }
      // Oyuncu kilidi aynı oyuncunun eşzamanlı taleplerini sıraya sokar.
      const balance = await client.query<{ money: string }>(
        'SELECT money FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.playerId],
      );
      const player = balance.rows[0];
      if (!player) return { kind: 'not_found' };
      const progress = await countMetric(client, input.playerId, input.progressWindow, input.horsePurchaseMinPrice);
      if (progress < input.target) return { kind: 'not_completed', progress };
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO quest_claims (player_id, quest_key, period_start, live_event_id, reward_money, claimed_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ON CONSTRAINT quest_claims_once_uq DO NOTHING
         RETURNING id`,
        [input.playerId, input.questKey, input.periodStart, input.liveEventId, input.rewardMoney, input.now],
      );
      const claimRow = inserted.rows[0];
      if (!claimRow) return { kind: 'already_claimed' };
      const before = Number(player.money);
      const after = credit({ money: before, gems: 0 }, input.rewardMoney, 'money').money;
      await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
        input.playerId,
        after,
        input.now,
      ]);
      await client.query(
        `INSERT INTO economy_transactions
           (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
         VALUES ($1, $2, $3, 'money', 'quest_claims', $4, $5, $6)`,
        [input.playerId, input.ledgerType, after - before, claimRow.id, before, after],
      );
      return { kind: 'paid', rewardMoney: after - before, balanceAfter: after };
    });
  }

  async listVisibleEvents(now: Date, claimGraceMs: number): Promise<LiveEventRecord[]> {
    const result = await this.pool.query<EventRow>(
      `${EVENT_SELECT}
        WHERE ev.archived_at IS NULL AND ev.starts_at <= $1
          AND ev.ends_at + ($2::bigint * interval '1 millisecond') > $1
        ORDER BY ev.ends_at ASC`,
      [now, claimGraceMs],
    );
    return result.rows.map(toEvent);
  }

  async listEventsForAdmin(limit: number): Promise<LiveEventRecord[]> {
    const result = await this.pool.query<EventRow>(`${EVENT_SELECT} ORDER BY ev.created_at DESC LIMIT $1`, [limit]);
    return result.rows.map(toEvent);
  }

  async createEvent(input: Parameters<QuestRepository['createEvent']>[0]): Promise<LiveEventRecord | 'limit_reached'> {
    return withTransaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [EVENT_LOCK_KEY]);
      const overlapping = await client.query<{ count: string }>(
        `SELECT COUNT(*)::bigint AS count FROM live_events
          WHERE archived_at IS NULL AND ends_at > $1 AND starts_at < $2`,
        [input.startsAt, input.endsAt],
      );
      if (Number(overlapping.rows[0]!.count) >= input.maxLive) return 'limit_reached';
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO live_events (title, description, metric, target, reward_money, starts_at, ends_at, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          input.title,
          input.description,
          input.metric,
          input.target,
          input.rewardMoney,
          input.startsAt,
          input.endsAt,
          input.actorId,
          input.now,
        ],
      );
      const id = inserted.rows[0]!.id;
      // Denetim kaydı AYNI transaction'da (CLAUDE.md).
      await client.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, 'live_event.created', 'live_event', $2, $3::jsonb)`,
        [
          input.actorId,
          id,
          JSON.stringify({
            title: input.title,
            metric: input.metric,
            target: input.target,
            rewardMoney: input.rewardMoney,
          }),
        ],
      );
      const created = await client.query<EventRow>(`${EVENT_SELECT} WHERE ev.id = $1`, [id]);
      return toEvent(created.rows[0]!);
    });
  }

  async archiveEvent(actorId: string, eventId: string, now: Date): Promise<LiveEventRecord | null> {
    return withTransaction(this.pool, async (client) => {
      const updated = await client.query<{ id: string }>(
        `UPDATE live_events SET archived_at = $2, archived_by = $3
          WHERE id = $1 AND archived_at IS NULL RETURNING id`,
        [eventId, now, actorId],
      );
      if (updated.rows.length === 0) return null;
      await client.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, 'live_event.archived', 'live_event', $2, '{}'::jsonb)`,
        [actorId, eventId],
      );
      const row = await client.query<EventRow>(`${EVENT_SELECT} WHERE ev.id = $1`, [eventId]);
      return toEvent(row.rows[0]!);
    });
  }
}
