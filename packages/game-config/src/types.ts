/**
 * config/*.config.json dosyalarının şekli. Bu tipler değiştiğinde
 * ilgili JSON dosyası da güncellenmelidir (ve tam tersi).
 * Kaynak: docs/ALGORITHMS.md
 */

export interface RaceBalanceConfig {
  baseAbilityWeights: {
    speed: number;
    stamina: number;
    acceleration: number;
    fitness: number;
    tactic: number;
    jockey: number;
    trackCompatibility: number;
    morale: number;
    form: number;
  };
  randomFactorRange: [number, number];
  segmentLengthMeters: number;
  pace: {
    frontRunnerStaminaMultiplier: number;
    frontRunnerPositionBonus: number;
    closerStaminaMultiplier: number;
    closerLateStageBonus: number;
    closerTrafficRisk: number;
  };
  overtaking: {
    blockPenalty: number;
  };
  distance: {
    shortMaxMeters: number;
    middleMaxMeters: number;
  };
  distanceWeightAdjustments: {
    short: Record<string, number>;
    middle: Record<string, number>;
    long: Record<string, number>;
  };
  /**
   * BaseAbility'yi (0-100 ölçeğinde bir "performans puanı") gerçek bir
   * segment hızına (m/s) çeviren referans değer — brief'in kendisi bu
   * dönüşüm için bir birim tanımlamaz, bu proje-içi bir tasarım kararıdır
   * (docs/RACE_ENGINE.md, tipik bir yarış atı ortalama hızına yakın).
   */
  referenceSpeedMps: number;
  stamina: {
    /**
     * Bir atın segment içi (runtime) stamina'sı tükenince (brief §20 pace
     * sistemi — "önde git" erken tükenme riski taşır) uygulanan performans
     * ceza çarpanı.
     */
    depletionPenaltyMultiplier: number;
  };
}

export interface TrainingTypeConfig {
  baseGain: number;
  baseFatigue: number;
  baseInjuryRisk: number;
}

export interface TrainingConfig {
  diminishingExponent: number;
  types: Record<'speed' | 'sprint' | 'stamina' | 'start' | 'cornering' | 'tempo' | 'rest', TrainingTypeConfig>;
  intensityMultipliers: Record<'low' | 'medium' | 'high', number>;
  durationMultiplier: {
    unitMinutes: number;
    perUnit: number;
  };
  readinessThresholds: {
    minEnergyToTrain: number;
    maxFatigueToTrain: number;
  };
}

export interface EconomyConfig {
  marketValueWeights: {
    quality: number;
    potential: number;
    ageFactor: number;
    raceHistory: number;
    pedigreeValue: number;
    health: number;
  };
  gemShopWhitelist: string[];
  dailyRewardMoney: number;
  raceEntryFeeMultiplier: number;
  /** brief §31/§42 — yeni oyuncu hesabı oluşturulunca verilen başlangıç bakiyesi. */
  newPlayerStartingBalance: {
    money: number;
    gems: number;
  };
}

export interface GeneticsConfig {
  inheritanceRange: [number, number];
  mutationBounds: [number, number];
  maxPotentialGainOverParents: number;
}

export interface WeatherCombinationEffect {
  surfaceModifier: number;
  weatherModifier: number;
}

export interface WeatherConfig {
  combinations: Record<string, WeatherCombinationEffect>;
}

export interface HorseGrowthStage {
  name: string;
  minAgeMonths: number;
  maxAgeMonths: number | null;
  growthFactor: number;
}

export interface HorseGrowthConfig {
  stages: HorseGrowthStage[];
}

export interface ProgressionUnlock {
  level: number;
  feature: string;
}

export interface ProgressionConfig {
  maxLevel: number;
  unlocks: ProgressionUnlock[];
  /**
   * brief §36 sadece level aralığını (1-50) ve unlock noktalarını tanımlar,
   * XP eğrisinin şeklini belirtmez — bu proje-içi bir tasarım kararıdır:
   * xpToReachLevel(level) = baseXpPerLevel × level ^ exponent (üstel artan
   * bir eğri, üst seviyelere çıkmak orantısız şekilde zorlaşır).
   */
  xpCurve: {
    baseXpPerLevel: number;
    exponent: number;
  };
}

/** brief §11 Bakım Sistemi — tımar/su/temizlik/veteriner/nalbant/dinlendir. */
export interface CareActionEffect {
  vitalDelta?: Partial<Record<'health' | 'fitness' | 'fatigue' | 'energy' | 'morale', number>>;
  /** HorseHealth.injuryRisk üzerindeki etki (brief §11 Nalbant/Veteriner: "Injury risk azaltma"). */
  injuryRiskDelta?: number;
  /** HorseHealth.recoveryRate üzerindeki etki (brief §11 Su/Veteriner: "Recovery +"). */
  recoveryRateDelta?: number;
  /** HorseHealth.jointCondition üzerindeki etki (brief §11 Nalbant: "Hoof condition", "Running stability"). */
  jointConditionDelta?: number;
  cost: { currency: 'money' | 'gems'; amount: number };
  cooldownMinutes: number;
}

export type CareActionType = 'groom' | 'water' | 'clean' | 'vet' | 'farrier' | 'rest';

export interface FeedTypeEffect {
  vitalDelta?: Partial<Record<'health' | 'fitness' | 'fatigue' | 'energy' | 'morale', number>>;
  /** HorseHealth.weightCondition üzerindeki etki — brief §12: "her zaman daha pahalı yem = daha iyi olmayacaktır". */
  weightConditionDelta?: number;
  recoveryRateDelta?: number;
  cost: { currency: 'money' | 'gems'; amount: number };
}

export type FeedType = 'standard' | 'energy' | 'protein' | 'recovery' | 'performance';

export interface CareConfig {
  actions: Record<CareActionType, CareActionEffect>;
  feedTypes: Record<FeedType, FeedTypeEffect>;
}
