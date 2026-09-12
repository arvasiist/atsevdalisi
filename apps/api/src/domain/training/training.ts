/**
 * Antrenman algoritmaları (docs/ALGORITHMS.md §1, brief §10).
 *
 * Tüm sabitler/ağırlıklar `config/training.config.json` üzerinden
 * `TrainingConfig` tipiyle enjekte edilir; kodda "sihirli sayı" YOKTUR
 * (brief §52, Kural 6/7). Fonksiyonlar saftır (pure) — DB/Redis/zaman
 * erişimi yoktur; çağıran (application layer) girdileri hazırlar,
 * sonucu persist eder.
 */

import { clamp, createSeededRandom } from '@at-sevdalisi/shared-types';
import type { TrainingConfig, TrainingTypeConfig } from '@at-sevdalisi/game-config';
import type { NumericHorseStatField, TrainingIntensity, TrainingType } from '@at-sevdalisi/shared-types';
import { checkTrainingReadiness, type VitalSigns } from '../horse/vital-signs';
import { HorseNotReadyForTrainingError, InvalidTrainingInputError } from './errors';

export interface TrainingContext {
  trainingType: TrainingType;
  intensity: TrainingIntensity;
  durationMinutes: number;
  /** Antrenman edilen stat'ın antrenman ÖNCESİ değeri (0-100). */
  currentStatValue: number;
  /** Atın potansiyeli (brief §8.2, 0-100) — stat bunu asla aşamaz. */
  potential: number;
  /** Antrenman öncesi durum değerleri (health, fatigue vb.). */
  vitals: VitalSigns;
  /** Atın yaşı (ay) — yaşlı atlarda sakatlık riski artar. */
  ageMonths: number;
  /**
   * İleride eğitmen/jokey sistemi bağlanınca kullanılacak çarpan.
   * Şimdilik varsayılan 1.0 (nötr) — brief'te "trainer_factor" olarak
   * adı geçer ama FAZ 1 kapsamında ayrı bir eğitmen varlığı yoktur.
   */
  trainerFactor?: number;
}

export interface TrainingOutcome {
  /** Antrenman edilen stat'a eklenecek net kazanç (>= 0). */
  statGain: number;
  /** Fatigue'a eklenecek net artış (>= 0; rest türü için negatif olabilir). */
  fatigueGain: number;
  /** [0, 1] aralığında sakatlanma olasılığı. */
  injuryRisk: number;
}

const MAX_STAT = 100;
const MAX_VITAL = 100;

/**
 * KAPSAM NOTU (bu dilim, bilinçli): `durationMinutes` için burada bir
 * ALT/ÜST sınır DOĞRULAMASI yapılmaz — DTO'daki (`domain/training/
 * validation.ts` sabitleriyle) `@Min`/`@Max` kontrolü bunu karşılar ve
 * yanlış bir değer burada bir İSTİSNA fırlatmaz (yalnızca beklenmedik
 * bir çarpan üretir) — `type`/`intensity`'nin AKSİNE, kod burada
 * ÇÖKMEZ. İleride gerekirse bu fonksiyona da AYNI desenle bir kontrol
 * eklenebilir.
 */
function getDurationMultiplier(config: TrainingConfig, durationMinutes: number): number {
  const units = durationMinutes / config.durationMultiplier.unitMinutes;
  // Taban çarpan 1.0'dır; her ek "unit" perUnit kadar ekler (brief §10 - süre etkisi).
  return 1 + (units - 1) * config.durationMultiplier.perUnit;
}

/**
 * FAZ 1 wiring, dördüncü dilim (CI Hata 7, bkz. `errors.ts`
 * `InvalidTrainingInputError` üstündeki not): DTO'daki `@IsIn(...)`
 * kontrolü esbuild altında atlanabildiğinden, `type`/`intensity`
 * config'de TANIMLI OLMAYAN bir değer geldiğinde burada da (domain
 * katmanında) `InvalidTrainingInputError` fırlatılır — aksi halde
 * `config.types[trainingType]`/`config.intensityMultipliers[intensity]`
 * `undefined` döner ve `.baseGain` gibi bir erişim ÇÖKER (ham
 * `TypeError`, `HttpExceptionFilter`'ın hiçbir domain hata eşlemesine
 * uymayan, istemciye `500 INTERNAL_ERROR` olarak yansıyan tipte bir hata).
 */
function getIntensityMultiplier(config: TrainingConfig, intensity: TrainingIntensity): number {
  const multiplier = config.intensityMultipliers[intensity];
  if (multiplier === undefined) {
    throw new InvalidTrainingInputError(`Geçersiz antrenman yoğunluğu: "${String(intensity)}".`);
  }
  return multiplier;
}

function getTypeConfig(config: TrainingConfig, trainingType: TrainingType): TrainingTypeConfig {
  const typeConfig = config.types[trainingType];
  if (typeConfig === undefined) {
    throw new InvalidTrainingInputError(`Geçersiz antrenman türü: "${String(trainingType)}".`);
  }
  return typeConfig;
}

/**
 * docs/ALGORITHMS.md §1: "Diminishing returns" — potansiyele yaklaştıkça
 * gelişim yavaşlar; `currentStatValue` hiçbir zaman `potential`'ı aşamaz.
 * `potential`'a zaten ulaşılmışsa (veya geçilmişse) kazanç 0'dır.
 */
export function calculateStatGain(
  config: TrainingConfig,
  ctx: Pick<
    TrainingContext,
    'trainingType' | 'intensity' | 'durationMinutes' | 'currentStatValue' | 'potential' | 'vitals' | 'trainerFactor'
  >,
): number {
  const typeConfig = getTypeConfig(config, ctx.trainingType);
  const ceiling = Math.min(ctx.potential, MAX_STAT);
  if (ctx.currentStatValue >= ceiling) {
    return 0;
  }

  const remainingRoom = (ceiling - ctx.currentStatValue) / ceiling;
  const effectiveGain = typeConfig.baseGain * remainingRoom ** config.diminishingExponent;

  const intensityMultiplier = getIntensityMultiplier(config, ctx.intensity);
  const durationMultiplier = getDurationMultiplier(config, ctx.durationMinutes);
  // health_factor: düşük sağlıkta antrenman verimi düşer (0.5 - 1.0 aralığı).
  const healthFactor = 0.5 + 0.5 * (ctx.vitals.health / MAX_VITAL);
  // recovery_factor: yüksek fatigue ile başlanan antrenmanda kazanç düşer.
  const recoveryFactor = 1 - 0.5 * (ctx.vitals.fatigue / MAX_VITAL);
  const trainerFactor = ctx.trainerFactor ?? 1.0;

  const gain =
    effectiveGain * intensityMultiplier * durationMultiplier * healthFactor * recoveryFactor * trainerFactor;

  const cappedGain = Math.min(gain, ceiling - ctx.currentStatValue);
  return Math.max(0, cappedGain);
}

/** docs/ALGORITHMS.md §1: fatigue_gain formülü. */
export function calculateFatigueGain(
  config: TrainingConfig,
  ctx: Pick<TrainingContext, 'trainingType' | 'intensity' | 'durationMinutes' | 'vitals'>,
): number {
  const typeConfig = getTypeConfig(config, ctx.trainingType);
  const intensityMultiplier = getIntensityMultiplier(config, ctx.intensity);
  const durationMultiplier = getDurationMultiplier(config, ctx.durationMinutes);
  // current_fatigue_modifier: zaten yorgun bir at, ek yorgunluktan orantısız etkilenir.
  const currentFatigueModifier = 1 + ctx.vitals.fatigue / MAX_VITAL;

  return typeConfig.baseFatigue * intensityMultiplier * durationMultiplier * currentFatigueModifier;
}

/** docs/ALGORITHMS.md §1: injury_risk formülü. Sonuç [0, 1] aralığına clamp edilir. */
export function calculateInjuryRisk(
  config: TrainingConfig,
  ctx: Pick<TrainingContext, 'trainingType' | 'intensity' | 'vitals' | 'ageMonths'>,
): number {
  const typeConfig = getTypeConfig(config, ctx.trainingType);
  const intensityMultiplier = getIntensityMultiplier(config, ctx.intensity);
  // fatigue_modifier: yorgunluk arttıkça risk artar (1.0 - 2.0 aralığı).
  const fatigueModifier = 1 + ctx.vitals.fatigue / MAX_VITAL;
  // health_modifier: düşük sağlık riski artırır (1.0 - 2.0 aralığı).
  const healthModifier = 1 + (1 - ctx.vitals.health / MAX_VITAL);
  // age_modifier: çok genç (< 18 ay) ve yaşlı (> 96 ay) atlarda risk artar.
  const ageModifier = ctx.ageMonths < 18 || ctx.ageMonths > 96 ? 1.3 : 1.0;

  const risk = typeConfig.baseInjuryRisk * intensityMultiplier * fatigueModifier * healthModifier * ageModifier;

  // baseInjuryRisk config'de yüzde puanı (örn. 0.8 = %0.8) olarak tanımlı; [0,1] olasılığa çevrilir.
  return clamp(risk / 100, 0, 1);
}

/**
 * Bir antrenman oturumunun tüm etkilerini hesaplar. At hazır değilse
 * (`checkTrainingReadiness` başarısız) `HorseNotReadyForTrainingError` fırlatır
 * — antrenman application layer'da hiç yaratılmamalıdır.
 */
export function applyTraining(config: TrainingConfig, ctx: TrainingContext): TrainingOutcome {
  const readiness = checkTrainingReadiness(ctx.vitals, config.readinessThresholds);
  if (!readiness.ready) {
    throw new HorseNotReadyForTrainingError(readiness.reason!);
  }

  return {
    statGain: calculateStatGain(config, ctx),
    fatigueGain: calculateFatigueGain(config, ctx),
    injuryRisk: calculateInjuryRisk(config, ctx),
  };
}

/**
 * Sakatlık olup olmadığına deterministik olarak karar verir (brief §18 —
 * Math.random() YASAK, RaceEngine dışında da geçerli bir prensip olarak
 * uygulanır). `seed` çağıran taraftan gelir (örn. `${trainingSessionId}:injury`).
 */
export function rollInjuryOccurred(injuryRisk: number, seed: string): boolean {
  const rng = createSeededRandom(seed);
  return rng() < injuryRisk;
}

/**
 * FAZ 1 wiring, dördüncü dilim: antrenman türünün hangi GÖRÜNEN stat'ı
 * (brief §7 `HorseStats`) birincil olarak etkilediğine dair eşleme —
 * `POST /horses/{id}/train` yanıtındaki `statChanges`'in kaynağı
 * (docs/API.md §4).
 *
 * KARAR (bu dilim, bilinçli kapsam — bkz. docs/ROADMAP.md "Dördüncü
 * dilim: Antrenman"): yalnızca TEK bir birincil stat güncellenir; brief'in
 * örneklediği ikincil/sinerji etkileri (örn. "sprint" antrenmanının
 * `acceleration`'ı da bir miktar etkilemesi) bu dilimin KAPSAMI
 * DIŞINDADIR. `rest` türünün karşılığı yoktur — zaten `baseGain: 0`
 * (config/training.config.json), hiçbir stat'ı değiştirmez, yalnızca
 * `fatigue`'u düşürür.
 */
export function getPrimaryStatKey(trainingType: TrainingType): NumericHorseStatField | null {
  const map: Record<TrainingType, NumericHorseStatField | null> = {
    speed: 'speed',
    sprint: 'sprint',
    stamina: 'stamina',
    start: 'startSpeed',
    cornering: 'cornering',
    tempo: 'midSpeed',
    rest: null,
  };
  return map[trainingType];
}
