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
  /**
   * docs/ALGORITHMS.md §11'deki MarketValue formülü 0-100 ölçeğinde bir
   * "değer puanı" üretir (ağırlıklar toplamı 1.0); bunu gerçek bir para
   * miktarına çeviren proje-içi ölçek sabiti (brief bu dönüşüm için bir
   * birim tanımlamaz — race.config.json'daki `referenceSpeedMps` ile aynı
   * gerekçe: soyut 0-100 puanı somut oyun birimine çevirmek).
   */
  baseMarketValueMultiplier: number;
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
  /**
   * Ortak ata tespit edilirse (bkz. `docs/GENETICS.md` §6 inbreeding_factor)
   * `birth_health_risk` formülüne uygulanan çarpan. 1.0 = etkisiz.
   */
  inbreedingRiskMultiplier: number;
  /**
   * `docs/GENETICS.md` §6 parent_age_factor — ebeveynin yaşam evresine
   * (bkz. `HorseGrowthConfig.stages[].name`) göre doğum sağlık riski
   * çarpanı. Prime döneminde en düşük risk beklenir.
   */
  parentAgeRiskMultipliers: Record<string, number>;
  /** `docs/GENETICS.md` §6 parent_health_factor'ün ağırlığı. */
  healthRiskWeight: number;
  /** `docs/GENETICS.md` §6 base_risk — hiçbir risk faktörü yokken taban doğum sağlık riski [0,1]. */
  baseBirthHealthRisk: number;
  /** Üreme için minimum/maksimum yaş (ay). `docs/GENETICS.md`'de sayısal olarak belirtilmemiştir — proje-içi karar. */
  minBreedingAgeMonths: number;
  maxBreedingAgeMonths: number;
  /** Bir kısrağın iki doğum arası beklemesi gereken gün sayısı. */
  breedingCooldownDays: number;
  /** Damızlık ücreti = aygırın (quality+potential)/2 ortalaması × bu çarpan (brief §31 "Yetiştiricilik" gider kalemi). */
  studFeeMultiplier: number;
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

/**
 * Ahır (temel kapasite) — brief §32 "Stable Level 1→5, Level 2→8, Level 3→12"
 * örneğinden alınan sayılar; FAZ 1 kapsamı yalnızca kapasite artışıdır.
 * Paddock/veteriner merkezi/nalbant alanı/üreme merkezi gibi tam Çiftlik
 * (Farm) bina sistemi FAZ 4'e bırakılmıştır (bkz. docs/ROADMAP.md).
 */
export interface StableConfig {
  /** Anahtar = ahır seviyesi (string, JSON kısıtı), değer = at kapasitesi. */
  capacityByLevel: Record<string, number>;
  /** Bu değerin altındaki health, "Ahır Özeti" ekranında uyarı olarak gösterilir (brief §38). */
  healthWarningThreshold: number;
  /**
   * FAZ 2 — brief §32 "Upgrade örneği" listesinin devamı. Anahtar = ULAŞILACAK
   * seviye (örn. "2" → seviye 1'den 2'ye yükseltme maliyeti). En yüksek
   * anahtarın üstünde tanım yoksa `getNextStableUpgradeCost`
   * `MaxStableLevelReachedError` fırlatır.
   */
  upgradeCostByLevel: Record<string, { currency: 'money' | 'gems'; amount: number }>;
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

/**
 * FAZ 2 — brief §13 jokey-at uyumu (docs/ALGORITHMS.md §12) ve jokeyin
 * `RaceEntrantSnapshot.jockeySkillComposite` (bkz. domain/race/base-ability.ts)
 * için tek bir "yetenek bileşimi" puanına indirgenmesi.
 */
export interface JockeyConfig {
  /** Toplamı 1.0 olmalıdır — jockeys tablosundaki tekil yetenek alanlarının ağırlıkları. */
  skillCompositeWeights: {
    startSkill: number;
    tacticalSkill: number;
    sprintSkill: number;
    horseControl: number;
    riskManagement: number;
    trackKnowledge: number;
  };
  /** Toplamı 1.0 olmalıdır — docs/ALGORITHMS.md §12 uyumluluk bileşenleri. */
  compatibilityWeights: {
    temperament: number;
    style: number;
    experience: number;
    history: number;
  };
  /** Bu deneyim (yarış sayısı) değerine ulaşınca experience_component 100'e doyar. */
  experienceForMaxScore: number;
  /** at-jokey ikilisinin hiç ortak geçmişi yoksa previous_pair_history_component için nötr varsayılan. */
  neutralHistoryScore: number;
}

/**
 * FAZ 4 — brief §32 ÇİFTLİK (Farm) tesisleri (bkz. `domain/farm/README.md`).
 * Ahır (`stable`) burada YOKTUR — kendi `StableConfig`'i FAZ 1/2'den beri
 * ayrıdır; bu config sadece EK tesisleri (paddock, antrenman pisti,
 * veteriner merkezi, nalbant alanı, üreme merkezi, depo, personel binası)
 * kapsar.
 */
export interface FacilityLevelDefinition {
  cost: { currency: 'money' | 'gems'; amount: number };
  /**
   * Birim, tesis tipine göre değişir (brief §32 "Bonuslar kontrollü
   * olmalıdır" — tek, basit bir sayı): `staff_building` DIŞINDAKİ 6
   * tesiste [0,1] aralığında bir "azaltma/artış payı" (örn. 0.10 → %10);
   * `staff_building`'de ise mutlak ek personel kapasitesi (tam sayı).
   * Değer, o seviyeye özgü MUTLAK değerdir (bir önceki seviyeye eklenen
   * fark değil) — `StableConfig.capacityByLevel` ile aynı desen.
   */
  bonusValue: number;
}

export interface FacilityDefinition {
  maxLevel: number;
  /** Anahtar = ULAŞILACAK seviye (string, JSON kısıtı). */
  levels: Record<string, FacilityLevelDefinition>;
}

export interface FarmConfig {
  /**
   * Anahtar = tesis tipi (bkz. shared-types `FacilityType`). game-config
   * paketi shared-types'a bağımlı olmadığı için (bkz. ARCHITECTURE.md paket
   * ayrımı, aynı desen `StaffConfig.baseSalaryByRole`'da da kullanılmıştır)
   * burada genel bir `Record<string, ...>` kullanılır.
   */
  facilities: Record<string, FacilityDefinition>;
  /** `staff_building` hiç inşa edilmemişken (level 0) bile geçerli olan taban personel kapasitesi. */
  baseStaffCapacityWithoutFacility: number;
}

/**
 * FAZ 2 — brief §33 Personel Sistemi (jokey hariç, bkz. `staff.ts` yorumu).
 */
export interface StaffConfig {
  /** Rol başına, skill=100 olduğunda uygulanan en yüksek bonus çarpanı payı (örn. 0.20 → en fazla ×1.20). */
  maxBonusMultiplierByRole: Record<string, number>;
  /** Rol başına taban aylık maaş; gerçek maaş = base + skill × salaryPerSkillPoint. */
  baseSalaryByRole: Record<string, number>;
  salaryPerSkillPoint: number;
  /** morale bu eşiğin altındaysa personelin bonusu zayıflar (brief §32 "Bonuslar kontrollü olmalıdır"). */
  moraleSalaryPenaltyThreshold: number;
  /** Düşük moralde bonusun ne kadarının korunacağı (0-1). */
  lowMoraleBonusPenaltyMultiplier: number;
}
