/** Pace sistemi (docs/ALGORITHMS.md §5, brief §20). */

import { clamp } from '@at-sevdalisi/shared-types';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { RaceEntrantSnapshot, RacingStyle } from '@at-sevdalisi/shared-types';

export interface PaceEffect {
  /** Bu segmentte stamina tüketimine uygulanacak çarpan. */
  staminaConsumptionMultiplier: number;
  /** BaseAbility'ye eklenecek (segment performansı için) doğrudan puan bonusu. */
  performanceBonus: number;
}

/**
 * AUDIT_AND_HARDENING Öncelik 6 (bu oturum) — "geç aşama" (closer bonusunun
 * başladığı, front-runner bonusunun bittiği nokta) eskiden SABİT bir oran
 * (`positionFraction >= 0.75`, yarış mesafesinden TAMAMEN BAĞIMSIZ) idi.
 * Bu, brief'in "at kişiliği" kavramıyla (ör. "final 400m'de kapanır")
 * ÇELİŞİR: 1600m'lik bir pratik yarışta bu %25'lik dilim 400m'ye denk
 * gelir (isabetli), ama 3200m'lik uzun bir yarışta AYNI %25 dilim 800m'ye
 * çıkar (gerçekçi olmayan biçimde erken/geniş bir "final sprint" penceresi),
 * 1000m'lik bir sprintte ise sadece 250m'ye düşer (gerçekçi olmayan
 * biçimde geç/dar). Şimdi final düzlüğü METRE cinsinden SABİT bir hedef
 * (`paceConfig.finalStretchMeters`, config'te 400) etrafında hesaplanır ve
 * pist uzunluğuna göre bir ORANA çevrilir — segment sistemi artık pist
 * GEOMETRİSİNE (mesafeye) duyarlıdır (brief §52). [MIN_FRACTION,
 * MAX_FRACTION] kırpması, çok kısa (final düzlük neredeyse TÜM yarış
 * olmasın) veya çok uzun (final düzlük anlamsız derecede KISA bir an
 * olmasın) mesafelerde dejenere bir sonucu ÖNLER. 1600m'de (mevcut TEK
 * kullanılan mesafe, `PRACTICE_RACE_DISTANCE_METERS`) bu formül TAM
 * OLARAK eski `0.75` eşiğini üretir (400/1600 = 0.25) — yani bu değişiklik
 * BUGÜNKÜ hiçbir yarışın sonucunu DEĞİŞTİRMEZ, sadece gelecekte farklı
 * mesafeler kullanıldığında (ör. farklı pist uzunlukları) doğru şekilde
 * ÖLÇEKLENMESİNİ sağlar (bkz. `pace.spec.ts`).
 */
const MIN_FINAL_STRETCH_FRACTION = 0.1;
const MAX_FINAL_STRETCH_FRACTION = 0.4;

export function computeFinalStretchFraction(distanceMeters: number, paceConfig: RaceBalanceConfig['pace']): number {
  const rawFraction = paceConfig.finalStretchMeters / distanceMeters;
  return clamp(rawFraction, MIN_FINAL_STRETCH_FRACTION, MAX_FINAL_STRETCH_FRACTION);
}

/**
 * `racingStyle`'a ve segmentin yarış içindeki konumuna (0=start, 1=finish)
 * göre pace etkisini hesaplar. "Önde git" erken avantaj + yüksek stamina
 * maliyeti taşır; "geriden gel" stamina tasarrufu + geç aşama bonusu taşır
 * (brief §20, §89 İlke 1: "sadece en yüksek rating kazanmaz").
 *
 * **FAZ 5 notu:** bu fonksiyon eskiden stil bazlı sabit bir `trafficRisk`
 * (bloklanma olasılığı) de döndürüyordu; bu, gerçek pozisyon/kulvar
 * farkındalıklı bir modelle (`domain/race/overtaking.ts`) DEĞİŞTİRİLMİŞTİR
 * — bkz. `docs/ALGORITHMS.md` §6 "Uygulama notu (FAZ 5)". Bloklanma artık
 * atların BİRBİRİNE GÖRE gerçek zaman farkına bakılarak belirlenir, salt
 * yarış stiline değil.
 */
export function derivePaceEffect(
  racingStyle: RacingStyle,
  positionFraction: number,
  distanceMeters: number,
  paceConfig: RaceBalanceConfig['pace'],
): PaceEffect {
  const finalStretchFraction = computeFinalStretchFraction(distanceMeters, paceConfig);
  const isLateStage = positionFraction >= 1 - finalStretchFraction;

  if (racingStyle === 'front_runner') {
    return {
      staminaConsumptionMultiplier: paceConfig.frontRunnerStaminaMultiplier,
      performanceBonus: isLateStage ? 0 : paceConfig.frontRunnerPositionBonus,
    };
  }

  if (racingStyle === 'closer') {
    return {
      staminaConsumptionMultiplier: paceConfig.closerStaminaMultiplier,
      performanceBonus: isLateStage ? paceConfig.closerLateStageBonus : 0,
    };
  }

  // 'tracker' ve 'mid_pack': front_runner ile closer arasında, nötr bir profil.
  return {
    staminaConsumptionMultiplier: 1,
    performanceBonus: 0,
  };
}

/**
 * PHASE 6 — `RaceTacticInput`'in `startApproach` ve `finalStretchPlan`
 * alanlarının motor etkisi (brief §42 PHASE 6).
 *
 * **NEDEN BU FONKSİYON VAR.** Bu iki alan `assertValidRaceTactic`
 * (`entrant-snapshot.ts`) tarafından ZATEN doğrulanıyordu, ama
 * `simulateRace` onları HİÇ OKUMUYORDU — yani oyuncu `startApproach`'i
 * değiştirdiğinde sonuç BİT BİT AYN kalıyordu. Doğrulanan ama tüketilmeyen
 * bir alan, oyuncuya gösterilen sessiz bir yalandır; bu fonksiyon o boşluğu
 * kapatır.
 *
 * **GİZLİ BONUS YOK.** Bütün sayılar `config/race.config.json` →
 * `tactic` bloğundadır ve seçim `RaceTacticInput` ile istemciye yansıtılır
 * (brief: "oyuncunun göremediği hileli bonuslar kullanma").
 *
 * **İKİ EKSEN DE KAPALI ÖDÜNLEŞİMDİR.**
 *   - `startApproach` — `earlyPerformanceBonus` ile `latePerformanceBonus`
 *     ZIT İŞARETLİ ve EŞİT BÜYÜKLÜKTEDİR: "sert kalk" erken puan kazandırır,
 *     final düzlükte TAM AYNI miktarı geri verir. Toplam değişmez, yalnızca
 *     ZAMANLAMA değişir. `balanced` her iki pencerede de 0'dır.
 *     ⚠️ Bu eksende stamina çarpanı YOKTUR — `baseStaminaConsumptionPerSegment`
 *     zaten `100 / segmentCount`'tur, yani stamina tam olarak bitişte tükenir;
 *     1.0'ın üstündeki her çarpan SON segmenti `depletionPenaltyMultiplier`a
 *     sokar ve ödünleşim bıçak sırtına döner (ölçüldü: 1.15 çarpanı 1600m'de
 *     `aggressive`in galibiyet payını 0.53'ten 0.05'e düşürdü).
 *   - `finalStretchPlan` — bonusun BÜYÜKLÜĞÜ ile PENCERESİ arasında
 *     ödünleşir: `early_sprint` geniş-düşük, `late_sprint` dar-yüksek.
 *
 * Hiçbiri diğerini domine etmez — `tactic-effect.spec.ts` dokuz
 * kombinasyonu 2.000 koşumla ölçer (hiçbiri "ölü" ya da "baskın" değildir).
 *
 * **GERİYE DÖNÜK UYUM.** Dondurulmuş eski `horse_snapshot`'larda bu alanlar
 * `RaceTacticInput`'in bir parçası olduğu için ZATEN vardır (şema değişmedi);
 * eksik/bozuk bir değer gelirse nötr (1.0 / 0 puan) döner — eski yarışlar
 * `RACE_RULESET_VERSION` ile ayrıldığı için bu yol yalnızca savunmadır.
 */
export interface TacticEffect {
  /** Bu segmentte segment performansına eklenecek puan (erken kalkış + final düzlük). */
  performanceBonus: number;
  /** Bu segmentte stamina tüketimine uygulanacak çarpan. */
  staminaConsumptionMultiplier: number;
}

/** Nötr taktik etkisi — tanınmayan/eksik değerler için. */
const NEUTRAL_TACTIC_EFFECT: TacticEffect = { performanceBonus: 0, staminaConsumptionMultiplier: 1 };

export function deriveTacticEffect(
  tactic: RaceEntrantSnapshot['tactic'],
  positionFraction: number,
  distanceMeters: number,
  tacticConfig: RaceBalanceConfig['tactic'],
  paceConfig: RaceBalanceConfig['pace'],
): TacticEffect {
  let performanceBonus = 0;
  let staminaConsumptionMultiplier = 1;

  // --- Eksen 1: startApproach (erken pencere + final düzlük, ZIT işaretli) ---
  const approach = tacticConfig.startApproach[tactic.startApproach];
  if (approach) {
    if (positionFraction <= tacticConfig.startApproachWindowFraction) {
      performanceBonus += approach.earlyPerformanceBonus;
    }
    if (positionFraction >= 1 - computeFinalStretchFraction(distanceMeters, paceConfig)) {
      performanceBonus += approach.latePerformanceBonus;
    }
    // Stamina çarpanı YOKTUR (bilinçli): bkz. `RaceBalanceConfig.tactic.
    // startApproach` doc yorumu — stamina zaten tam bitişte tükenir ve
    // 1.0 üstü her çarpan son segmenti depletion cezasına sokardı.
  }

  // --- Eksen 2: finalStretchPlan (yalnızca final düzlükte) ---
  const plan = tacticConfig.finalStretchPlan[tactic.finalStretchPlan];
  if (plan) {
    const baseFraction = computeFinalStretchFraction(distanceMeters, paceConfig);
    // Plan penceresi taban pencereyi GENİŞLETİP DARALTABİLİR ama [0, 1]
    // dışına çıkamaz — pencere yarışın tamamı olamaz.
    const windowFraction = clamp(baseFraction * plan.windowMultiplier, 0, 1);
    if (positionFraction >= 1 - windowFraction) {
      performanceBonus += tacticConfig.finalStretchPlanBaseBonus * plan.bonusMultiplier;
      staminaConsumptionMultiplier *= plan.staminaConsumptionMultiplier;
    }
  }

  if (performanceBonus === 0 && staminaConsumptionMultiplier === 1) {
    return NEUTRAL_TACTIC_EFFECT;
  }
  return { performanceBonus, staminaConsumptionMultiplier };
}

/** Tempo göstergesinin NÖTR karşılığı (çarpan tam olarak 1.0 iken). */
const NEUTRAL_PACE_SCORE = 50;
/** Çarpan sapmasının puana çevrim oranı: 0.01'lik sapma = 1 puan. */
const PACE_SCORE_SCALE = 100;
const MIN_PACE_SCORE = 0;
const MAX_PACE_SCORE = 100;

/**
 * `PaceEffect.staminaConsumptionMultiplier`'ı istemciye gösterilebilir
 * 0-100'lük bir "tempo" puanına çevirir (bkz. `RaceSegmentSnapshot.
 * paceScore` doc yorumu — bu alanın NEDEN var olduğu ve neden opsiyonel
 * olduğu orada açıklanır).
 *
 * Eşleme, YENİ bir denge parametresi İCAT ETMEZ: yalnızca `derivePaceEffect`
 * tarafından zaten üretilen çarpanı, config'ten bağımsız sabit bir ölçekle
 * (0.01 sapma = 1 puan) yüzdeye çevirir — böylece `race.config.json`'daki
 * denge sayıları değişse bile bu fonksiyonun KENDİSİ değişmez, yalnızca
 * çıktısı yeni config'e göre kayar (config sürümü artışı yeterlidir,
 * `RACE_RULESET_VERSION` DEĞİL).
 *
 * Nötr (1.0) → 50; `frontRunnerStaminaMultiplier` (1.15) → 65;
 * `closerStaminaMultiplier` (0.97) → 47.
 */
export function derivePaceScore(staminaConsumptionMultiplier: number): number {
  const raw = NEUTRAL_PACE_SCORE + (staminaConsumptionMultiplier - 1) * PACE_SCORE_SCALE;
  const clamped = clamp(raw, MIN_PACE_SCORE, MAX_PACE_SCORE);
  // İKİ ONDALIĞA yuvarlanır — bu, `race_entry_segments.pace_score` sütununun
  // NUMERIC(5,2) ölçeğiyle BİREBİR aynıdır, yani kalıcılık turu artık
  // kayıpsızdır. Gerekçe somut: `1.15 - 1` kayan noktada
  // `0.14999999999999991`'dir, dolayısıyla yuvarlamasız sonuç
  // `64.99999999999999` çıkıyordu (demo fixture'ında görüldü) — DB bunu
  // zaten `65.00`e çevirir, ama bellekte/JSON'da taşınan değer çirkindi ve
  // `Math.round`'a güvenen tüketiciler için gereksiz bir belirsizlikti.
  // Ölçek (0.01 sapma = 1 puan) zaten 2 ondalığın altında anlam taşımaz.
  return Math.round(clamped * 100) / 100;
}
