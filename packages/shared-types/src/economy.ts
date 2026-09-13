import type { Player } from './player';

/**
 * FAZ 1 wiring, yedinci dilim — `POST /players/{id}/daily-reward` yanıtı
 * (brief §37 "GÜNLÜK OYUN DÖNGÜSÜ"). `newBalance`, `stable.ts`'teki
 * `StableUpgradeResult.newBalance` ile AYNI `Pick` deseni.
 */
export interface ClaimDailyRewardResult {
  amount: number;
  currency: 'money' | 'gems';
  newBalance: Pick<Player, 'money' | 'gems'>;
  /** Bir sonraki talebin uygun olacağı zaman (ISO 8601) — UI'ın geri sayım gösterebilmesi için. */
  nextClaimAvailableAt: string;
}
