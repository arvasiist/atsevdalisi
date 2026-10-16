import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  AdminHorseView,
  AdminSeasonView,
  AdminTournamentView,
  BalanceAdjustmentResult,
} from '@at-sevdalisi/shared-types';
import type { AdminOpsRepository, BalanceAdjustmentInput } from '../../application/ports/admin-ops.repository';
import { credit, debit } from '../../domain/economy/wallet';
import { PG_POOL, withTransaction } from '../database/database.module';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HorseRow {
  id: string;
  name: string;
  owner_id: string | null;
  owner_username: string | null;
  gender: string;
  breed: string | null;
  birth_date: Date | null;
  level: number;
  status: string;
  health: string;
  fitness: string;
  energy: string;
  created_at: Date;
}

/** `LIKE` joker karakterlerini kaçırır — kullanıcının `%`'si "her şey" anlamına gelmesin. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class PostgresAdminOpsRepository implements AdminOpsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async adjustBalance(input: BalanceAdjustmentInput): Promise<BalanceAdjustmentResult | null> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query<{ money: string; gems: string }>(
        'SELECT money, gems FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.playerId],
      );
      const row = locked.rows[0];
      if (!row) return null;
      const before = { money: Number(row.money), gems: Number(row.gems) };
      const after =
        input.amount > 0
          ? credit(before, input.amount, input.currency)
          : debit(before, -input.amount, input.currency); // yetmezse InsufficientFundsError → geri alınır
      await client.query(`UPDATE players SET ${input.currency} = $2, updated_at = now() WHERE id = $1`, [
        input.playerId,
        after[input.currency],
      ]);
      // Önce denetim kaydı (kim, neden) — defter satırı ona bağlanır.
      const audit = await client.query<{ id: string }>(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, 'player.balance_adjusted', 'player', $2, $3::jsonb) RETURNING id`,
        [
          input.actorId,
          input.playerId,
          JSON.stringify({
            currency: input.currency,
            amount: input.amount,
            reason: input.reason,
            balanceBefore: before[input.currency],
            balanceAfter: after[input.currency],
          }),
        ],
      );
      const auditId = audit.rows[0]!.id;
      const ledger = await client.query<{ id: string }>(
        `INSERT INTO economy_transactions
           (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after, idempotency_key)
         VALUES ($1, 'admin_adjustment', $2, $3, 'admin_audit_log', $4, $5, $6, $7) RETURNING id`,
        [
          input.playerId,
          input.amount,
          input.currency,
          auditId,
          before[input.currency],
          after[input.currency],
          input.idempotencyKey,
        ],
      );
      return {
        transactionId: ledger.rows[0]!.id,
        auditId,
        currency: input.currency,
        amount: input.amount,
        balanceBefore: before[input.currency],
        balanceAfter: after[input.currency],
      };
    });
  }

  async searchHorses(query: string, limit: number): Promise<AdminHorseView[]> {
    const byId = UUID_PATTERN.test(query);
    const result = await this.pool.query<HorseRow>(
      `SELECT h.id, h.name, h.owner_id, p.username AS owner_username, h.gender, h.breed, h.birth_date,
              h.level, h.status, h.health, h.fitness, h.energy, h.created_at
         FROM horses h LEFT JOIN players p ON p.id = h.owner_id
        WHERE ${byId ? 'h.id = $1::uuid OR h.owner_id = $1::uuid' : "h.name ILIKE '%' || $1 || '%' ESCAPE '\\' OR p.username ILIKE $1 ESCAPE '\\'"}
        ORDER BY h.created_at DESC
        LIMIT $2`,
      [byId ? query : escapeLike(query), limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      owner: row.owner_id && row.owner_username ? { playerId: row.owner_id, username: row.owner_username } : null,
      gender: row.gender,
      breed: row.breed,
      birthDate: row.birth_date ? row.birth_date.toISOString() : null,
      level: row.level,
      status: row.status,
      // NUMERIC metin döner (CLAUDE.md) — `Number(...)` şart.
      health: Number(row.health),
      fitness: Number(row.fitness),
      energy: Number(row.energy),
      createdAt: row.created_at.toISOString(),
    }));
  }

  async listSeasons(limit: number, now: Date): Promise<AdminSeasonView[]> {
    const result = await this.pool.query<{
      id: string;
      number: number;
      name: string;
      starts_at: Date;
      ends_at: Date;
      rewards_paid_at: Date | null;
    }>('SELECT id, number, name, starts_at, ends_at, rewards_paid_at FROM seasons ORDER BY number DESC LIMIT $1', [
      limit,
    ]);
    return result.rows.map((row) => ({
      id: row.id,
      number: row.number,
      name: row.name,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
      rewardsPaidAt: row.rewards_paid_at?.toISOString() ?? null,
      state:
        row.starts_at.getTime() > now.getTime() ? 'upcoming' : row.ends_at.getTime() > now.getTime() ? 'current' : 'ended',
    }));
  }

  async listTournaments(limit: number): Promise<AdminTournamentView[]> {
    const result = await this.pool.query<{
      id: string;
      race_id: string;
      race_name: string;
      tier: string;
      min_player_level: number;
      race_status: string;
      start_time: Date;
      participants: string;
      prize_pool: string;
    }>(
      `SELECT t.id, t.race_id, r.name AS race_name, t.tier, t.min_player_level, r.status AS race_status,
              r.start_time, r.prize_pool,
              (SELECT COUNT(*) FROM race_entries e
                WHERE e.race_id = r.id AND e.player_id IS NOT NULL AND e.status IS DISTINCT FROM 'cancelled') AS participants
         FROM tournaments t JOIN races r ON r.id = t.race_id
        ORDER BY r.start_time DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      raceId: row.race_id,
      raceName: row.race_name,
      tier: row.tier,
      minPlayerLevel: row.min_player_level,
      raceStatus: row.race_status,
      startTime: row.start_time.toISOString(),
      // BIGINT/COUNT metin döner (CLAUDE.md).
      participants: Number(row.participants),
      prizePool: Number(row.prize_pool),
    }));
  }
}
