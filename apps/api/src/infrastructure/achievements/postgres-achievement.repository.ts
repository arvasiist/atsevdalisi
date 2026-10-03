import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { AchievementMetric } from '@at-sevdalisi/shared-types';
import { credit } from '../../domain/economy/wallet';
import type {
  AchievementClaimInput,
  AchievementClaimOutcome,
  AchievementRepository,
} from '../../application/ports/achievement.repository';
import { PG_POOL, withTransaction } from '../database/database.module';
import { countMetric } from '../quests/postgres-quest.repository';

/** Yaşam boyu pencere: oyunun başlangıcından yarına (bitiş hariç). */
const LIFETIME_START = new Date(0);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * İlerleme: yarış/alım ölçütleri görevlerin SAYIM MOTORUNU kullanır
 * (`countMetric`, aynı SQL) — ikinci bir sayım kodu yazılmaz, yani görev ile
 * başarım aynı yarışı farklı saymaz. `player_level` oyuncu satırından okunur.
 */
async function measure(
  db: Pool | PoolClient,
  playerId: string,
  metric: AchievementMetric,
  minPrice: number,
  now: Date,
): Promise<number> {
  if (metric === 'player_level') {
    const result = await db.query<{ level: number }>('SELECT level FROM players WHERE id = $1', [playerId]);
    return result.rows[0]?.level ?? 0;
  }
  return countMetric(
    db,
    playerId,
    { metric, from: LIFETIME_START, to: new Date(now.getTime() + ONE_DAY_MS) },
    minPrice,
  );
}

@Injectable()
export class PostgresAchievementRepository implements AchievementRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async progress(playerId: string, metrics: AchievementMetric[], minPrice: number, now: Date): Promise<number[]> {
    // Aynı ölçüt birden çok başarımda geçer — her ölçüt bir kez sayılır.
    const unique = [...new Set(metrics)];
    const values = await Promise.all(unique.map((metric) => measure(this.pool, playerId, metric, minPrice, now)));
    const byMetric = new Map(unique.map((metric, index) => [metric, values[index] ?? 0]));
    return metrics.map((metric) => byMetric.get(metric) ?? 0);
  }

  async claimedKeys(playerId: string): Promise<Set<string>> {
    const result = await this.pool.query<{ achievement_key: string }>(
      'SELECT achievement_key FROM achievement_claims WHERE player_id = $1',
      [playerId],
    );
    return new Set(result.rows.map((row) => row.achievement_key));
  }

  async claim(input: AchievementClaimInput): Promise<AchievementClaimOutcome> {
    return withTransaction(this.pool, async (client) => {
      // Oyuncu kilidi aynı oyuncunun eşzamanlı taleplerini sıraya sokar.
      const balance = await client.query<{ money: string }>(
        'SELECT money FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.playerId],
      );
      const player = balance.rows[0];
      if (!player) return { kind: 'not_found' };
      const progress = await measure(client, input.playerId, input.metric, input.horsePurchaseMinPrice, input.now);
      if (progress < input.target) return { kind: 'not_completed', progress };
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO achievement_claims (player_id, achievement_key, reward_money, claimed_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id, achievement_key) DO NOTHING
         RETURNING id`,
        [input.playerId, input.achievementKey, input.rewardMoney, input.now],
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
         VALUES ($1, 'achievement_reward', $2, 'money', 'achievement_claims', $3, $4, $5)`,
        [input.playerId, after - before, claimRow.id, before, after],
      );
      return { kind: 'paid', rewardMoney: after - before, balanceAfter: after };
    });
  }

  async claimedForProfile(playerId: string, limit: number): Promise<Array<{ key: string; claimedAt: Date }>> {
    const result = await this.pool.query<{ achievement_key: string; claimed_at: Date }>(
      `SELECT achievement_key, claimed_at FROM achievement_claims
        WHERE player_id = $1 ORDER BY claimed_at DESC, achievement_key ASC LIMIT $2`,
      [playerId, limit],
    );
    return result.rows.map((row) => ({ key: row.achievement_key, claimedAt: row.claimed_at }));
  }
}
