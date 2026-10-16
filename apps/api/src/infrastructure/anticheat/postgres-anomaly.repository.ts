import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AnomalyRule } from '@at-sevdalisi/shared-types';
import type { AnomalyQuery, AnomalyRepository, RawAnomalyFinding } from '../../application/ports/anomaly.repository';
import { PG_POOL } from '../database/database.module';

/**
 * Şüpheli desen sorguları (02.10.2026, Faz 7). Yalnızca OKUR. Hepsi kayıtlı
 * olgulardan (hediye, defter, teklif) sayılır — tahmin ya da puan yoktur.
 * "Yeni hesap" = işlem ANINDA hesabın yaşı `newAccountDays`ten küçük.
 */
const GIFT_FUNNEL_SQL = `
  SELECT g.recipient_id AS subject_id,
         array_agg(DISTINCT g.sender_id::text) AS counterpart_ids,
         COUNT(*)::int AS count,
         COALESCE(SUM(g.amount) FILTER (WHERE g.currency = 'money'), 0)::float8 AS total_money,
         COALESCE(SUM(g.amount) FILTER (WHERE g.currency = 'gems'), 0)::float8 AS total_gems,
         MIN(g.created_at) AS first_at, MAX(g.created_at) AS last_at
    FROM gift_sends g
    JOIN players s ON s.id = g.sender_id
   WHERE g.created_at >= $1
     AND g.created_at - s.created_at < make_interval(days => $2)
   GROUP BY g.recipient_id
  HAVING COUNT(DISTINCT g.sender_id) >= $3
   ORDER BY COUNT(DISTINCT g.sender_id) DESC, COUNT(*) DESC
   LIMIT $4`;

/** Sabit fiyatlı alım (alıcının defter satırı) + kazanılmış müzayede (satıcının satış satırı). */
const REPEAT_TRADE_SQL = `
  WITH sales AS (
    SELECT l.seller_id, t.player_id AS buyer_id, -t.amount AS amount, t.created_at
      FROM economy_transactions t
      JOIN market_listings l ON l.id::text = t.reference_id
     WHERE t.type = 'market_purchase_debit' AND t.created_at >= $1
    UNION ALL
    SELECT t.player_id AS seller_id, b.bidder_id AS buyer_id, t.amount, t.created_at
      FROM economy_transactions t
      JOIN market_bids b ON b.listing_id::text = t.reference_id AND b.status = 'won'
     WHERE t.type = 'auction_sale_credit' AND t.created_at >= $1
  )
  SELECT seller_id AS subject_id, ARRAY[buyer_id::text] AS counterpart_ids, COUNT(*)::int AS count,
         SUM(amount)::float8 AS total_money, 0::float8 AS total_gems,
         MIN(created_at) AS first_at, MAX(created_at) AS last_at
    FROM sales
   GROUP BY seller_id, buyer_id
  HAVING COUNT(*) >= $2
   ORDER BY COUNT(*) DESC
   LIMIT $3`;

const NEW_ACCOUNT_OUTFLOW_SQL = `
  SELECT g.sender_id AS subject_id,
         array_agg(DISTINCT g.recipient_id::text) AS counterpart_ids,
         COUNT(*)::int AS count,
         COALESCE(SUM(g.amount) FILTER (WHERE g.currency = 'money'), 0)::float8 AS total_money,
         COALESCE(SUM(g.amount) FILTER (WHERE g.currency = 'gems'), 0)::float8 AS total_gems,
         MIN(g.created_at) AS first_at, MAX(g.created_at) AS last_at
    FROM gift_sends g
    JOIN players s ON s.id = g.sender_id
   WHERE g.created_at >= $1
     AND g.created_at - s.created_at < make_interval(days => $2)
   GROUP BY g.sender_id
  HAVING COALESCE(SUM(g.amount) FILTER (WHERE g.currency = 'money'), 0) >= $3
   ORDER BY 4 DESC
   LIMIT $4`;

interface Row {
  subject_id: string;
  counterpart_ids: string[];
  count: number;
  total_money: number;
  total_gems: number;
  first_at: Date;
  last_at: Date;
}

function toFinding(rule: AnomalyRule, row: Row): RawAnomalyFinding {
  return {
    rule,
    subjectId: row.subject_id,
    counterpartIds: row.counterpart_ids,
    count: row.count,
    totalMoney: row.total_money,
    totalGems: row.total_gems,
    firstAt: row.first_at,
    lastAt: row.last_at,
  };
}

@Injectable()
export class PostgresAnomalyRepository implements AnomalyRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAnomalies(query: AnomalyQuery): Promise<RawAnomalyFinding[]> {
    const [funnel, pairs, outflow] = await Promise.all([
      this.pool.query<Row>(GIFT_FUNNEL_SQL, [query.since, query.newAccountDays, query.minDistinctNewSenders, query.limit]),
      this.pool.query<Row>(REPEAT_TRADE_SQL, [query.since, query.minPairTrades, query.limit]),
      this.pool.query<Row>(NEW_ACCOUNT_OUTFLOW_SQL, [query.since, query.newAccountDays, query.minOutflowMoney, query.limit]),
    ]);
    return [
      ...funnel.rows.map((row) => toFinding('gift_funnel', row)),
      ...pairs.rows.map((row) => toFinding('repeat_trade_pair', row)),
      ...outflow.rows.map((row) => toFinding('new_account_outflow', row)),
    ];
  }

  async findPlayers(ids: string[]): Promise<Array<{ id: string; username: string; createdAt: Date }>> {
    if (ids.length === 0) return [];
    const result = await this.pool.query<{ id: string; username: string; created_at: Date }>(
      'SELECT id, username, created_at FROM players WHERE id = ANY($1::uuid[])',
      [ids],
    );
    return result.rows.map((row) => ({ id: row.id, username: row.username, createdAt: row.created_at }));
  }
}
