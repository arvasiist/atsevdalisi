/**
 * Günlük Ödül (brief §37 "GÜNLÜK OYUN DÖNGÜSÜ": Login → Daily Reward →
 * Horse Status Check → ...; brief §31 gelir kalemleri listesinde "Günlük
 * ödül"). `domain/care/care.ts`'teki `canPerformCareAction` ile AYNI
 * desen: saf, kayan-pencere (rolling window) bir cooldown kontrolü —
 * "takvim günü" (örn. gece yarısı sıfırlanan) bir reset DEĞİL, bilinçli
 * bir basitleştirme (bkz. bu dosyanın altındaki KAPSAM notu).
 *
 * Fonksiyon saftır; DB/zaman erişimi yoktur (`now`/`lastClaimedAt` çağıran
 * taraftan parametre olarak gelir).
 */

import { DailyRewardAlreadyClaimedError } from './errors';

export interface DailyRewardEligibility {
  eligible: boolean;
  /** Uygun değilse, tekrar uygun olana kadar kalan dakika. */
  remainingMinutes: number;
}

/** Günlük ödülün şu an talep edilip edilemeyeceğini kontrol eder. */
export function canClaimDailyReward(
  lastClaimedAt: Date | null,
  now: Date,
  cooldownHours: number,
): DailyRewardEligibility {
  if (lastClaimedAt === null) {
    return { eligible: true, remainingMinutes: 0 };
  }
  const elapsedMinutes = (now.getTime() - lastClaimedAt.getTime()) / (1000 * 60);
  const remaining = cooldownHours * 60 - elapsedMinutes;
  return remaining <= 0 ? { eligible: true, remainingMinutes: 0 } : { eligible: false, remainingMinutes: Math.ceil(remaining) };
}

/** `canClaimDailyReward` uygun değilse `DailyRewardAlreadyClaimedError` fırlatan yardımcı. */
export function assertCanClaimDailyReward(lastClaimedAt: Date | null, now: Date, cooldownHours: number): void {
  const eligibility = canClaimDailyReward(lastClaimedAt, now, cooldownHours);
  if (!eligibility.eligible) {
    throw new DailyRewardAlreadyClaimedError(eligibility.remainingMinutes);
  }
}

/**
 * Kapsam dışı (bilinçli, sonraki adımlar): "takvim günü" bazlı reset
 * (örn. sunucu saatiyle gece yarısı sıfırlama, farklı zaman dilimlerini
 * doğru ele almak ek karmaşıklık gerektirir — brief bunu netleştirmiyor);
 * art arda gün serisi (streak) bonusu; brief §54'ün tam
 * `Idempotency-Key` + Redis replay altyapısı (bu eylem KENDİ cooldown
 * kontrolüyle ZATEN çift ödül vermeye karşı korumalıdır — bkz.
 * `application/use-cases/claim-daily-reward.use-case.ts` üstündeki KAPSAM
 * notu — ama brief §54'ün "aynı yanıtı tekrar döndürme" UX garantisini
 * TAM olarak sağlamaz, bu Race/Market gibi Redis'in zaten gerekli
 * olacağı daha büyük bir dilime bırakılmıştır).
 */
