/**
 * config/*.config.json dosyalarının şekli. Bu tipler değiştiğinde
 * ilgili JSON dosyası da güncellenmelidir (ve tam tersi).
 * Kaynak: docs/ALGORITHMS.md
 */

export interface RaceBalanceConfig {
  /**
   * AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — bu config dosyasının KENDİ
   * sürümü (`domain/race/race-engine.ts`'teki `RACE_ENGINE_VERSION`/
   * `RACE_RULESET_VERSION`'dan AYRI). Kod hiç değişmeden SADECE aşağıdaki
   * sayısal denge değerleri (ağırlık/çarpan/eşik) güncellendiğinde bu alan
   * artırılmalıdır — her `races` satırı hangi config sürümüyle üretildiğini
   * kaydeder (bkz. `database/migrations/0021_add_race_versioning.up.sql`),
   * böylece gelecekte config değişse bile ESKİ yarışların hangi denge
   * değerleriyle simüle edildiği bilinir kalır (brief §58 replay/audit).
   */
  version: string;
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
    /**
     * AUDIT_AND_HARDENING Öncelik 6 (bu oturum) — "geç aşama" (closer bonus/
     * front-runner bonusunun bittiği nokta) artık SABİT bir oran (eskiden
     * kod içinde gömülü `LATE_STAGE_THRESHOLD = 0.75`) DEĞİL, gerçek
     * yarışçılıktaki "son düzlük" kavramına daha yakın, METRE cinsinden
     * SABİT bir mesafedir (bkz. `domain/race/pace.ts` doc yorumu). Pist
     * uzunluğuna bölünüp bir orana çevrilir ve makul bir aralığa
     * kırpılır — bu sayede kısa bir sprint'te final düzlüğü orantısız
     * büyük, uzun bir yarışta orantısız küçük OLMAZ (brief §52 "segmentler
     * pist geometrisine daha duyarlı olmalı").
     */
    finalStretchMeters: number;
  };
  /**
   * FAZ 5 — brief §21 overtake_probability formülü (bkz. `domain/race/
   * overtaking.ts`). FAZ 1'deki basit `closerTrafficRisk` (stil bazlı, sabit
   * olasılık) tamamen bu gerçek, pozisyon/kulvar farkındalıklı modelle
   * DEĞİŞTİRİLMİŞTİR — bkz. ALGORITHMS.md §6 "Uygulama notu (FAZ 5)".
   */
  overtaking: {
    /** Bir geçiş denemesi BAŞARISIZ olursa uygulanan performans cezası. */
    blockPenalty: number;
    accelerationWeight: number;
    speedDifferenceWeight: number;
    courageWeight: number;
    jockeySkillWeight: number;
    availableSpaceWeight: number;
    /** `RiskLevel` → "cesaret" puanı eşlemesi (bkz. ALGORITHMS.md §6 notu). */
    courageByRiskLevel: Record<string, number>;
    /** Aynı kulvarı paylaşan HER ek at, `availableSpace`'ten bu kadar puan düşürür. */
    spacePerOccupant: number;
    /** `defend_position` kararı veren at, geçilme olasılığını bu kadar azaltır. */
    defendPositionBonus: number;
    /** Bu ms'den daha yakın bir zaman farkı "burun buruna" (bloklanma adayı) sayılır. */
    closeGapMs: number;
  };
  /** FAZ 5 — brief §21 "iç/dış kulvar" (bkz. `domain/race/overtaking.ts`). */
  lanes: {
    count: number;
    /** Anahtar = `RacingStyle`; game-config paketi shared-types'a bağımlı olmadığı için genel `Record`. */
    initialLaneByStyle: Record<string, number>;
  };
  /** FAZ 5 — brief §16 Aşama 6 "Final sprint" (bkz. `domain/race/sprint.ts`). */
  sprint: {
    /** `runtimeStamina` bunun altındaysa sprint kararı hiç değerlendirilmez. */
    staminaReserveThreshold: number;
    bonusMultiplier: number;
  };
  /** FAZ 5 — brief §60 jokey AI karar ağacı (bkz. `docs/RACE_ENGINE.md` §8, `domain/race/jockey-decisions.ts`). */
  jockeyDecision: {
    staminaLowThreshold: number;
    /** Pace.ts'teki genel "geç aşama" eşiğinden (0.75) daha dar bir "gerçek final düz yolu" penceresi. */
    finalStraightPositionFraction: number;
    opponentCloseGapMs: number;
    /** Bu risk seviyelerinde `defend_position` kararı alınabilir (brief §60 "risk_allowed"). */
    riskAllowedRiskLevels: string[];
  };
  /**
   * FAZ 5 — brief'in ayrı bir madde olarak listelediği "Fatigue" (bkz.
   * ALGORITHMS.md §6 notu): FAZ 1'deki statik `preRaceFatigueFactor`'dan
   * FARKLI olarak, yarış SIRASINDA biriken dinamik bir yorgunluktur.
   */
  fatigue: {
    accumulationPerSegment: number;
    /** `reduce_pace` kararı verildiğinde birikim bu çarpanla YAVAŞLAR. */
    reducePaceAccumulationMultiplier: number;
    performancePenaltyPerFatiguePoint: number;
    maxRuntimeFatigue: number;
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
  /**
   * FAZ 1 wiring, dokuzuncu dilim — `raceEntryFeeMultiplier` daha önce
   * (altıncı/yedinci dilimlerden beri) taslakta duruyordu ama hiçbir temel
   * ücret değeri yoktu (`ioredis`'in `package.json`'da hazır ama hiç
   * wiring edilmemiş olmasıyla AYNI "önceden hazırlanmış iskelet" deseni).
   * `POST /horses/{id}/practice-race` bu ikisini birlikte KULLANAN İLK
   * use-case'tir (bkz. `domain/race/prize.ts`). `prizeByFinishPosition`
   * dizisinin uzunluğu şu an sabit `PRACTICE_RACE_BOT_COUNT + 1` (6) ile
   * eşleşir; aralık dışı bir sıralama (dizi kısa kalırsa) ödülsüz (0)
   * kabul edilir — çökme YOK (bkz. `getPracticeRacePrize` doc yorumu).
   */
  practiceRace: {
    baseEntryFee: number;
    prizeByFinishPosition: number[];
  };
  /** brief §31/§42 — yeni oyuncu hesabı oluşturulunca verilen başlangıç bakiyesi. */
  newPlayerStartingBalance: {
    money: number;
    gems: number;
  };
  /**
   * FAZ 1 wiring, yedinci dilim — brief §37 "GÜNLÜK OYUN DÖNGÜSÜ" (Login →
   * Daily Reward → ...). `domain/economy/daily-reward.ts`'in
   * `canClaimDailyReward`'ı bunu kullanır — `care.config.json`'daki
   * `cooldownMinutes` alanlarıyla AYNI desen (kayan pencere, takvim günü
   * DEĞİL — bkz. o dosyadaki doc yorumu).
   */
  dailyRewardCooldownHours: number;
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

/**
 * AUDIT_REPORT.md H1 düzeltmesi (bu oturum) — brief'te büyüklüğü
 * belirtilmeyen "sakatlıktan iyileşme" davranışı için NET bir kural:
 * `action` türünde bir bakım eylemi UYGULANDIKTAN SONRA (yani deltalar
 * zaten hesaba katılmış haldeyken) at `injured` durumundaysa ve
 * `HorseHealth.injuryRisk` <= `maxInjuryRisk` VE `Horse.health` (vital) >=
 * `minHealth` ise, at `active`'e döner. Öncesinde HİÇBİR yol bu geçişi
 * sağlamıyordu (bkz. `domain/horse/errors.ts` `HorseInjuredError` — sakat
 * bir at antrenman/pratik yarış/PvP eşleştirmenin HEPSİNDEN kalıcı olarak
 * reddediliyordu).
 */
export interface InjuryRecoveryConfig {
  action: CareActionType;
  minHealth: number;
  maxInjuryRisk: number;
}

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
  /** AUDIT_REPORT.md H1 — bkz. `InjuryRecoveryConfig` üstündeki not. */
  injuryRecovery: InjuryRecoveryConfig;
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

/**
 * FAZ 7 — brief §41-44 Online mimari (bkz. `domain/online/`, `domain/
 * ranking/`, `domain/club/`, `domain/tournament/`, `domain/season/`).
 */
export interface OnlineConfig {
  /** brief §43 "Elo benzeri sistem PvP için ayrıca uygulanabilir" (bkz. `domain/online/elo.ts`). */
  elo: {
    initialRating: number;
    /** Bir maç sonucunun reytingi ne kadar değiştireceğini belirleyen katsayı (standart Elo K-faktörü). */
    kFactor: number;
    /** Reyting bu değerin altına düşemez (brief'te yok, proje-içi taban — çok kötü bir seri reytingi negatife düşürmemelidir). */
    minRating: number;
  };
  /** brief §41 Online Mimari — eşleştirme kuyruğu genişleme kuralları (bkz. `domain/online/matchmaking.ts`). */
  matchmaking: {
    /** Kuyruğa girer girmez kabul edilen reyting farkı. */
    initialRatingRangeWidth: number;
    /** Her bekleme saniyesinde reyting aralığının ne kadar genişleyeceği (uzun bekleyen oyuncu için daha geniş eşleşme havuzu). */
    rangeExpansionPerSecond: number;
    /** Aralık bu değeri asla aşamaz (çok farklı seviyede eşleşmeyi önler). */
    maxRatingRangeWidth: number;
  };
  /** brief §43 RankingScore = RacePerformance + WinBonus + PlacementBonus + TournamentBonus (bkz. `domain/ranking/ranking-score.ts`). */
  ranking: {
    racePerformanceWeight: number;
    winBonus: number;
    /** Anahtar = derece (1, 2, 3, ...), değer = o dereceye özgü bonus puan. Listede olmayan dereceler 0 bonus alır. */
    placementBonusByPlacement: Record<string, number>;
    tournamentBonusMultiplier: number;
  };
  /** brief §44 KULÜP (bkz. `domain/club/club.ts`). */
  club: {
    maxMembers: number;
    /** Anahtar = ULAŞILACAK kulüp seviyesi, değer = o seviye için gereken TOPLAM (kümülatif) kulüp puanı. */
    levelThresholds: Record<string, number>;
  };
  /** brief §35 YARIŞ TAKVİMİ "Özel kupalar/Büyük ödüllü yarışlar" turnuva karşılığı (bkz. `domain/tournament/tournament.ts`). */
  tournament: {
    tiers: Record<
      string,
      {
        minPlayerLevel: number;
        entryFee: number;
        maxParticipants: number;
      }
    >;
    /** Anahtar = final sırası (1, 2, 3, ...), değer = ödül havuzunun bu sıraya ayrılan payı (0-1). Toplamı 1.0'ı aşmamalıdır. */
    prizeDistributionByPlacement: Record<string, number>;
  };
  /** brief §69 SEZON SİSTEMİ (bkz. `domain/season/season.ts`). */
  season: {
    durationDays: number;
  };
}
