import type { JockeyConfig } from '@at-sevdalisi/game-config';
import type { JockeyConditionView } from '@at-sevdalisi/shared-types';
import { computeJockeyCondition } from '../../domain/jockey/condition';
import type { JockeyRepository } from '../ports/jockey.repository';

/**
 * 08.10.2026 — jokeyin durumunu (form + yorgunluk) son binişlerinden okur.
 * Kadroyu donduran HER yol (lobi kilidi, pratik, eşleşme) ve oyuncunun jokey
 * ekranı AYNI fonksiyonu çağırır — ekranda görülen çarpan, bir sonraki
 * yarışın dondurulan çarpanıyla aynı kuraldan çıkar.
 */
export async function loadJockeyCondition(
  repository: JockeyRepository,
  jockeyId: string,
  now: Date,
  config: JockeyConfig,
): Promise<JockeyConditionView> {
  const { formSampleSize, fatigueWindowHours } = config.condition;
  const history = await repository.findRideHistory(jockeyId, now, formSampleSize, fatigueWindowHours);
  return computeJockeyCondition(history, config.condition);
}
