/**
 * Geçiş (overtake) ve kulvar (lane) sistemi — brief §21, docs/ALGORITHMS.md
 * §6. FAZ 1'in stil-bazlı sabit `trafficRisk` yaklaşımının yerini alır:
 * bloklanma artık atların BİRBİRİNE GÖRE gerçek zaman farkına (standings) ve
 * paylaştıkları kulvara bakılarak belirlenir (bkz. `docs/ALGORITHMS.md`
 * §6'daki brief pseudocode'u: acceleration + speed_difference + courage +
 * jockey_skill + available_space - traffic_penalty).
 *
 * **Uygulama notu:** brief'in ayrı ayrı listelediği "available_space" ve
 * "traffic_penalty" terimleri burada TEK bir sinyalde birleştirilmiştir:
 * `availableSpace`, aynı kulvarı paylaşan diğer atların sayısına göre
 * ZATEN azalır (`spacePerOccupant`) — ayrı bir "traffic_penalty" ağırlığı
 * eklemek aynı fiziksel olguyu iki kez saymak olurdu.
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { RacingStyle, RiskLevel } from '@at-sevdalisi/shared-types';

export interface OvertakeAttemptInput {
  attackerAcceleration: number;
  attackerJockeySkill: number;
  attackerRiskLevel: RiskLevel;
  /** Saldıran atın SON segment performans puanı - önündeki atınki. Pozitifse saldıran daha hızlı. */
  speedDifference: number;
  /** [0,100] — kulvar doluluğuna göre hesaplanan boşluk (bkz. `calculateAvailableSpace`). */
  availableSpace: number;
  /** Önündeki at `defend_position` kararı verdiyse `config.defendPositionBonus`, aksi halde 0. */
  defenderBlockBonus: number;
}

/**
 * brief §21 overtake_probability formülü. Sonuç [0,1] aralığına
 * sıkıştırılmış bir OLASILIKTIR — çağıran taraf (`race-engine.ts`) bunu
 * deterministik bir `rng` çekilişiyle karşılaştırıp geçişin başarılı olup
 * olmadığına karar verir (brief §18 controlled randomness ile aynı desen).
 */
export function calculateOvertakeProbability(input: OvertakeAttemptInput, config: RaceBalanceConfig['overtaking']): number {
  const courage = config.courageByRiskLevel[input.attackerRiskLevel] ?? config.courageByRiskLevel['normal'] ?? 50;

  const raw =
    input.attackerAcceleration * config.accelerationWeight +
    input.speedDifference * config.speedDifferenceWeight +
    courage * config.courageWeight +
    input.attackerJockeySkill * config.jockeySkillWeight +
    input.availableSpace * config.availableSpaceWeight -
    input.defenderBlockBonus;

  return clamp(raw / 100, 0, 1);
}

/**
 * Bir kulvardaki toplam at sayısına (kendisi dahil) göre boşluk hesaplar.
 * `occupantCount = 1` (kulvarda yalnız) → tam boşluk (100); her ek at
 * `spacePerOccupant` kadar boşluğu azaltır.
 */
export function calculateAvailableSpace(occupantCount: number, config: RaceBalanceConfig['overtaking']): number {
  return clamp(100 - Math.max(0, occupantCount - 1) * config.spacePerOccupant, 0, 100);
}

/** Yarış stiline göre başlangıç kulvarı (brief §21 "iç/dış kulvar"). Tanımsız bir stil ortadaki kulvara düşer. */
export function assignInitialLane(racingStyle: RacingStyle, config: RaceBalanceConfig['lanes']): number {
  const lane = config.initialLaneByStyle[racingStyle];
  return lane !== undefined ? clamp(lane, 1, config.count) : Math.ceil(config.count / 2);
}

/**
 * `search_overtake_lane` kararı verildiğinde kulvar değiştirir — ortadan
 * daha uzak olan yöne (dışa doğru) hareket eder; zaten en dıştaysa içe
 * döner. Karar verilmediyse (`wantsChange = false`) kulvar değişmez.
 */
export function deriveLaneChange(currentLane: number, wantsChange: boolean, config: RaceBalanceConfig['lanes']): number {
  if (!wantsChange || config.count <= 1) {
    return currentLane;
  }
  const middle = config.count / 2;
  const direction = currentLane <= middle ? 1 : -1;
  return clamp(currentLane + direction, 1, config.count);
}
