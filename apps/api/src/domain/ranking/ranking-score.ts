/**
 * Sıralama puanı (RankingScore) — brief §43 SIRALAMA:
 *   RankingScore = RacePerformance + WinBonus + PlacementBonus + TournamentBonus
 *
 * Fonksiyon saftır; DB/zaman erişimi yoktur. `config.ranking.
 * placementBonusByPlacement` listesinde olmayan bir derece (örn. 4. veya
 * daha geri) 0 bonus alır — brief'te üst sınır belirtilmemiştir, bu proje-içi
 * bir tasarım kararıdır (sadece ilk 3 derece ekstra ödüllendirilir, tıpkı
 * gerçek at yarışlarındaki "plaje giren" mantığı gibi).
 */

import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type { RankingScoreInput } from '@at-sevdalisi/shared-types';

export function calculateRankingScore(input: RankingScoreInput, config: OnlineConfig): number {
  const { racePerformanceWeight, winBonus, placementBonusByPlacement, tournamentBonusMultiplier } = config.ranking;

  const racePerformanceComponent = input.racePerformanceScore * racePerformanceWeight;
  const winBonusComponent = input.isWin ? winBonus : 0;
  const placementBonusComponent =
    input.placement !== null ? placementBonusByPlacement[String(input.placement)] ?? 0 : 0;
  const tournamentBonusComponent = input.tournamentBonus * tournamentBonusMultiplier;

  return Math.round(
    racePerformanceComponent + winBonusComponent + placementBonusComponent + tournamentBonusComponent,
  );
}
