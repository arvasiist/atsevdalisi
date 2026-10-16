import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { AdminPaymentOrderView, PaymentOrderStatus } from '@at-sevdalisi/shared-types';
import type { PaymentWebhookEvent } from '../../application/ports/payment-gateway';
import type {
  PaymentOrderRecord,
  PaymentOrderRepository,
  WebhookApplyResult,
} from '../../application/ports/payment-order.repository';
import { computeClawback, type WebhookEffect } from '../../domain/payments/store';
import { PG_POOL, withTransaction } from '../database/database.module';

interface OrderRow {
  id: string;
  player_id: string;
  sku: string;
  gems: string;
  chips: string;
  amount_minor: string;
  currency: string;
  status: PaymentOrderStatus;
  provider: string;
  provider_session_id: string | null;
  provider_payment_id: string | null;
  failure_code: string | null;
  clawback_shortfall_gems: string;
  clawback_shortfall_chips: string;
  created_at: Date;
  paid_at: Date | null;
  refunded_at: Date | null;
}

const COLUMNS = `id, player_id, sku, gems, chips, amount_minor, currency, status, provider, provider_session_id,
  provider_payment_id, failure_code, clawback_shortfall_gems, clawback_shortfall_chips, created_at, paid_at, refunded_at`;

// BIGINT metin döner (CLAUDE.md) — `Number(...)` şart.
function toOrder(row: OrderRow): PaymentOrderRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    sku: row.sku,
    gems: Number(row.gems),
    chips: Number(row.chips),
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    providerSessionId: row.provider_session_id,
    providerPaymentId: row.provider_payment_id,
    failureCode: row.failure_code,
    clawbackShortfallGems: Number(row.clawback_shortfall_gems),
    clawbackShortfallChips: Number(row.clawback_shortfall_chips),
    createdAt: row.created_at,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
  };
}

@Injectable()
export class PostgresPaymentOrderRepository implements PaymentOrderRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async usage(playerId: string, now: Date, pendingTtlMinutes: number) {
    const result = await this.pool.query<{ spent: string; pending: string }>(
      `SELECT
         COALESCE(SUM(amount_minor) FILTER (
           WHERE (status IN ('paid', 'refunded') AND paid_at > $2::timestamptz - interval '24 hours')
              OR (status IN ('created', 'pending') AND created_at > $2::timestamptz - ($3::int * interval '1 minute'))), 0)::text AS spent,
         COUNT(*) FILTER (
           WHERE status IN ('created', 'pending') AND created_at > $2::timestamptz - ($3::int * interval '1 minute'))::text AS pending
       FROM payment_orders WHERE player_id = $1`,
      [playerId, now, pendingTtlMinutes],
    );
    return { spentOrPendingMinor: Number(result.rows[0]!.spent), pendingCount: Number(result.rows[0]!.pending) };
  }

  async create(input: {
    id: string;
    playerId: string;
    sku: string;
    gems: number;
    chips: number;
    amountMinor: number;
    currency: string;
    provider: string;
    now: Date;
  }): Promise<PaymentOrderRecord> {
    const result = await this.pool.query<OrderRow>(
      `INSERT INTO payment_orders (id, player_id, sku, gems, chips, amount_minor, currency, status, provider, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $9, $5, $6, 'created', $7, $8, $8) RETURNING ${COLUMNS}`,
      [input.id, input.playerId, input.sku, input.gems, input.amountMinor, input.currency, input.provider, input.now, input.chips],
    );
    return toOrder(result.rows[0]!);
  }

  async attachSession(orderId: string, sessionId: string, now: Date): Promise<PaymentOrderRecord> {
    const result = await this.pool.query<OrderRow>(
      `UPDATE payment_orders SET provider_session_id = $2, status = 'pending', updated_at = $3
        WHERE id = $1 AND status = 'created' RETURNING ${COLUMNS}`,
      [orderId, sessionId, now],
    );
    return toOrder(result.rows[0]!);
  }

  async markCheckoutFailed(orderId: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE payment_orders SET status = 'failed', failure_code = 'CHECKOUT_FAILED', updated_at = $2
        WHERE id = $1 AND status = 'created'`,
      [orderId, now],
    );
  }

  async findForPlayer(playerId: string, orderId: string): Promise<PaymentOrderRecord | null> {
    const result = await this.pool.query<OrderRow>(
      `SELECT ${COLUMNS} FROM payment_orders WHERE id = $1 AND player_id = $2`,
      [orderId, playerId],
    );
    return result.rows[0] ? toOrder(result.rows[0]) : null;
  }

  async findById(orderId: string): Promise<PaymentOrderRecord | null> {
    const result = await this.pool.query<OrderRow>(`SELECT ${COLUMNS} FROM payment_orders WHERE id = $1`, [orderId]);
    return result.rows[0] ? toOrder(result.rows[0]) : null;
  }

  async listForPlayer(playerId: string, limit: number): Promise<PaymentOrderRecord[]> {
    const result = await this.pool.query<OrderRow>(
      `SELECT ${COLUMNS} FROM payment_orders WHERE player_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [playerId, limit],
    );
    return result.rows.map(toOrder);
  }

  async listForAdmin(limit: number): Promise<AdminPaymentOrderView[]> {
    const result = await this.pool.query<OrderRow & { username: string }>(
      `SELECT ${COLUMNS.split(',').map((c) => `o.${c.trim()}`).join(', ')}, p.username
         FROM payment_orders o JOIN players p ON p.id = o.player_id
        ORDER BY o.created_at DESC, o.id DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => {
      const order = toOrder(row);
      return {
        id: order.id,
        sku: order.sku,
        gems: order.gems,
        chips: order.chips,
        amountMinor: order.amountMinor,
        currency: order.currency,
        status: order.status,
        failureCode: order.failureCode,
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
        refundedAt: order.refundedAt?.toISOString() ?? null,
        playerId: order.playerId,
        username: row.username,
        provider: order.provider,
        clawbackShortfallGems: order.clawbackShortfallGems,
        clawbackShortfallChips: order.clawbackShortfallChips,
      };
    });
  }

  async applyWebhook(
    provider: string,
    event: PaymentWebhookEvent,
    decide: (order: PaymentOrderRecord) => WebhookEffect,
    now: Date,
  ): Promise<WebhookApplyResult> {
    return withTransaction(this.pool, async (client) => {
      // 1) Olay kaydı — aynı olay ikinci kez gelirse burada durur.
      const inserted = await client.query(
        `INSERT INTO payment_events (provider, event_id, event_type, outcome, received_at)
         VALUES ($1, $2, $3, 'received', $4) ON CONFLICT (provider, event_id) DO NOTHING RETURNING event_id`,
        [provider, event.eventId, event.type, now],
      );
      if (inserted.rowCount === 0) return { kind: 'duplicate' };

      // 2) Sipariş — oturum ya da ödeme kimliğiyle, AYNI sağlayıcının siparişi.
      const locked = await client.query<OrderRow>(
        `SELECT ${COLUMNS} FROM payment_orders
          WHERE provider = $1 AND (($2::text IS NOT NULL AND provider_session_id = $2) OR ($3::text IS NOT NULL AND provider_payment_id = $3))
          ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
        [provider, event.sessionId, event.paymentId],
      );
      const row = locked.rows[0];
      if (!row) {
        await setOutcome(client, provider, event.eventId, null, 'unknown_order');
        return { kind: 'unknown_order' };
      }
      const order = toOrder(row);
      const effect = decide(order);
      let updated = order;

      // 16.10.2026 — sipariş ya elmas ya çip verir (`payment_orders_one_reward`).
      const reward = rewardOf(order);
      if (effect.kind === 'mark_paid') {
        const balance = await lockPlayer(client, order.playerId, reward.currency);
        const after = balance + reward.amount;
        await client.query(`UPDATE players SET ${reward.column} = $2, updated_at = $3 WHERE id = $1`, [order.playerId, after, now]);
        await writeLedger(client, order.playerId, reward.purchaseType, reward.amount, order.id, balance, after, reward.currency);
        updated = await updateOrder(
          client,
          order.id,
          `status = 'paid', paid_at = $2::timestamptz, failure_code = NULL, provider_payment_id = COALESCE(provider_payment_id, $3::text)`,
          [now, event.paymentId],
          now,
        );
      } else if (effect.kind === 'mark_refunded') {
        const balance = await lockPlayer(client, order.playerId, reward.currency);
        const { debit: take, shortfall } = computeClawback(balance, reward.amount);
        if (take > 0) {
          const after = balance - take;
          await client.query(`UPDATE players SET ${reward.column} = $2, updated_at = $3 WHERE id = $1`, [order.playerId, after, now]);
          await writeLedger(client, order.playerId, reward.refundType, -take, order.id, balance, after, reward.currency);
        }
        updated = await updateOrder(
          client,
          order.id,
          `status = 'refunded', refunded_at = $2::timestamptz, ${reward.shortfallColumn} = $3::bigint`,
          [now, shortfall],
          now,
        );
      } else if (effect.kind === 'mark_failed') {
        updated = await updateOrder(client, order.id, `status = 'failed', failure_code = $2::text`, [effect.code], now);
      }
      await setOutcome(client, provider, event.eventId, order.id, effect.kind === 'ignore' ? effect.outcome : effect.kind);
      return { kind: 'applied', order: updated, effect };
    });
  }

  async recordRefundRequest(actorId: string, orderId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
       VALUES ($1, 'payment.refund_requested', 'payment_order', $2, '{}'::jsonb)`,
      [actorId, orderId],
    );
  }
}

/**
 * Siparişin verdiği kaynak. Sütun adları SABİT bir eşlemeden gelir (girdi değil),
 * SQL'e yalnızca bu iki değerden biri yazılır.
 */
function rewardOf(order: PaymentOrderRecord): {
  currency: 'money' | 'gems';
  column: 'money' | 'gems';
  shortfallColumn: 'clawback_shortfall_chips' | 'clawback_shortfall_gems';
  amount: number;
  purchaseType: 'chip_purchase' | 'gem_purchase';
  refundType: 'chip_purchase_refund' | 'gem_purchase_refund';
} {
  return order.chips > 0
    ? {
        currency: 'money',
        column: 'money',
        shortfallColumn: 'clawback_shortfall_chips',
        amount: order.chips,
        purchaseType: 'chip_purchase',
        refundType: 'chip_purchase_refund',
      }
    : {
        currency: 'gems',
        column: 'gems',
        shortfallColumn: 'clawback_shortfall_gems',
        amount: order.gems,
        purchaseType: 'gem_purchase',
        refundType: 'gem_purchase_refund',
      };
}

async function lockPlayer(client: PoolClient, playerId: string, currency: 'money' | 'gems'): Promise<number> {
  const result = await client.query<{ money: string; gems: string }>(
    'SELECT money, gems FROM players WHERE id = $1 FOR UPDATE',
    [playerId],
  );
  return Number(result.rows[0]![currency]);
}

async function writeLedger(
  client: PoolClient,
  playerId: string,
  type: 'gem_purchase' | 'gem_purchase_refund' | 'chip_purchase' | 'chip_purchase_refund',
  amount: number,
  orderId: string,
  before: number,
  after: number,
  currency: 'money' | 'gems',
): Promise<void> {
  await client.query(
    `INSERT INTO economy_transactions
       (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
     VALUES ($1, $2, $3, $7, 'payment_orders', $4, $5, $6)`,
    [playerId, type, amount, orderId, before, after, currency],
  );
}

async function updateOrder(
  client: PoolClient,
  orderId: string,
  assignments: string,
  values: unknown[],
  now: Date,
): Promise<PaymentOrderRecord> {
  const result = await client.query<OrderRow>(
    `UPDATE payment_orders SET ${assignments}, updated_at = $${values.length + 2}::timestamptz
      WHERE id = $1 RETURNING ${COLUMNS}`,
    [orderId, ...values, now],
  );
  return toOrder(result.rows[0]!);
}

async function setOutcome(
  client: PoolClient,
  provider: string,
  eventId: string,
  orderId: string | null,
  outcome: string,
): Promise<void> {
  await client.query('UPDATE payment_events SET order_id = $3, outcome = $4 WHERE provider = $1 AND event_id = $2', [
    provider,
    eventId,
    orderId,
    outcome,
  ]);
}
