/**
 * Kişilik / mizaç (temperament) sistemi — brief §42 PHASE 6.3.
 *
 * **BU DOSYANIN VAR OLMA SEBEBİ.** `horse_stats.temperament` migration
 * 0003'ten beri VERİTABANINDA vardır, üremeyle yavruya geçer
 * (`INHERITED_STAT_COLUMNS`), API'de okunur/yazılır — ama `simulateRace` onu
 * HİÇ GÖRMÜYORDU. Yani oyuncunun yetiştiricilik kararlarından biri (hangi
 * tayı tutayım) yarış sonucuna hiç etki etmiyordu ve bunu ne derleyici ne
 * hiçbir test söylüyordu. Bu dosya o boşluğu kapatır.
 *
 * **YÖN: "SICAK AT HIZLI KALKAR, ÇABUK YORULUR."** Yüksek temperament =
 * huysuz/istekli at: startta öne fırlar, ama erken segmentlerde daha çok
 * stamina yakar ve final düzlükte AYNI MİKTARDA puanı geri verir. Düşük
 * temperament = sakin at: ağır kalkar, enerjisini saklar, son düzlükte
 * kapanır. Ölçek `heat = (temperament - neutral) / 50` ile [-1, +1]'e
 * normalize edilir.
 *
 * **KAPALI ÖDÜNLEŞİM — GİZLİ BONUS YOK.** İki pencere (erken kalkış ve final
 * düzlüğü) ZIT İŞARETLİ ve EŞİT BÜYÜKLÜKTEDİR, ayrıca **AYNI SAYIDA
 * SEGMENT** içerir. Yani sıcak at toplamda FAZLA puan almaz; yalnızca NE
 * ZAMAN aldığı değişir. Bütün sayılar `config/race.config.json` →
 * `temperament` bloğundadır ve istemciye `RaceEntrantSnapshot.temperament`
 * ile yansıtılır (brief: "oyuncunun göremediği hileli bonuslar kullanma").
 *
 * ⚠️ **PENCERELER SEGMENT SAYISINA GÖRE HESAPLANIR — ÖLÇÜLEREK ÖĞRENİLDİ.**
 * İlk sürüm bu iki pencereyi ORANLA kuruyordu (`positionFraction <= 0.25` /
 * `positionFraction >= 0.75`). Motor `positionFraction = (segmentIndex + 1) /
 * segmentCount` kullandığı için (bkz. `race-engine.ts`) bu, 1600m/200m'lik
 * bir yarışta erken pencereye **2**, final penceresine **3** segment sokuyordu
 * — yani ödünleşim KAPALI DEĞİLDİ: sakin at (final bonusu) 3×(+4) kazanıp
 * 2×(−4) ödüyor, net **+4 puan** ile bedava avantaj elde ediyordu. 5.000
 * koşumluk ölçüm bunu gösterdi (1v1, rakip nötr): temperament 0 → **0.5686**
 * galibiyet payı, 50 → 0.4956, 100 → **0.3816**. "Kapalı ödünleşim" iddiası
 * kâğıtta doğruydu, MOTORDA değildi. Düzeltme: pencere genişliği
 * `windowFraction × segmentCount` ile SEGMENT cinsinden hesaplanır ve her iki
 * uçta AYNI sayıda segment uygulanır — bu, mesafe ve segment uzunluğu ne
 * olursa olsun tam simetriyi garanti eder (`temperament.spec.ts` bunu 800'den
 * 3200 metreye kadar YEDİ farklı mesafede iddia eder).
 *
 * **50 = TAM NO-OP.** `temperament` `undefined` ise (eski/eksik snapshot) ya
 * da tam olarak `neutral` (50) ise fonksiyon `NEUTRAL_TEMPERAMENT_EFFECT`
 * döner — `performanceBonus` 0, çarpan 1.0. Bu, bu alanı hiç doldurmayan
 * mevcut fixture'ların ve `temperament` varsayılanı 50 olan başlangıç
 * atlarının davranışını DEĞİŞTİRMEZ (bkz. `packages/shared-types/src/
 * race.ts` `temperament` doc yorumu).
 *
 * **PROJENİN KENDİ SEMANTİĞİYLE AYNI YÖNDE.** `domain/jockey/jockey.ts`
 * içindeki `calculateTemperamentComponent` (bugün hâlâ çağıransız) yüksek
 * temperamentı "kontrolü ZOR" diye puanlar — yani bu projede yüksek
 * temperament zaten bir zorluk işaretidir. Buradaki yön de aynı: sıcak at
 * puanını ERKEN harcar ve dalgalı bir puan profili üretir; motorun
 * `segmentTimeMs = k / performanceScore` formülü DIŞBÜKEY olduğu için
 * (Jensen) dalgalı profil düz profilden ortalamada biraz DAHA YAVAŞTIR. Bu
 * yüzden ölçüm, sıcak atın ortalamada hafif dezavantajlı olduğunu gösterir —
 * bu bilinçli olarak SAKLANMAZ, `docs/RACE_BALANCE_REPORT.md` ve
 * `temperament.spec.ts`te açıkça yazılıdır. (Aynı dışbükeylik etkisi PHASE
 * 6.1'de taktik ekseninde de ölçülmüştü: `balanced` en düz profil olduğu
 * için üç kalkış arasında en yüksek galibiyet payına sahipti.)
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';

export interface TemperamentEffect {
  /** Bu segmentte segment performansına eklenecek puan. */
  performanceBonus: number;
  /** Bu segmentte stamina tüketimine uygulanacak çarpan. */
  staminaConsumptionMultiplier: number;
}

/** Nötr mizaç etkisi — `undefined`/tanınmayan değerler ve tam 50 için. */
const NEUTRAL_TEMPERAMENT_EFFECT: TemperamentEffect = { performanceBonus: 0, staminaConsumptionMultiplier: 1 };

/**
 * 0-100'lük stat ölçeğinin YARISI. `temperament`in veritabanı CHECK'i
 * `BETWEEN 0 AND 100`'dür (migration 0003) ve `NEUTRAL_UNMODELED_TRAIT_SCORE`
 * da 50'dir — yani ölçeğin ortası projede ZATEN 50 kabul edilir. Bu sabit, o
 * kabulü `heat` normalizasyonunda AÇIK hâle getirir; sihirli bir sayı
 * değildir, ölçeğin kendisidir.
 */
const TRAIT_SCALE_HALF = 50;

/**
 * Bu segmentin hangi pencerede olduğunu SEGMENT SAYISI üzerinden belirler.
 *
 * Motor `positionFraction`ı `(segmentIndex + 1) / segmentCount` olarak üretir
 * (bkz. `race-engine.ts` — Geçiş A/C'nin hepsi aynı değeri kullanır), yani
 * buradan segment indeksi geri kazanılabilir. Oranla karşılaştırma yapmak
 * yerine segment sayısına dönmek, iki pencereyi TAM simetrik kılar (bkz. dosya
 * başındaki ⚠️ not).
 *
 * `windowSegments`, `floor(segmentCount / 2)` ile sınırlanır: iki pencere
 * ASLA ÇAKIŞAMAZ. Çakışsalardı bir at hem erken hem final bonusunu alır ve
 * "kapalı ödünleşim" iddiası yine çökerdi (config'e `windowFraction: 0.6`
 * yazmak yeterdi).
 */
function resolveWindow(
  positionFraction: number,
  distanceMeters: number,
  segmentLengthMeters: number,
  windowFraction: number,
): { inEarlyWindow: boolean; inLateWindow: boolean } {
  const segmentCount = Math.max(1, Math.round(distanceMeters / segmentLengthMeters));
  const windowSegments = clamp(Math.round(segmentCount * windowFraction), 1, Math.floor(segmentCount / 2));
  const segmentIndex = Math.round(positionFraction * segmentCount) - 1;

  return {
    inEarlyWindow: segmentIndex >= 0 && segmentIndex < windowSegments,
    inLateWindow: segmentIndex >= segmentCount - windowSegments && segmentIndex < segmentCount,
  };
}

export function deriveTemperamentEffect(
  temperament: number | undefined,
  positionFraction: number,
  distanceMeters: number,
  segmentLengthMeters: number,
  temperamentConfig: RaceBalanceConfig['temperament'],
): TemperamentEffect {
  // `undefined` (bu alanı hiç doldurmayan eski fixture/bot) ve tam nötr (50)
  // AYNI yola girer — motor bu ikisi arasında ayrım YAPMAZ.
  if (temperament === undefined || temperament === temperamentConfig.neutral) {
    return NEUTRAL_TEMPERAMENT_EFFECT;
  }

  const heat = clamp((temperament - temperamentConfig.neutral) / TRAIT_SCALE_HALF, -1, 1);
  const { inEarlyWindow, inLateWindow } = resolveWindow(
    positionFraction,
    distanceMeters,
    segmentLengthMeters,
    temperamentConfig.windowFraction,
  );

  let performanceBonus = 0;
  let staminaConsumptionMultiplier = 1;

  // --- Erken kalkış penceresi: sıcak at puan kazanır, enerji yakar ---
  if (inEarlyWindow) {
    performanceBonus += heat * temperamentConfig.startBonusMax;
    staminaConsumptionMultiplier += heat * temperamentConfig.energyCostMax;
  }

  // --- Final düzlüğü: erken kazanılan puan AYNEN geri verilir ---
  // `startBonusMax` ile `latePenaltyMax` config'te EŞİT tutulur ve iki pencere
  // AYNI sayıda segment içerir — transfer bu iki koşulun birlikte
  // sağlanmasıyla kapanır (bkz. dosya başındaki ⚠️ not).
  if (inLateWindow) {
    performanceBonus -= heat * temperamentConfig.latePenaltyMax;
    staminaConsumptionMultiplier -= heat * temperamentConfig.energyCostMax;
  }

  if (performanceBonus === 0 && staminaConsumptionMultiplier === 1) {
    return NEUTRAL_TEMPERAMENT_EFFECT;
  }
  return { performanceBonus, staminaConsumptionMultiplier };
}
