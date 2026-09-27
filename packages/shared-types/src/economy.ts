import type { FeedType } from './care';
import type { Currency } from './currency';
import type { Player } from './player';

/**
 * FAZ 1 wiring, yedinci dilim — `POST /players/{id}/daily-reward` yanıtı
 * (brief §37 "GÜNLÜK OYUN DÖNGÜSÜ"). `newBalance`, `stable.ts`'teki
 * `StableUpgradeResult.newBalance` ile AYNI `Pick` deseni.
 */
export interface ClaimDailyRewardResult {
  amount: number;
  currency: Currency;
  newBalance: Pick<Player, 'money' | 'gems'>;
  /** Bir sonraki talebin uygun olacağı zaman (ISO 8601) — UI'ın geri sayım gösterebilmesi için. */
  nextClaimAvailableAt: string;
  /**
   * Günlük ödülle BİRLİKTE verilen bedava yem kalemleri (bu turda EKLENDİ).
   * Kaynak `config/care.config.json` → `feedDailyGift`; içerik boşsa boş
   * dizidir. Her satır, hediyeden SONRA envanterdeki toplam adedi taşır —
   * istemci stoğu kendisi toplamaz.
   */
  grantedFeed: { type: FeedType; count: number; quantityAfter: number }[];
}
