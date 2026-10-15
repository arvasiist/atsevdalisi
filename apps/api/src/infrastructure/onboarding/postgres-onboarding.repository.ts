import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { ONBOARDING_STEP_KEYS, type OnboardingStepKey } from '@at-sevdalisi/shared-types';
import type { OnboardingRepository } from '../../application/ports/onboarding.repository';
import { PG_POOL } from '../database/database.module';

/**
 * 15.10.2026 — S6: her adımın "yapıldı" ölçütü. SAYAÇ YOK — görev ve
 * başarımlarla aynı kaynaklar, aynı sahiplik kuralı (işi YAPAN oyuncu:
 * `COALESCE(<yapan>, h.owner_id)`; at satılsa da adım satıcıda kalır).
 * `Record` tam olmak zorundadır: yeni bir anahtar eklenip SQL'i yazılmazsa tsc durur.
 */
const STEP_SQL: Record<OnboardingStepKey, string> = {
  care: `EXISTS (SELECT 1 FROM horse_care_log c JOIN horses h ON h.id = c.horse_id
                  WHERE COALESCE(c.performed_by, h.owner_id) = $1)`,
  // Dinlenme bir antrenman değildir (görev kuralıyla aynı).
  train: `EXISTS (SELECT 1 FROM training_sessions t JOIN horses h ON h.id = t.horse_id
                   WHERE COALESCE(t.player_id, h.owner_id) = $1 AND t.type <> 'rest')`,
  // Şu an jokeyi var YA DA bir kez ücretli kiralamış (bırakınca adım geri gitmez).
  jockey: `(EXISTS (SELECT 1 FROM jockeys j WHERE j.owner_id = $1)
            OR EXISTS (SELECT 1 FROM economy_transactions x WHERE x.player_id = $1 AND x.type = 'jockey_hire'))`,
  // Bitmiş herhangi bir yarış (pratik dahil) — görevlerin `races_entered` tabanı.
  race: `EXISTS (SELECT 1 FROM race_entries e JOIN races r ON r.id = e.race_id
                  LEFT JOIN horses h ON h.id = e.horse_id
                  WHERE e.bot_label IS NULL AND COALESCE(e.player_id, h.owner_id) = $1
                    AND r.status = 'finished' AND e.finish_position IS NOT NULL
                    AND e.status IS DISTINCT FROM 'cancelled')`,
  daily_reward: `EXISTS (SELECT 1 FROM players p WHERE p.id = $1 AND p.last_daily_reward_claimed_at IS NOT NULL)`,
  quest_reward: `EXISTS (SELECT 1 FROM quest_claims q WHERE q.player_id = $1)`,
  // Lobi katılımının durum sütunu doludur (pratik/PvP satırlarında NULL — migration 0037).
  lobby_race: `EXISTS (SELECT 1 FROM race_entries e JOIN races r ON r.id = e.race_id
                        WHERE e.player_id = $1 AND e.status IS NOT NULL AND e.status <> 'cancelled'
                          AND r.status = 'finished' AND e.finish_position IS NOT NULL)`,
};

@Injectable()
export class PostgresOnboardingRepository implements OnboardingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findCompletedSteps(playerId: string): Promise<Set<OnboardingStepKey>> {
    // Tek sorgu, her adım bir sütun — anahtar listesi SABİT (kullanıcı girdisi SQL'e girmez).
    const columns = ONBOARDING_STEP_KEYS.map((key) => `${STEP_SQL[key]} AS "${key}"`).join(',\n       ');
    const result = await this.pool.query<Record<OnboardingStepKey, boolean>>(`SELECT ${columns}`, [playerId]);
    const row = result.rows[0];
    const done = new Set<OnboardingStepKey>();
    if (row === undefined) return done;
    for (const key of ONBOARDING_STEP_KEYS) {
      if (row[key] === true) done.add(key);
    }
    return done;
  }
}
