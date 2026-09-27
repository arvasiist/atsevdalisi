/**
 * Bakım sistemi (brief §11): Tımar (groom), Su (water), Temizlik (clean),
 * Veteriner (vet), Nalbant (farrier), Dinlendir (rest) + Beslenme (brief §12).
 *
 * Fonksiyonlar saftır; DB/zaman erişimi yoktur (`now`/`lastPerformedAt`
 * çağıran taraftan parametre olarak gelir, brief Kural: domain framework'süz).
 *
 * Not (dokümantasyon amaçlı eşleme — brief'te tanımlanan ama şemada ayrı bir
 * alanı olmayan kavramlar mevcut `HorseHealth` alanlarına eşlenir):
 *  - Nalbant'ın "hoof condition / running stability" etkisi → `jointCondition`.
 *  - Temizlik'in "infection risk" azaltımı → `injuryRisk` azaltımı (proxy).
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { FeedItemView } from '@at-sevdalisi/shared-types';
import type { CareActionEffect, CareActionType, CareConfig, FeedType, FeedTypeEffect } from '@at-sevdalisi/game-config';
import { applyVitalDelta, type VitalSigns } from '../horse/vital-signs';
import {
  CareActionOnCooldownError,
  DailyFeedLimitReachedError,
  InsufficientFeedStockError,
  InvalidCareInputError,
} from './errors';

/** `HorseHealth`'in bakım eylemlerinden etkilenen alt kümesi. */
export interface CareableHealth {
  injuryRisk: number;
  recoveryRate: number;
  jointCondition: number;
  weightCondition: number;
}

export interface CareActionResult {
  vitals: VitalSigns;
  health: CareableHealth;
}

const MIN_VALUE = 0;
const MAX_VALUE = 100;

/** Bir bakım eyleminin ne zaman tekrar kullanılabileceğini kontrol eder. */
export function canPerformCareAction(
  lastPerformedAt: Date | null,
  now: Date,
  cooldownMinutes: number,
): { allowed: boolean; remainingMinutes: number } {
  if (lastPerformedAt === null) {
    return { allowed: true, remainingMinutes: 0 };
  }
  const elapsedMinutes = (now.getTime() - lastPerformedAt.getTime()) / (1000 * 60);
  const remaining = cooldownMinutes - elapsedMinutes;
  return remaining <= 0 ? { allowed: true, remainingMinutes: 0 } : { allowed: false, remainingMinutes: Math.ceil(remaining) };
}

/**
 * FAZ 1 wiring, beşinci dilim (bkz. `errors.ts` `InvalidCareInputError`
 * üstündeki not — Antrenman dilimindeki Hata 7'nin dersi BAŞTAN
 * uygulanır): `config.actions[actionType]`/`config.feedTypes[feedType]`'a
 * yapılan HER erişim bu iki yardımcı üzerinden geçer, böylece tanımsız
 * bir değer sessizce `undefined` dönüp bir sonraki erişimde ham bir
 * `TypeError`e (500) yol açmak yerine burada net bir domain hatasına
 * dönüşür.
 */
function getCareActionEffect(config: CareConfig, actionType: CareActionType): CareActionEffect {
  const effect = config.actions[actionType];
  if (effect === undefined) {
    throw new InvalidCareInputError(`Geçersiz bakım eylemi: "${String(actionType)}".`);
  }
  return effect;
}

function getFeedTypeEffect(config: CareConfig, feedType: FeedType): FeedTypeEffect {
  const effect = config.feedTypes[feedType];
  if (effect === undefined) {
    throw new InvalidCareInputError(`Geçersiz yem türü: "${String(feedType)}".`);
  }
  return effect;
}

export function getCareActionCost(config: CareConfig, actionType: CareActionType) {
  return getCareActionEffect(config, actionType).cost;
}

/**
 * Kalemin SATIN ALMA fiyatı (bu turda `getFeedCost`'tan YENİDEN
 * ADLANDIRILDI). `undefined` dönerse kalem satın alınamaz — `saman` gibi
 * bedava kalemlerin fiyatı YOKTUR (bkz. `FeedTypeEffect.price` doc yorumu).
 * Beslemenin kendisi (stoktan düşme) bu fonksiyonla İLGİSİZDİR: stoktan
 * beslemek ücretsizdir, para yalnızca SATIN ALMADA harcanır.
 */
export function getFeedPrice(config: CareConfig, feedType: FeedType) {
  return getFeedTypeEffect(config, feedType).price;
}

/** Kalemin envanterde tutulup tutulmadığı (`FeedTypeEffect.stocked`). */
export function isFeedStocked(config: CareConfig, feedType: FeedType): boolean {
  return getFeedTypeEffect(config, feedType).stocked;
}

/** Kalemin at başına günlük sınırı; `null` ise sınırsız. */
export function getFeedDailyLimit(config: CareConfig, feedType: FeedType): number | null {
  return getFeedTypeEffect(config, feedType).dailyLimit ?? null;
}

/** Bir besleme hakkının değerlendirme sonucu. */
export interface FeedAllowance {
  allowed: boolean;
  /** Kalemin günlük sınırı varsa kalan hak; sınır yoksa `null`. */
  remainingToday: number | null;
  /** Sınır dolduysa yeni hakkın açılmasına kalan dakika; aksi halde 0. */
  remainingMinutes: number;
}

/**
 * Günlük yem sınırını değerlendirir (bu turda EKLENDİ).
 *
 * `canPerformCareAction`/`canClaimDailyReward` ile AYNI kayan-pencere
 * mantığı, ama farkı şu: cooldown "son eylemden bu yana" der, burada ise
 * "pencere içinde KAÇ KEZ" sorulur. Bu yüzden `fedInWindow` (pencere
 * içindeki adet) ve `oldestInWindowAt` (pencere içindeki EN ESKİ besleme)
 * birlikte gerekir — sınır dolduğunda yeni hakkın ne zaman açılacağını
 * yalnızca en eski kayıt söyler (en yenisi değil: 3 saman 10:00, 11:00,
 * 12:00'de verildiyse ilk hak ertesi gün 10:00'da açılır, 12:00'de değil).
 *
 * `dailyLimit` `undefined` ise kalem sınırsızdır → her zaman izin verilir ve
 * `remainingToday` `null` döner.
 */
export function evaluateFeedAllowance(
  dailyLimit: number | undefined,
  fedInWindow: number,
  oldestInWindowAt: Date | null,
  now: Date,
  windowHours: number,
): FeedAllowance {
  if (dailyLimit === undefined) {
    return { allowed: true, remainingToday: null, remainingMinutes: 0 };
  }

  const remainingToday = Math.max(0, dailyLimit - fedInWindow);
  if (remainingToday > 0) {
    return { allowed: true, remainingToday, remainingMinutes: 0 };
  }

  // Sınır dolu. En eski kayıt pencereden çıktığı an bir hak açılır — en
  // eski kayıt yoksa (mantıken imkânsız: `fedInWindow >= dailyLimit > 0`)
  // güvenli tarafta kalıp tam pencereyi bekletiriz.
  if (oldestInWindowAt === null) {
    return { allowed: false, remainingToday: 0, remainingMinutes: Math.ceil(windowHours * 60) };
  }
  const freesAtMs = oldestInWindowAt.getTime() + windowHours * 60 * 60 * 1000;
  const remainingMinutes = Math.max(0, Math.ceil((freesAtMs - now.getTime()) / (1000 * 60)));
  return { allowed: false, remainingToday: 0, remainingMinutes };
}

/**
 * `evaluateFeedAllowance` izin vermiyorsa `DailyFeedLimitReachedError`
 * fırlatan yardımcı (`assertCanClaimDailyReward` ile AYNI desen).
 */
export function assertFeedAllowance(
  feedType: FeedType,
  dailyLimit: number | undefined,
  fedInWindow: number,
  oldestInWindowAt: Date | null,
  now: Date,
  windowHours: number,
): FeedAllowance {
  const allowance = evaluateFeedAllowance(dailyLimit, fedInWindow, oldestInWindowAt, now, windowHours);
  if (!allowance.allowed) {
    throw new DailyFeedLimitReachedError(feedType, dailyLimit ?? 0, allowance.remainingMinutes);
  }
  return allowance;
}

/**
 * Stokta yeterli kalem var mı (bu turda EKLENDİ). Yalnızca `stocked`
 * kalemler için anlamlıdır; stoklanmayan kalemler (`saman`) hiç stok
 * sormadan geçer — o kalemin sınırı `dailyLimit`'tir, stok değil.
 */
export function assertFeedStockAvailable(
  config: CareConfig,
  feedType: FeedType,
  available: number,
): void {
  if (!isFeedStocked(config, feedType)) {
    return;
  }
  if (available <= 0) {
    throw new InsufficientFeedStockError(feedType, available);
  }
}

/**
 * Günlük hediye içeriğinin tutarlılığını doğrular (bu turda EKLENDİ).
 *
 * Kural: `feedDailyGift` yalnızca `stocked: true` kalemler içerebilir.
 * Stoklanmayan bir kalemi (ör. `saman`) hediye etmek ANLAMSIZDIR — o kalem
 * zaten her zaman bedavadır, hediyenin hiçbir etkisi olmaz ve oyuncuya
 * "hediye aldım" denip hiçbir şey verilmemesi sessiz bir yalandır. Config
 * yanlış düzenlenirse burada NET bir hata fırlatılır (sessiz no-op yerine).
 *
 * `loadCareConfig()` düz bir tip iddiasıdır ve config içeriğini denetlemez
 * (diğer tüm `load*Config()` fonksiyonları gibi) — doğrulama BİLEREK
 * domain katmanındadır (CLAUDE.md "Kardeş tuzak").
 */
export function assertDailyGiftItemsAreStocked(config: CareConfig): void {
  for (const [feedType, count] of Object.entries(config.feedDailyGift)) {
    if (count <= 0) {
      throw new InvalidCareInputError(`Günlük hediye adedi pozitif olmalı: "${feedType}" → ${count}.`);
    }
    if (!isFeedStocked(config, feedType as FeedType)) {
      throw new InvalidCareInputError(
        `Günlük hediyede stoklanmayan kalem olamaz: "${feedType}" (feedTypes.${feedType}.stocked = false).`,
      );
    }
  }
}

/** `feedDailyGift` içeriğini (kalem, adet) çiftleri olarak döner. */
export function getDailyGiftItems(config: CareConfig): { type: FeedType; count: number }[] {
  return Object.entries(config.feedDailyGift).map(([type, count]) => ({ type: type as FeedType, count }));
}

/**
 * Bir kalemin oyuncuya/ata göre durumu (bu turda EKLENDİ).
 *
 * `GET /players/:id/feed-inventory` ve `GET /horses/:id/feed-status`
 * uç noktaları AYNI satırı döner; ikisinin de kendi kopyasını hesaplaması
 * (fiyat/sınır/stok kurallarının iki yerde ayrışması) yerine tek saf
 * fonksiyon burada durur.
 *
 * Fiyat/sınır SUNUCUDAN gelir — istemci config'i görmez (CLAUDE.md
 * "SUNUCU OTORİTESİ").
 */
export function buildFeedItemView(
  config: CareConfig,
  type: FeedType,
  quantity: number,
  fedInWindow: number | null,
): FeedItemView {
  const stocked = isFeedStocked(config, type);
  const price = getFeedPrice(config, type);

  return {
    type,
    price: price === undefined ? null : { currency: price.currency, amount: price.amount },
    stocked,
    dailyLimit: getFeedDailyLimit(config, type),
    // Stoklanmayan kalemde adet kavramı YOKTUR — `0` demek yanlış olurdu
    // ("stok bitti" diye okunurdu), bu yüzden `null` döner.
    quantity: stocked ? quantity : null,
    fedInWindow,
  };
}

/**
 * AUDIT_REPORT.md H1 düzeltmesi (bu oturum) — bkz. `@at-sevdalisi/game-config`
 * `InjuryRecoveryConfig` üstündeki not. `postCareHealth`/`postCareVitalsHealth`
 * bakım eyleminin (delta'ları uygulanmış) SONUÇ değerleridir — kontrol,
 * eylemden ÖNCEKİ değil SONRAKİ duruma göre yapılır (ör. `vet`'in kendi
 * `injuryRiskDelta`'sı bu turda zaten düşürmüş olabilir).
 *
 * Yalnızca `config.injuryRecovery.action` ile eşleşen eylem türü için
 * `true` dönebilir — application katmanı bunu YALNIZCA at zaten
 * `injured` durumundaysa çağırmalıdır (aksi halde zaten `active`/`resting`
 * bir at için anlamsızdır).
 */
export function canRecoverFromInjury(
  config: CareConfig,
  actionType: CareActionType,
  postCareVitalsHealth: number,
  postCareInjuryRisk: number,
): boolean {
  const { injuryRecovery } = config;
  if (actionType !== injuryRecovery.action) {
    return false;
  }
  return postCareVitalsHealth >= injuryRecovery.minHealth && postCareInjuryRisk <= injuryRecovery.maxInjuryRisk;
}

/**
 * Bir bakım eylemini uygular. Cooldown dolmamışsa `CareActionOnCooldownError`
 * fırlatır — application layer bu eylemi hiç oluşturmamalı/ücretlendirmemelidir.
 */
export function applyCareAction(
  config: CareConfig,
  actionType: CareActionType,
  vitals: VitalSigns,
  health: CareableHealth,
  lastPerformedAt: Date | null,
  now: Date = new Date(),
): CareActionResult {
  const effect = getCareActionEffect(config, actionType);
  const readiness = canPerformCareAction(lastPerformedAt, now, effect.cooldownMinutes);
  if (!readiness.allowed) {
    throw new CareActionOnCooldownError(readiness.remainingMinutes);
  }

  return {
    vitals: applyVitalDelta(vitals, effect.vitalDelta ?? {}),
    health: {
      injuryRisk: clamp(health.injuryRisk + (effect.injuryRiskDelta ?? 0), MIN_VALUE, MAX_VALUE),
      recoveryRate: clamp(health.recoveryRate + (effect.recoveryRateDelta ?? 0), MIN_VALUE, MAX_VALUE),
      jointCondition: clamp(health.jointCondition + (effect.jointConditionDelta ?? 0), MIN_VALUE, MAX_VALUE),
      weightCondition: health.weightCondition,
    },
  };
}

/**
 * Yem verir (brief §12: kaleme göre farklı etkiler; "daha pahalı yem =
 * daha iyi" garantisi YOKTUR — `arpa` energy'yi en çok artıran kalemdir ama
 * `fitness`'a katkısı `mama`'dan azdır, `havuc` ise hiç enerji vermez,
 * moral ve toparlanma verir).
 *
 * Bu fonksiyon SAFTIR: stok düşmez, günlük sınır sayılmaz, para harcanmaz —
 * bunların hepsi Application katmanının işidir (bkz. `FeedHorseUseCase`).
 */
export function applyFeed(
  config: CareConfig,
  feedType: FeedType,
  vitals: VitalSigns,
  health: CareableHealth,
): CareActionResult {
  const effect = getFeedTypeEffect(config, feedType);

  return {
    vitals: applyVitalDelta(vitals, effect.vitalDelta ?? {}),
    health: {
      injuryRisk: health.injuryRisk,
      recoveryRate: clamp(health.recoveryRate + (effect.recoveryRateDelta ?? 0), MIN_VALUE, MAX_VALUE),
      jointCondition: health.jointCondition,
      weightCondition: clamp(health.weightCondition + (effect.weightConditionDelta ?? 0), MIN_VALUE, MAX_VALUE),
    },
  };
}
