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
    /**
     * R4 — Carried Weight, SADECE at vücut ağırlığı alt-faktörü (bkz.
     * `apps/api/src/domain/race/carried-weight.ts`'in doc yorumu; brief
     * hardening-realism-master-plan.md §26). `tactic`'in `0.10`'dan
     * `0.05`'e düşürülmesiyle açılan bütçeden karşılanır (toplam HALA 1.00).
     */
    carriedWeight: number;
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
  /**
   * 01.10.2026 — OYUNCU KONTROLÜ (yalnızca `RaceSimulationInput.playerCommands`
   * verildiğinde okunur; komutsuz yarışta HİÇBİR etkisi yoktur).
   * Kırbaç sınırsızdır (proje sahibinin kararı) ama her biri
   * `whipStaminaCost` dayanıklılık yakar; hız bonusu sprint bonusunun
   * `kırbaç^whipBonusExponent` katıdır (azalan getiri). Dayanıklılık sprint
   * rezervinin altındaysa kırbaç bonus VERMEZ, yalnızca yakar (yorgun at
   * kırbaca cevap vermez). `maxWhipsPerSegment` oyun kuralı değil, kayıt
   * sınırıdır (spam'in veritabanını şişirmesini önler).
   */
  playerControl: {
    whipStaminaCost: number;
    whipBonusExponent: number;
    maxWhipsPerSegment: number;
    /** Kırbaç başına eklenen KALICI yarış içi yorgunluk (performans cezası `fatigue.performancePenaltyPerFatiguePoint`). */
    whipFatigue: number;
    /** Oyuncunun "sakin" komutunda segment performansından düşülen puan (at yavaşlar). */
    easeSpeedPenalty: number;
    /** "Sakin" segmentinde dayanıklılık tüketim çarpanı (< 1 = biriktirir). */
    easeStaminaFactor: number;
  };
  /**
   * PHASE 6 — `RaceTacticInput`'in motor tarafından OKUNAN iki alanı
   * (`startApproach`, `finalStretchPlan`). Bu ikisi daha önce yalnızca
   * `assertValidRaceTactic` ile DOĞRULANIYOR ama hiçbir yerde
   * TÜKETİLMİYORDU — yani oyuncunun seçtiği değer sonucu değiştirmiyordu.
   * Bkz. `domain/race/pace.ts` → `deriveTacticEffect`.
   *
   * **Her iki eksen de KAPALI bir ödünleşimdir** (trade-off): hiçbir seçenek
   * diğerini domine etmez — biri erken puan kazandırıp stamina yakar, diğeri
   * stamina biriktirip puan kaybettirir. Gizli/hileli bonus YOKTUR: bütün
   * sayılar bu dosyadadır ve istemciye `RaceTacticInput` ile yansıtılır.
   */
  tactic: {
    /** `startApproach` etkisinin uygulandığı başlangıç penceresi (0=start, 1=finish). */
    startApproachWindowFraction: number;
    /** Final düzlükte plan başına bonusun TABANI (plan çarpanıyla ölçeklenir). */
    finalStretchPlanBaseBonus: number;
    /**
     * Anahtar = `StartApproach`; game-config shared-types'a bağımlı olmadığı
     * için genel `Record`. İki bonus ZIT İŞARETLİ ve EŞİT BÜYÜKLÜKTEDİR:
     * "sert kalk" erken puan kazanır, final düzlükte TAM AYNI miktarı geri
     * verir (kapalı ödünleşim — toplam değişmez, yalnızca ZAMANLAMA değişir).
     * Stamina çarpanı BİLEREK yoktur: `baseStaminaConsumptionPerSegment`
     * zaten 100/segmentCount'tur, yani stamina tam olarak bitişte tükenir;
     * 1.0'ın üstündeki her çarpan son segmenti `depletionPenaltyMultiplier`a
     * sokar ve ödünleşim bıçak sırtına döner (ölçüldü — bkz.
     * `tactic-effect.spec.ts`).
     */
    startApproach: Record<string, { earlyPerformanceBonus: number; latePerformanceBonus: number }>;
    /** Anahtar = `FinalStretchPlan`; aynı gerekçeyle genel `Record`. */
    finalStretchPlan: Record<
      string,
      { bonusMultiplier: number; windowMultiplier: number; staminaConsumptionMultiplier: number }
    >;
  };
  /**
   * PHASE 6.3 — `horse_stats.temperament` (kişilik/mizaç) ekseninin motor
   * etkisi (bkz. `domain/race/temperament.ts`).
   *
   * **Yön:** yüksek temperament = huysuz/istekli at → startta öne fırlar
   * (`startBonusMax`) ama final düzlükte AYNI MİKTARI geri verir
   * (`latePenaltyMax`) ve erken pencerede daha çok stamina yakar
   * (`energyCostMax`); düşük temperament bunun tam tersidir. `startBonusMax`
   * ile `latePenaltyMax` EŞİT tutulmalıdır — aksi hâlde bu bir ödünleşim
   * değil, gizli bir bonus/ceza olur (bkz. `temperament.spec.ts` simetri
   * iddiası; test bu eşitliği config üzerinden OKUYARAK kontrol eder).
   *
   * **`neutral` neden config'te:** 50 sabitini koda gömmek, `temperament`
   * ölçeğinin anlamını tek bir dosyaya kilitlemek olurdu; ayrıca
   * `deriveTemperamentEffect` "tam olarak `neutral` ise no-op" kapısını bu
   * değere göre kurar, yani config değişirse no-op noktası da birlikte
   * kaymalıdır.
   */
  temperament: {
    /** No-op noktası. `temperament` tam buna eşitse motor hiçbir şey yapmaz. */
    neutral: number;
    /**
     * HER İKİ pencerenin de genişliği (yarışın oranı olarak). Motor bunu
     * `windowFraction × segmentCount` ile SEGMENT sayısına çevirir ve iki uçta
     * AYNI sayıda segment uygular — oranla karşılaştırma (`<=` / `>=`) iki
     * pencereye FARKLI sayıda segment sokup ödünleşimi sessizce açardı (bkz.
     * `domain/race/temperament.ts` dosya başındaki ⚠️ not: 1600m'de 2 vs 3).
     * `floor(segmentCount / 2)` ile sınırlanır, yani pencereler çakışamaz.
     */
    windowFraction: number;
    /** Erken pencerede uç değerlerin (±50 sapma) alacağı azami puan. */
    startBonusMax: number;
    /** Final penceresinde uç değerlerin vereceği azami puan — `startBonusMax` ile EŞİT olmalı. */
    latePenaltyMax: number;
    /** Uç değerlerin erken/final penceredeki stamina tüketim sapması (çarpan ±). */
    energyCostMax: number;
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
  /**
   * Proje sahibinin açık talebi (27.09.2026) — "hazır olan kişiler
   * yarışabilsinler". Yarışa giriş, antrenmandan DAHA SIKI bir eşik ister:
   * yorgun bir at hafif bir antrenmana sokulabilir ama yarışa sokulamaz
   * (`training.config.json`daki `readinessThresholds` ile KARŞILAŞTIR:
   * orada `minEnergyToTrain` 15, burada `minEnergy` 30). Bu yüzden AYRI bir
   * config bloğudur, antrenmanınkiyle paylaşılmaz — bkz.
   * `domain/race/readiness.ts` `checkRaceReadiness`.
   */
  readiness: {
    /** Yarışa girmek için gereken en düşük enerji (0-100). */
    minEnergy: number;
    /** Yarışa girmek için izin verilen en yüksek yorgunluk (0-100). */
    maxFatigue: number;
    /** Yarışa girmek için gereken en düşük sağlık (0-100). */
    minHealth: number;
  };
}

export interface TrainingTypeConfig {
  baseGain: number;
  baseFatigue: number;
  baseInjuryRisk: number;
}

export interface TrainingConfig {
  diminishingExponent: number;
  types: Record<
    'speed' | 'sprint' | 'stamina' | 'start' | 'cornering' | 'tempo' | 'rest',
    TrainingTypeConfig
  >;
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

/**
 * Tek bir yarış kademesi (bkz. `EconomyConfig.raceTiers` doc yorumundaki
 * tam ekonomik model). `id` istemcinin gönderdiği seçicidir
 * (`POST /horses/:id/practice-race` gövdesindeki `tierId`) ve
 * `domain/race/validation.ts`'teki diğer çalışma-zamanı birleşim
 * listeleriyle AYNI deseni izler: DTO `@IsIn` doğrulaması esbuild altında
 * atlanabildiğinden (bkz. CLAUDE.md) gerçek kontrol HER ZAMAN domain
 * katmanında, config'e karşı yapılır.
 */
export interface RaceTierConfig {
  /** Kararlı seçici kimlik (ör. `local`). Oyuncuya gösterilmez. */
  id: string;
  /** Oyuncuya gösterilen ad (ör. "Mahalli Koşu"). */
  label: string;
  /** Bu kademedeki toplam katılımcı sayısı (oyuncunun atı + bot rakipler). */
  fieldSize: number;
  /** Bir katılımcının yatırdığı Çip — havuzun tamamı bunun katıdır. */
  entryFee: number;
  /**
   * Ödül dağıtımının kimliği — `EconomyConfig.prizeDistributions` içinde
   * ARANIR. Oranlar buraya GÖMÜLMEZ (brief §3 "Ödül sistemi hard-code
   * yapılmamalı. Örneğin: PrizeDistributionConfig oluştur.").
   *
   * NEDEN AYRI BİR KİMLİK (27.09.2026, §42 PHASE 5): önceden her kademe
   * kendi `payoutShares` dizisini taşıyordu. Lobi yarışı (çok oyunculu,
   * kademesiz) da bir dağıtıma ihtiyaç duyunca aynı oranlar İKİNCİ kez
   * yazılacaktı — ve iki kopya kaçınılmaz olarak ayrışır. Artık dağıtımın
   * TEK tanımı `prizeDistributions`'tadır; kademe de, lobi de (bkz.
   * `RaceLobbyConfig.prizeDistributionId`) ona İSİMLE başvurur.
   */
  distributionId: string;
}

/**
 * Adlandırılmış ödül dağıtım şablonu — brief §3 "PRIZE POOL" +
 * §4 "ÇARPAN / MULTIPLIER SİSTEMİ".
 *
 * `shares[i]` = (i+1). sıranın havuzdan aldığı oran. Değişmezler
 * (`domain/race/prize-distribution.ts` → `validatePrizeDistributions`
 * tarafından denetlenir, config elle düzenlenebilir bir JSON olduğu için
 * yalnızca testle kapatılabilir):
 *
 * 1. `Σ shares = 1 − raceRake` — dağıtılmayan pay evin kesintisidir.
 * 2. Her pay POZİTİF ve dizi AZALAN — 1. sıra her zaman en çok kazanır.
 * 3. Dizinin uzunluğu, kullanıldığı yarışın alan büyüklüğünü AŞAMAZ.
 *
 * (1) sağlandığı sürece `Σ ödül < havuz` YAPISAL olarak garantidir: yarış
 * kaç sıraya ödül verirse versin para basamaz (denetim bulgusu E7).
 */
export interface PrizeDistributionConfig {
  /** Kararlı kimlik (ör. `top5`). Oyuncuya gösterilmez. */
  id: string;
  /** Oyuncuya gösterilen ad (ör. "İlk 5"). */
  label: string;
  /** Sıraya göre oranlar — 1. sıra ilk eleman. */
  shares: number[];
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
  /**
   * Proje sahibinin kararı (27.09.2026): "Kesinti olsun (~%10)". Ödül
   * havuzundan dağıtılmayan payın oranı — evin (oyunun) geliri. Her
   * `PrizeDistributionConfig.shares` dizisinin toplamı `1 - raceRake` ETMEK
   * ZORUNDADIR; bu, `raceRake`'in İKİNCİ bir doğruluk kaynağı olmadığı
   * anlamına gelir: dağıtımı belirleyen TEK şey `shares`'tir,
   * `raceRake` ise (a) test edilen AÇIK bir değişmez (bkz.
   * `validatePrizeDistributions`) ve (b) oyuncuya "ev payı" olarak
   * gösterilebilen okunabilir bir sayıdır. İkisi ayrışırsa test kırılır,
   * para sessizce akmaz.
   */
  raceRake: number;
  /**
   * Adlandırılmış ödül dağıtım şablonları — brief §3/§4, §42 PHASE 5.
   * Tüketiciler (kademeler ve lobi yarışı) dağıtıma `distributionId` ile
   * başvurur; oranlar burada TEK KEZ tanımlanır.
   */
  prizeDistributions: PrizeDistributionConfig[];
  /**
   * Yarış kademeleri — proje sahibinin açık talebi (27.09.2026): "yarışlar
   * ücretli olsun, verilen ücret kadarıyla giriş yapan kişiler çarpan
   * olsun ve bir yarışta 8 / 10 / 12 / 14 / 16 at koşabilsin".
   *
   * Ekonomik model (bkz. `domain/race/prize.ts`): havuz = `entryFee ×
   * fieldSize` — bot rakipler de "giriş ücreti ödemiş" sayılır, yani havuz
   * gerçekten doludur. Ödül = `entryFee × shares[sıra] × fieldSize`, yani
   * oyuncunun gördüğü ÇARPAN = `shares[sıra] × fieldSize`'tır (ör. mahalli
   * 1. = 0.375 × 8 = 3.0x giriş ücreti; `shares` artık kademenin kendi
   * dizisi DEĞİL, `distributionId`'nin çözdüğü dağıtımdır). Pay toplamı
   * `1 - raceRake` olduğundan yarış YAPISAL OLARAK para basamaz:
   * dağıtılan < toplanan her zaman. Dağıtım dizisinin uzunluğu ödül alan
   * sıra sayısıdır; `fieldSize`'ı AŞAMAZ (aşarsa kazanan olmayan sıraya
   * ödül tanımlanmış olur — `validateRaceTiers` bunu hata sayar).
   */
  raceTiers: RaceTierConfig[];
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
  /**
   * brief §20 "WALLET SYSTEM", §42 PHASE 4 — cüzdan ekranının işlem
   * geçmişi sayfası. `?limit` verilmediğinde kaç satır döner.
   *
   * `race-lobby.config.json`'daki `lobbyListDefaultLimit`/
   * `lobbyListMaxLimit` ile AYNI desen ve AYNI gerekçe: `LIMIT $n` doğrudan
   * SQL'e gittiği için tavan bir güvenlik sınırıdır, tercih değil.
   */
  walletHistoryDefaultLimit: number;
  /** `?limit` bu değerin üzerindeyse kırpılır (sessizce — istek 400 ALMAZ). */
  walletHistoryMaxLimit: number;
  /**
   * brief §21/§41, §42 PHASE 4b — SANAL (mock) para yatırma.
   *
   * `config/payments.config.json` gibi AYRI bir dosya BİLİNÇLİ OLARAK
   * AÇILMADI: bu blok `economy.config.json`'ın bir parçasıdır çünkü
   * tanımladığı şey bir sağlayıcı ayarı değil, EKONOMİ POLİTİKASIDIR
   * ("bu sunucuda cüzdana para girişi var mı, varsa hangi aralıkta").
   * Gerçek bir sağlayıcının API anahtarları geldiğinde onlar zaten ortam
   * değişkeni olacaktır, config dosyası değil.
   */
  mockDeposit: MockDepositConfig;
  /**
   * 02.10.2026 — MÜZAYEDE. Bir sonraki teklif en az
   * `max(mevcut × minIncrementPercent/100 (yukarı yuvarlanır), minIncrementAmount)`
   * kadar yüksek olmalıdır; ilk teklif en az başlangıç fiyatıdır.
   * `settleScheduler` süresi dolan müzayedeleri kapatır.
   */
  auction: {
    minIncrementPercent: number;
    minIncrementAmount: number;
    settleScheduler: { enabled: boolean; tickSeconds: number; batchSize: number };
  };
}

/**
 * SANAL para yatırma politikası (brief §41: "Ücretli yarış sistemini
 * doğrudan 'kullanıcıların para yatırıp yarış sonucuna göre para
 * kazanması' şeklinde varsayılan olarak production'a açma. Sistemi önce:
 * Virtual Coin / Mock Wallet olarak geliştir.").
 *
 * **`enabled` bir "kill switch"tir, bir özellik bayrağı değil.** `false`
 * yapıldığında uç nokta `MOCK_DEPOSIT_DISABLED` (403) döner ve HİÇBİR
 * yazma yapılmaz. Bu alan `false` olsa bile `NODE_ENV=production` altında
 * uç nokta KAPALIDIR — bkz. `MockPaymentProvider.isEnabled` (iki koşulun
 * BİRLEŞİMİ; config'i yanlışlıkla `true` bırakmak üretimi açmaz).
 */
export interface MockDepositConfig {
  enabled: boolean;
  /** Tek işlemde yatırılabilecek EN AZ sanal para. `0` olamaz (sıfır yatırma deftere yazılamaz — `amount <> 0` CHECK'i, migration 0019). */
  minAmount: number;
  /**
   * Tek işlemde yatırılabilecek EN ÇOK sanal para — sunucu tarafı bir
   * tavan. Bunun ALTINDA bir değer göndermek `INVALID_DEPOSIT_AMOUNT`
   * (400) verir, SESSİZCE KIRPILMAZ: yatırma bir PARA GİRİŞİDİR ve
   * "istediğimden az yattı" sessizliği, cüzdan sayfalama sınırındaki
   * "sessizce kırp" kararından (bkz. `walletHistoryMaxLimit`) TEMELEN
   * farklıdır — orada kırpılan şey bir GÖRÜNTÜLEME tercihiydi, burada
   * kırpılan şey oyuncunun parası olurdu.
   *
   * NOT (dürüstlük): GÜNLÜK toplam yatırma tavanı bu dilimde YOKTUR.
   * Sebebi teknik: tavan, kilitli satırın İÇİNDE "bugün ne kadar
   * yatırıldı" toplamını okumayı gerektirir; `updateWithLock`'un callback'i
   * senkron ve veritabanına erişemez, kilidin DIŞINDA okumak ise yarış
   * koşuluna (race) açık olurdu. Doğru yer PHASE 16 (anti-cheat) —
   * `docs/WALLET_SYSTEM.md`'de açıkça listelenmiştir.
   */
  maxAmount: number;
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
  /**
   * AUDIT_REPORT.md R1 (bu oturum) — bu config dosyasının KENDİ sürümü,
   * `RaceBalanceConfig.version`'dan (yani `config/race.config.json`'ın
   * kendi sürümünden) BAĞIMSIZDIR. Kod hiç değişmeden SADECE aşağıdaki
   * `combinations` içindeki `surfaceModifier`/`weatherModifier` denge
   * değerleri güncellendiğinde bu alan artırılmalıdır — her `races` satırı
   * hangi hava durumu config sürümüyle üretildiğini kaydeder (bkz.
   * `database/migrations/0024_add_weather_config_versioning.up.sql`),
   * böylece gelecekte bu config değişse bile ESKİ yarışların hangi hava
   * durumu denge değerleriyle simüle edildiği bilinir kalır (brief §58
   * replay/audit). `getEnvironmentModifier` (`domain/race/environment.ts`)
   * bu dosyayı AKTİF olarak kullandığından ve sonucu doğrudan etkilediğinden
   * (`combinedConditionModifier`), `race.config.json`'ın üç sürüm sütunuyla
   * (migration 0021) AYNI bütünlük gerekçesi burada da geçerlidir.
   */
  version: string;
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
  /**
   * 01.10.2026 — XP ÖDÜLLERİ. Bu tablo eklenene kadar XP/seviye mantığı
   * (`domain/progression`) HİÇBİR yerden çağrılmıyordu: oyuncular ve atlar
   * sonsuza dek Seviye 1'de kalıyor, seviye şartlı turnuvalar (Gümüş 15,
   * Altın 30) kimseye açılamıyordu.
   */
  xpRewards: {
    player: XpRewardTable;
    horse: XpRewardTable;
  };
}

export interface XpRewardTable {
  /** Yarışı bitiren HER katılımcıya (sıradan bağımsız). */
  raceFinished: number;
  /** Dizinin `i` elemanı `i + 1`. sıranın EK ödülüdür; dışındaki sıralar 0. */
  placementBonus: number[];
  /** Tamamlanan her antrenman seansı. */
  trainingSession: number;
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

/**
 * brief §12 Beslenme Sistemi — SOYUT besin türlerinden (standart/enerji/
 * protein/recovery/performans) SOMUT yem kalemlerine geçildi (bu turda).
 * Gerekçe: brief §12 "Besin türleri" listesi ile brief §11'in "Yem" bakım
 * eylemi tek bir kavramdı ama oyuncu somut bir kalem ALIR ve onu VERİR;
 * soyut "enerji yemi" adı ne satın alma ne stok ne de günlük sınır
 * kavramlarını taşıyabiliyordu. Kullanıcı kararı: **saman bedava ve at
 * başına günde 3**, **arpa/mama/havuç/vitamin elmasla alınır**.
 */
export interface FeedTypeEffect {
  vitalDelta?: Partial<Record<'health' | 'fitness' | 'fatigue' | 'energy' | 'morale', number>>;
  /** HorseHealth.weightCondition üzerindeki etki — brief §12: "her zaman daha pahalı yem = daha iyi olmayacaktır". */
  weightConditionDelta?: number;
  recoveryRateDelta?: number;
  /**
   * Kalemin ENVANTERDE tutulup tutulmadığı.
   *
   * `true`  → oyuncu bu kalemi `price` karşılığında SATIN ALIR, stokta
   *           birikir ve her beslemede stoktan 1 düşer. Stok yoksa
   *           beslenemez (`InsufficientFeedStockError`).
   * `false` → kalem stoklanmaz: her zaman verilebilir (bedava), ama
   *           varsa `dailyLimit` ile sınırlanır. `saman` böyledir.
   *
   * `stocked` ile `price` BİLEREK ayrı alanlardır: "stok tutulur mu" ve
   * "satın alınabilir mi" farklı sorulardır — ileride yalnızca günlük
   * hediyeden gelen (satın alınamayan ama stoklanan) bir kalem eklenebilsin.
   */
  stocked: boolean;
  /** Satın alma fiyatı. Yoksa kalem SATIN ALINAMAZ (yalnızca bedava/hediye yoluyla gelir). */
  price?: { currency: 'money' | 'gems'; amount: number };
  /**
   * Kalemin bir ATA günde en fazla kaç kez verilebileceği (kayan 24 saat
   * penceresi — `dailyRewardCooldownHours` ile AYNI basitleştirme, takvim
   * günü DEĞİL; bkz. `domain/economy/daily-reward.ts` KAPSAM notu). Yoksa
   * sınırsızdır.
   */
  dailyLimit?: number;
}

export type FeedType = 'saman' | 'arpa' | 'mama' | 'havuc' | 'vitamin';

export interface CareConfig {
  actions: Record<CareActionType, CareActionEffect>;
  feedTypes: Record<FeedType, FeedTypeEffect>;
  /** AUDIT_REPORT.md H1 — bkz. `InjuryRecoveryConfig` üstündeki not. */
  injuryRecovery: InjuryRecoveryConfig;
  /**
   * Günlük yem sınırının ölçüldüğü KAYAN PENCERE (saat) — bu turda
   * EKLENDİ. `FeedTypeEffect.dailyLimit` bu pencere içindeki adede göre
   * uygulanır.
   *
   * Sihirli sayı olmasın diye config'tedir (CLAUDE.md "SİHİRLİ SAYI YOK");
   * `economy.config.json`'daki `dailyRewardCooldownHours`'dan AYRI
   * tutulmuştur çünkü ikisi farklı oyun döngüleridir ve biri değişince
   * diğeri sessizce değişmemelidir.
   */
  feedWindowHours: number;
  /**
   * Tek bir satın alma isteğinde alınabilecek EN FAZLA adet — bu turda
   * EKLENDİ. Üst sınır SUNUCUDADIR (`BuyFeedUseCase` doğrular): istemci
   * gövdesindeki `count` serbest bir tamsayıdır ve doğrudan kabul edilseydi
   * tek istekte dört haneli bir adetle stok/defter yazımı tetiklenebilirdi.
   */
  feedPurchaseMaxCount: number;
  /**
   * Günlük ödülle (brief §37) birlikte VERİLEN bedava yem kalemleri —
   * kalem → adet. `ClaimDailyRewardUseCase` bu kalemleri oyuncunun
   * envanterine, para ödülüyle AYNI transaction'da ekler.
   *
   * Yalnızca `stocked: true` kalemler burada yer alabilir (stoklanmayan
   * `saman` için hediye vermek anlamsızdır — zaten her zaman bedava).
   * Bu kuralı `loadCareConfig()` DEĞİL, domain doğrular
   * (`domain/care/care.ts` `assertDailyGiftItemsAreStocked`) — diğer tüm
   * `load*Config()` fonksiyonları gibi bu da düz bir tip iddiasıdır ve
   * config içeriğini denetlemez (CLAUDE.md "Kardeş tuzak": doğrulama
   * domain katmanına aittir).
   */
  feedDailyGift: Partial<Record<FeedType, number>>;
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
  /**
   * 02.10.2026 — jokey-at uyumunun beceri puanına etkisi (0 = kapalı).
   * `effectiveJockeySkill`: `beceri × (1 + etki × (uyum − 50) / 50)`.
   */
  compatibilityInfluence: number;
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
  /**
   * 01.10.2026 — etkisi oyunda BAĞLANACAK bir yeri olmayan tesisler. Bunlar
   * inşa edilemez/yükseltilemez (409 `FACILITY_INACTIVE`), ekranda "şu an
   * etkisiz" görünür: oyuncuya işe yaramayan bir şey satılmaz. `vet_center`
   * "tedavi maliyeti" düşürür ama bakım bugün ÜCRETSİZDİR — bakım ücretli
   * olursa listeden çıkarılır ve etkisi bağlanır.
   */
  inactiveFacilities: string[];
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
  /**
   * 01.10.2026 — pazarda kiralanabilen roller. Yalnızca etkisi oyuna BAĞLI
   * olan roller listelenir (antrenör → antrenman, seyis/veteriner/nalbant →
   * ilgili bakım eylemi); etkisiz bir personel satmak oyuncuyu kandırmak olurdu.
   */
  hireableRoles: string[];
  /** Kiralama/yenileme başına peşin ödenen sözleşme süresi (ay). */
  contractMonths: number;
  /** Yenileme yalnızca bitime bu kadar gün kala (ya da bitmişse) açılır — çift ödemeyi durum engeller. */
  renewWindowDays: number;
  /** Bakım eylemi → etkisini güçlendiren personel rolü. */
  careActionRoles: Record<string, string>;
  /** Aday havuzu: rol başına en az bu kadar boşta aday tutulur. */
  market: { candidatesPerRole: number; skillMin: number; skillMax: number; names: string[] };
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
    /**
     * 30.09.2026 — kuyruk TARAMASI (`MatchmakingScheduler`). Eşleştirme
     * eskiden YALNIZCA katılım anında deneniyordu; aralık zamanla genişlese
     * de bekleyen iki oyuncu hiç eşleşmiyordu. `enabled=false` taramayı
     * kapatır (katılım anındaki eşleştirme sürer); `NODE_ENV=test` iken de
     * kapalıdır, e2e `tickNow()` çağırır. Okuyan + düşüren test:
     * `matchmaking-scheduler.spec.ts`.
     */
    queueScan: { enabled: boolean; tickSeconds: number };
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
    /** 01.10.2026 — kulüp adı/etiketi uzunluk sınırları (`validateClubName`/`validateClubTag`). */
    name: { minLength: number; maxLength: number };
    tag: { minLength: number; maxLength: number };
    /** `GET /clubs` sıralama listesinin en fazla satır sayısı. */
    listLimit: number;
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
    /**
     * 30.09.2026 — finalin koşulması için gereken en az HAZIR oyuncu. Altında
     * turnuva iptal edilir ve herkese ücreti iade edilir (final botsuz
     * koşulduğu için tek kişilik "turnuva" havuzu kendine geri alırdı).
     * Okuyan: `LockRaceUseCase`/`SettleRaceUseCase`; düşüren test:
     * `tournament.e2e-spec.ts`.
     */
    minParticipants: number;
    /**
     * 30.09.2026 — otomatik takvim (`TournamentScheduler`): her kademe için
     * kaydı açık bir turnuva yoksa yenisi `registrationHours` sonra başlamak
     * üzere açılır. `enabled=false` takvimi kapatır; `NODE_ENV=test` iken de
     * kapalıdır (testler `tickNow()` çağırır).
     */
    schedule: { enabled: boolean; tickSeconds: number; registrationHours: number };
    /**
     * Turnuva finalinin yarış ayarları. Değerler `race-lobby.config.json`un
     * izin verdiği kümelerin İÇİNDE olmalıdır (`tournament-config.spec.ts`).
     */
    race: {
      distanceMeters: number;
      surface: 'grass' | 'dirt' | 'synthetic';
      weather: 'sunny' | 'rainy' | 'windy' | 'cloudy' | 'hot' | 'cold';
      tribuneFee: number;
      spectatorCapacity: number;
      /** 01.10.2026 — turnuva finali oyuncu kontrollü canlı yarış mı. */
      playerControl: boolean;
    };
  };
  /** brief §69 SEZON SİSTEMİ (bkz. `domain/season/season.ts`). */
  season: {
    durationDays: number;
    /** 01.10.2026 — `GET /seasons/current` sıralamasında gösterilen satır sayısı. */
    leaderboardSize: number;
    /**
     * Sezon sonu ödülü (çip), sıra başına: `[0]` = 1. Eşit puanlılar aynı
     * sırayı paylaşır ve AYNI ödülü alır. Liste dışı sıralar ödül almaz.
     */
    rewardsByRank: number[];
    /** Sezon zamanlayıcısı (yeni sezonu açar, biteni öder). `NODE_ENV=test`te kapalı. */
    schedule: { enabled: boolean; tickSeconds: number };
  };
}

/**
 * Master Development Brief §17 "Camera Director" + §23 "Photo Finish"
 * (bu turda EKLENDİ) — `apps/web/src/features/race-viewer/camera-director.ts`
 * ve `photo-finish.ts`'te DAHA ÖNCE modül-seviyesi sabit olarak gömülü
 * olan değerler (`START_PHASE_METERS` vb.). İkisi AYNI dosyada toplanır
 * çünkü ikisi de "yarış anlatımı/kamera" kararlarıdır (brief kendisi de
 * bunları AYNI bölümlerde — §17/§23 — art arda ele alır) — brief'in
 * istediği ÜÇ dosya (camera/vfx/audio) sayısını KORUMAK için `photoFinish`
 * ayrı bir dosya yerine bu dosyanın bir ALT ANAHTARI olarak tutulur.
 */
export interface CameraConfig {
  version: string;
  /** Liderin bu mesafenin ALTINDA olduğu süre "start" event'i sayılır (metre). */
  startPhaseMeters: number;
  /** Bitişe bu mesafeden AZ kaldığında "final_stretch" event'i tetiklenir (metre). */
  finalStretchRemainingMeters: number;
  photoFinish: {
    /** 1. ile 2. arasındaki fark bu eşiğin ALTINDAYSA "Foto Finiş!" rozeti gösterilir (milisaniye). */
    closeFinishThresholdMs: number;
    /** Bitişten bu kadar milisaniye ÖNCE ağır çekim (slow-motion) başlar. */
    slowMotionWindowMs: number;
    /** Ağır çekimin ULAŞTIĞI en düşük oynatma hızı çarpanı (1 = normal, bu değer = en yavaş). */
    slowMotionMinFactor: number;
  };
  /**
   * 01.10.2026 — ana sayfa 3D vitrininin sinematik çekimleri. Konumlar
   * oyuncunun atına GÖRE (at yerel +X'e bakar, orijin toynak hizası).
   * Her çekim `from`dan `to`ya yavaşça kayar (dolly); son `blendSeconds`
   * saniyede bir sonraki çekime yumuşakça geçilir.
   */
  homeShowcase: {
    blendSeconds: number;
    shots: Array<{
      id: string;
      label: string;
      durationSeconds: number;
      from: [number, number, number];
      to: [number, number, number];
      target: [number, number, number];
      fov: number;
    }>;
  };
}

/**
 * Master Development Brief §31 "VFX — toz efekti" (bu turda EKLENDİ) —
 * `apps/web/src/features/race-viewer/audio-vfx/dust-particle-sim.ts` ve
 * `DustParticles.tsx`'te DAHA ÖNCE modül-seviyesi sabit olarak gömülü
 * olan parçacık simülasyonu/render değerleri.
 */
export interface VfxConfig {
  version: string;
  dustParticles: {
    /** Parçacığın saniyede ne kadar YÜKSELDİĞİ (metre/saniye). */
    riseSpeedMps: number;
    /** Parçacığın origin'den yatayda ULAŞABİLECEĞİ azami mesafe (metre). */
    maxHorizontalDriftMeters: number;
    minLifetimeMs: number;
    maxLifetimeMs: number;
    /** Saniyede doğacak parçacık sayısı (at hareket ediyorken). */
    spawnRatePerSecond: number;
    /** Aynı anda ekranda tutulacak azami parçacık sayısı. */
    maxActiveParticles: number;
    /** Hex renk kodu (ör. `"#c9b28a"`). */
    color: string;
    /** `gl_PointSize` hesabındaki temel boyut. */
    size: number;
    /** `gl_PointSize` hesabındaki perspektif ölçek faktörü. */
    sizeScale: number;
    /** Materyalin temel (henüz solmamış) opaklığı, [0, 1]. */
    baseOpacity: number;
  };
  /**
   * 01.10.2026 (3D adım 8) — zemine göre toz: kum bol ve açık, sentetik
   * orta ve koyu, çim çok az. `rateFactor` `spawnRatePerSecond`u çarpar.
   */
  dustBySurface: Record<'dirt' | 'synthetic' | 'grass', { rateFactor: number; color: string }>;
  /** Bu hızda (m/s) toz tam oranda çıkar; yavaşta orantılı azalır. */
  dustSpeedReferenceMps: number;
  /** Kamera uzaklaştıkça toz seyrelir (performans + gerçekçilik). */
  dustCameraFalloff: { nearMeters: number; farMeters: number; minFactor: number };
  /** Pist yüzeyinin rengi yarışın zeminine göre (çim yarışı kum pistte koşulmaz). */
  trackColorBySurface: Record<'dirt' | 'synthetic' | 'grass', string>;
  /** Start kapısı: açılma süresi ve prosedürel boyutlar. */
  startGate: {
    openSeconds: number;
    stallWidthMeters: number;
    heightMeters: number;
    depthMeters: number;
  };
}

/**
 * Master Development Brief §31 "Audio Manager" (bu turda EKLENDİ) —
 * `apps/web/src/features/race-viewer/audio-vfx/audio-manager.ts`'te DAHA
 * ÖNCE modül-seviyesi sabit olarak gömülü olan hacim/eşik değerleri.
 *
 * Faz 2/4 hata düzeltmesi (bu turda GENİŞLETİLDİ) — yeni 18 fazlık
 * brief'in yeniden denetiminde `RaceAudioManager`'ın brief §31'in KENDİ
 * "Architecture" listesindeki 11 ses kategorisinden (RaceStart/GateOpen/
 * Hoof/HorseBreathing/Crowd/Wind/Overtake/FinalStretch/Finish/
 * Commentary/Winner) yalnızca ÜÇÜNÜ (race_start/final_stretch/finish)
 * VE brief'in istediği "Master/Music/SFX/Crowd/Commentary/Horse" AYRI
 * ses kanallarının HİÇBİRİNİ uygulamadığı bulundu. Bu arayüz o eksikliği
 * kapatır — `volumeChannels` ve yeni ses kategorilerinin taban hacimleri
 * eklendi (bkz. her alanın kendi doc yorumu).
 */
export interface AudioConfig {
  version: string;
  /**
   * Brief §31 "Ses seviyeleri ayrı kontrol edilebilir olmalı: Master /
   * Music / SFX / Crowd / Commentary / Horse". HER çalınan sesin NİHAİ
   * hacmi kendi taban hacmi (ör. `hoofbeat.baseVolume`) İLE bu kanalın
   * VE `master` kanalının ÇARPIMIDIR (bkz. `audio-manager.ts`'in
   * `resolveVolume` metodu) — bir kanalın hacmi RUNTIME'da
   * `RaceAudioManager.setChannelVolume()` ile değiştirilebilir (bkz. o
   * metodun doc yorumu, o an ÇALAN döngülü sesler ANINDA etkilenir).
   * Varsayılan TÜMÜ `1` (hiçbir kanal kısılmamış) — bu şekilde
   * `volumeChannels` eklenmeden ÖNCEKİ davranışla (tüm sesler kendi
   * taban hacminde çalar) BİREBİR AYNI kalır, geriye dönük UYUMLUDUR.
   */
  volumeChannels: {
    master: number;
    music: number;
    sfx: number;
    crowd: number;
    commentary: number;
    horse: number;
    /**
     * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §21 (bu turda EKLENDİ) —
     * brief'in 7 kanallı listesinde ("Master/Music/SFX/Horse/Crowd/
     * Environment/Commentary") daha önce KARŞILIĞI olmayan 7. kanal.
     * `windAmbienceVolume` ARTIK `sfx` DEĞİL bu kanal altında çalınır (bkz.
     * `startWindAmbience`) — `stadiumAmbientVolume` da AYNI kanaldadır,
     * ikisi de "ortam SFX'i değil, YAPISAL/atmosferik ortam sesi" niteliğinde.
     */
    environment: number;
  };
  hoofbeat: {
    /** Nal sesinin taban hacmi (at durgunken/minimum hızdayken), [0, 1]. */
    baseVolume: number;
    /** Azami hızda taban hacme EKLENEN pay, [0, 1] (taban + bu ≤ 1 olmalı). */
    maxExtraVolume: number;
    /** 01.10.2026 (3D adım 9) — yoğunluğun 1'e ulaştığı lider hızı (m/s). */
    referenceSpeedMps: number;
  };
  /**
   * Brief §31 "HorseBreathing" (bu turda EKLENDİ) — `hoofbeat` ile AYNI
   * [taban, taban+ek] deseni, ama hıza DEĞİL yorgunluğa (fatigue, [0,100])
   * göre ölçeklenir (bkz. `updateHorseBreathingIntensity`) — yorgun bir
   * at daha SERT nefes alır, bu GERÇEK bir telemetri alanından (`race
   * Engine`'in ZATEN ürettiği `fatigue`) türetilir, yeni bir hesaplama
   * İCAT EDİLMEZ.
   */
  horseBreathing: {
    baseVolume: number;
    maxExtraVolume: number;
  };
  raceMusicVolume: number;
  finishFanfareVolume: number;
  /**
   * Brief §31 "Winner" (bu turda EKLENDİ) — "Finish" fanfarından KASITLI
   * OLARAK AYRI bir ses: `finish` yarış çizgisini geçme ANININI, `winner`
   * ise kazananın KESİNLEŞTİĞİ (Winner Ceremony sunumunun başlangıcı,
   * AYRI ve gelecekteki bir özellik kapsamı) anı işaretler — brief bu
   * ikisini AYRI kategoriler olarak listeler.
   */
  winnerCelebrationVolume: number;
  /** Brief §31 "GateOpen" (bu turda EKLENDİ) — start kapılarının açılma anı sesi, bir seferlik (döngüsüz). */
  gateOpenVolume: number;
  /** Brief §31 "Overtake" (bu turda EKLENDİ) — geçiş anı SFX'i, bir seferlik (döngüsüz). */
  overtakeVolume: number;
  /** Brief §31 "Crowd" (bu turda EKLENDİ) — sürekli tribün kalabalığı arka plan sesi (loop, `race_start`'ta başlar). */
  crowdAmbienceVolume: number;
  /** Brief §31 "Wind" (bu turda EKLENDİ) — sürekli rüzgar arka plan sesi (loop, `race_start`'ta başlar). Brief'in 6 kanal listesinde "Wind"in KENDİ bir kanalı YOK — `sfx` kanalı altında sınıflandırılır (ortam SFX'i). */
  windAmbienceVolume: number;
  /** Brief §31 "Commentary" (bu turda EKLENDİ) — spiker anlatım klipleri (bkz. `COMMENTARY_VOICE_REQUIRED`, klasör — tekil dosya DEĞİL); klipler arası hacim farkı GEREKMEDİĞİNDEN tek bir sabit hacim yeterlidir. */
  commentaryLineVolume: number;
  /** Final düzlükte müzik hacmi bu ORANLA çarpılır (0-1, düşürme/"duck" etkisi). */
  finalStretchMusicDuckFactor: number;

  // "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §17-21 (bu turda EKLENDİ) —
  // brief'in istediği daha GRANÜLER ses kategorileri için yeni taban
  // hacimler. Yüzeye göre nal sesi (grass/dirt/synthetic) İÇİN AYRI bir
  // hacim alanı EKLENMEZ — `hoofbeat: {baseVolume, maxExtraVolume}` ZATEN
  // "hız oranına göre nal sesi hacmi" ŞEKLİNİ tanımlıyor, hangi YÜZEY
  // asset'inin (`HOOF_GRASS_SFX_REQUIRED` vb.) o an ÇALDIĞI sadece bir asset
  // SEÇİMİ meselesidir (bkz. `resolveHoofbeatAssetId`) — config'i 3 katına
  // çıkarmak GEREKSİZ tekrar OLURDU.
  /** Brief §19 "START SIGNAL" — kapılar açılmadan HEMEN ÖNCE çalınan hazır-ol sinyali, bir seferlik (döngüsüz). */
  startSignalVolume: number;
  /** Brief §20 "Stadium Ambient" — `crowdAmbienceVolume`den (kalabalık SESİ) BAĞIMSIZ, yapısal stadyum ortam sesi (loop, `environment` kanalı). */
  stadiumAmbientVolume: number;
  /** Brief §20 "Crowd Cheering" — kazanan kesinleştiği andaki kalabalık tezahürat patlaması, bir seferlik (döngüsüz), `winner` ile BİRLİKTE çalar. */
  crowdCheeringVolume: number;
  /** Brief §20 "Crowd Excited" — final düzlükte `crowdAmbienceVolume`nin YERİNİ alan, yükselmiş gerilim seviyesindeki kalabalık döngüsü (bkz. `handleEvent('final_stretch')`). */
  crowdExcitedVolume: number;
  /** Brief §17 "Horse Snort" — bir seferlik at burun sesi (çağıranın kararıyla, `horse` kanalı). */
  horseSnortVolume: number;
  /** Brief §17 "Horse Neigh" — bir seferlik at kişneme sesi (çağıranın kararıyla, `horse` kanalı). */
  horseNeighVolume: number;
  /** Brief §17 "Horse Movement" — bir seferlik genel at hareket sesi (çağıranın kararıyla, `horse` kanalı). */
  horseMovementVolume: number;

  // İkinci öz-denetim turu (bu turda EKLENDİ) — `isCloseFinish()`/
  // `isOnTrackTurn()` gibi ZATEN VAR OLAN, gerçek telemetriye dayanan
  // sinyallerin ses karşılığı.
  /** Brief'in "PHOTO_FINISH" ses kategorisi — `photo-finish.ts`teki ZATEN VAR OLAN `isCloseFinish()` `true` döndüğünde, `finish`ten HEMEN SONRA çalınan bir seferlik gerilim vurgusu. */
  photoFinishVolume: number;

  // Üçüncü öz-denetim turu (proje sahibinin "notta eksik bişi kalmasın"
  // talebiyle, bu turda EKLENDİ) — brief'in "START GATE" ön-yarış akışı
  // (§15/§19) ve "HOOF_FAST"/"HOOF_SPRINT" hız-katmanlı nal sesi (§18)
  // kategorileri için GERÇEK config alanları. İkisi de YENİ bir Race
  // Engine sinyali GEREKTİRMEZ (bkz. `audio-manager.ts`teki
  // `startGateAmbience`/`updateHoofTempoLayer`nin doc yorumları) — bu
  // yüzden `HORSE_GALLOP`/`HORSE_FAST_GALLOP` VE toplam start-kapısı
  // AÇILMA MEKANİĞİ (bunlar GERÇEKTEN bir ürün kararı VEYA yeni bir
  // motor sinyali gerektirir) gibi hâlâ BEKLEYEN maddelerden FARKLI
  // olarak burada KAPATILABİLDİLER (bkz. `docs/ASSET_GUIDE.md`nin
  // "Bilinçli olarak HENÜZ ele alınmayan" bölümündeki güncel liste).
  /**
   * Brief §15 "Start Gate" — atlar kapıya YERLEŞTİRİLİRKEN (yarış
   * BAŞLAMADAN önceki bekleme/hazırlık penceresi) çalınan mekanik/
   * atmosferik kapı sesi (loop, `environment` kanalı — `stadiumAmbient
   * Volume`/`windAmbienceVolume` ile AYNI kanal, çünkü bu da kalabalıktan
   * BAĞIMSIZ yapısal bir ortam sesidir). `race_start`/`gate_open`
   * event'lerinden KASITLI OLARAK AYRI TUTULUR: bu, `RaceAudioManager`ın
   * `handleEvent`ine BAĞLI DEĞİLDİR (Race Engine'in "atlar kapıya
   * yerleşiyor" ANINI işaretleyen bir sinyali HENÜZ YOK — bu bir simülasyon
   * OLAYI değil, yarış BAŞLAMADAN ÖNCEKİ bir UI/sunum durumudur), bu yüzden
   * `startStadiumAmbience` ile AYNI "çağıranın kararıyla başlat/durdur"
   * deseniyle bağımsız bir metot çifti (`startGateAmbience`/
   * `stopGateAmbience`) olarak modellenir.
   */
  startGateAmbientVolume: number;
  /**
   * Brief §18 "HOOF_FAST"/"HOOF_SPRINT" (bu turda EKLENDİ) — nal sesi
   * `hoofbeat.baseVolume`/`maxExtraVolume` üzerinden ZATEN sürekli hızla
   * ORANTILI şekilde hacim değiştiriyordu (bkz. `updateHoofbeatIntensity`),
   * ama brief AYRICA "hız arttıkça FARKLI/EK bir doku (tempo/ritim
   * hissi)" ister — bu, TEK bir sesin hacmini değiştirmekle
   * KARŞILANAMAZ. Çözüm: hız oranı (`speedMps / maxSpeedMps`, ZATEN VAR
   * OLAN telemetri, YENİ bir hesaplama İCAT EDİLMEZ) bu eşiği AŞTIĞINDA,
   * yüzey/viraj nal sesinin ÜZERİNE (onu DURDURMADAN) EK bir katman
   * (`HOOF_FAST_SFX_REQUIRED`) sabit hacimde ÇALINMAYA başlanır — gerçek
   * at koşularında dörtnala geçişte nalın hem daha sık HEM daha "dolgun"
   * duyulmasının ses tasarımındaki karşılığı budur.
   */
  hoofFast: {
    /** [0, 1] — bu ORANIN üstünde EK "fast" katmanı başlar (bkz. `hoofSprint.speedRatioThreshold`, bundan HER ZAMAN küçük olmalı). */
    speedRatioThreshold: number;
    /** EK katmanın SABİT hacmi (yüzey/viraj katmanının hacmine EKLENMEZ, kendi başına ayrı bir ses kaynağı olarak çalar). */
    layerVolume: number;
  };
  /**
   * `hoofFast` ile AYNI desen, ama DAHA YÜKSEK bir hız eşiğinde — brief'in
   * "sprint" (yarışın son düzlüğündeki azami çaba) için AYRI, DAHA YOĞUN
   * bir doku isteğinin karşılığı. `hoofFast` VE `hoofSprint` KATMANLARI
   * AYNI ANDA ÇALMAZ (bkz. `updateHoofTempoLayer`'ın "sprint eşiğini
   * aşınca fast katmanı DURDURULUP sprint katmanına GEÇİLİR" mantığı) —
   * ikisini AYNI ANDA duymak, brief'in "kademeli" (tiered) isteğiyle
   * ÇELİŞİRDİ (sürekli katmanlanan sesler karman çorman/gürültülü bir
   * karışıma yol açardı).
   */
  hoofSprint: {
    /** [0, 1] — bu ORANIN üstünde "fast" katmanı DURUP "sprint" katmanı başlar; `hoofFast.speedRatioThreshold`den HER ZAMAN büyük olmalıdır. */
    speedRatioThreshold: number;
    layerVolume: number;
  };
  /**
   * 01.10.2026 (3D adım 9) — kalabalık döngüsünün hacmi heyecanla ölçeklenir:
   * çarpan = min + (1 − min) × heyecan (heyecan `computeCrowdExcitement`ten, [0, 1]).
   */
  crowdExcitementMinFactor: number;
  /** Ahır ortam döngüsü (`STABLE_AMBIENCE_SFX_REQUIRED`), `environment` kanalı. */
  stableAmbienceVolume: number;
  /** Lider değişimi "overtake" sesinin en sık çalma aralığı (ms) — sürekli el değiştirmede spam olmasın. */
  overtakeCooldownMs: number;
}

/**
 * Tribün (grandstand) — proje sahibinin açık talebi (27.09.2026):
 * "yarış yapılan yerlerde tribüne ücretli girişler olsun insanlar yarışları
 * izleyebilsin". `config/grandstand.config.json`'un tip karşılığı.
 *
 * **Bu bir SINK'tir (para kaynağı değil):** bilet bedeli oyuncunun
 * bakiyesinden düşülür ve HİÇ KİMSEYE aktarılmaz — `stable.config.json`'un
 * yükseltme maliyetleri, `care.config.json`'un bakım ücretleriyle AYNI
 * kategori. Alternatif (bilet gelirini yarış sahibine aktarmak) İKİ
 * oyuncunun `players` satırını kilitleyen bir transfer yolu gerektirirdi;
 * bu, dilimin riskini para transferi seviyesine çıkarırdı. Bilet gelirinin
 * yarış sahibine dağıtılması İSTENİRSE bu, AYRI bir dilimdir ve
 * `PostgresMarketPurchaseRepository.executePurchase`'ın "iki satırı
 * sözlüksel sırada kilitle" desenini kullanmalıdır.
 *
 * **Neden config'te:** `CLAUDE.md` "SİHİRLİ SAYI YOK" — fiyat, izleme
 * penceresi ve liste limitleri denge parametreleridir; `game-config`
 * yükleyicisi saf bir cast yaptığından (çalışma zamanı doğrulaması YOK)
 * bu değerlerin tutarlılığı bir TESTLE garanti edilir (bkz.
 * `apps/api/test/domain/grandstand/grandstand-config.spec.ts`).
 */
export interface GrandstandConfig {
  /**
   * **Sunucu üretimi yarışlar için VARSAYILAN tribün ücreti** (PHASE 7.1,
   * 29.09.2026). Alan 27.09.2026'da `ticketPrice` adıyla doğdu ve o
   * tarihten beri **satın alma fiyatı** sanılıyordu; artık değil.
   *
   * **Satın alma fiyatı `races.tribune_fee`'dir.** Oyuncunun açtığı lobi
   * yarışlarında ücreti yarışı kuran seçer
   * (`race-lobby.config.json → tribuneFeeOptions`) ve o değer satıra
   * yazılır. `ticketPrice` adı, config'i okuyan herkese "fiyat buradan
   * geliyor" izlenimi veriyordu ve `races.tribune_fee` sütununu ÖLÜ
   * bırakıyordu — `aiFillEnabled` dersinin (`CLAUDE.md`) tam olarak aynısı:
   * etkisi olmayan bir config değeri, hiç olmamasından kötüdür.
   *
   * **Nerede kullanılır:** yalnızca `insertRaceRow` (pratik/antrenman
   * yarışları) — o satırların bir yaratıcısı olmadığı için ücreti config
   * belirler. `0` vermek tüm sunucu üretimi yarışları ücretsiz yapar ve o
   * zaman tribünde bilet satılmaz (`canWatchRaceWithoutTicket`).
   *
   * `money` (Çip) VEYA `gems` (Elmas) olabilir — `CurrencyAmount` ile AYNI
   * şekil, ama game-config shared-types'a bağımlı olmadığından (bkz.
   * `FarmConfig.facilities` doc yorumundaki AYNI gerekçe) burada satır içi
   * yazılır. Para birimi **yarış başına değişemez**: `races` tablosunda
   * tribün para birimi sütunu YOKTUR (`race_tickets.currency` satın alma
   * anında yazılır), yani tek kaynak config'tir.
   */
  defaultTribuneFee: { currency: 'money' | 'gems'; amount: number };
  /**
   * **Sunucu üretimi yarışlar için VARSAYILAN tribün kapasitesi** (PHASE
   * 7.1). `races.spectator_capacity` sütununun şema varsayılanı 500'dür
   * (migration 0036) ama bu değer buradan AÇIKÇA yazılır: "SİHİRLİ SAYI
   * YOK" kuralı gereği bir denge parametresi SQL şemasında gizli kalmamalı
   * — okuyan onu bulamaz ve değiştiremez.
   *
   * `race-lobby.config.json → spectatorCapacityOptions` oyuncunun
   * SEÇEBİLECEĞİ değerlerdir; bu ise seçim yapılmadığında uygulanandır.
   * İkisinin tutarlılığı `grandstand-config.spec.ts`te iddia edilir.
   */
  defaultSpectatorCapacity: number;
  /**
   * Bir yarışın BİTMESİNDEN sonra kaç saat boyunca bilet satın alınıp
   * izlenebileceği. Pencere kapanınca yarış artık "izlenebilir" listesinde
   * GÖRÜNMEZ ve yeni bilet satılamaz (mevcut biletler ETKİLENMEZ —
   * `domain/grandstand/ticket.ts`'in "bilet bir kez alınır" ilkesi).
   */
  watchWindowHours: number;
  /** `GET /races/watchable` yanıtındaki azami yarış sayısı. */
  watchableRacesLimit: number;
  /** `GET /players/:id/tickets` yanıtındaki azami bilet sayısı. */
  myTicketsLimit: number;
}

/**
 * Arkadaşlık + mesajlaşma ayarları (proje sahibinin açık talebi, 27.09.2026:
 * "arkadaşlık + mesajlaşma").
 *
 * `loadSocialConfig()` ile okunur. `maxMessageLength`'in DB CHECK kısıtıyla
 * (`direct_messages.body`, migration 0033) EŞLEŞMESİ ZORUNLUDUR — bu
 * yüzden değer bir test tarafından sabitlenir (bkz. `loadSocialConfig` doc
 * yorumu).
 */
export interface SocialConfig {
  /**
   * Bir mesajın azami KARAKTER sayısı (byte değil — `char_length`
   * kullanılır, bkz. migration 0033'ün gerekçesi: Türkçe karakterler
   * UTF-8'de 2 byte'tır ama kullanıcı için 1 karakterdir).
   *
   * **DB CHECK'i ile eşleşmek zorundadır.**
   */
  maxMessageLength: number;
  /**
   * `GET /players/:id/social` yanıtındaki azami arkadaş sayısı — bir
   * LİSTE sınırıdır, üyelik tavanı DEĞİLDİR. Arkadaşlık karşılıklı onay
   * gerektirdiği için "arkadaş sayısı tavanı" diye bir spam vektörü YOKTUR;
   * bu değer yalnızca yanıtın boyutunu sınırlar.
   */
  overviewFriendsLimit: number;
  /**
   * Aynı yanıttaki azami bekleyen istek sayısı (gelen ve giden AYRI AYRI)
   * — bu da bir LİSTE sınırıdır.
   */
  overviewRequestsLimit: number;
  /**
   * Bir oyuncunun AYNI ANDA gönderebileceği azami bekleyen arkadaşlık
   * isteği — bu bir LİSTE sınırı DEĞİL, **zorunlu bir TAVANDIR**
   * (`assertUnderSocialLimit`, 409 `SOCIAL_LIMIT_REACHED`).
   *
   * NEDEN VAR: arkadaşlık isteği, karşı tarafa bildirim üreten tek sosyal
   * uç noktadır. Tavansız bırakılırsa tek bir hesap tüm sunucuya istek
   * yağdırabilir. İstek geri çekilebildiği için (`DELETE
   * /players/:id/friends/:friendId`) bu tavan bir çıkmaz SOKAK DEĞİLDİR.
   */
  pendingRequestsLimit: number;
  /** `GET /players/:id/inbox` yanıtındaki azami mesaj sayısı. */
  inboxLimit: number;
  /** `GET /players/:id/messages/:otherPlayerId` yanıtındaki azami mesaj sayısı. */
  conversationLimit: number;
  /**
   * `GET /players/:id/notifications` yanıtındaki azami bildirim sayısı —
   * bir LİSTE sınırıdır (brief §28, §42 PHASE 11).
   *
   * **`unreadCount` BU SINIRDAN ETKİLENMEZ:** yanıttaki okunmamış sayısı
   * ayrı bir `COUNT(*)` sorgusundan gelir, çünkü kırpılmış bir diziden
   * sayılan rozet yanlış olurdu (bkz. `NotificationListResult` doc yorumu).
   */
  notificationsLimit: number;
  /**
   * Bir oyuncunun AYNI ANDA gönderebileceği azami bekleyen yarış daveti —
   * bu bir LİSTE sınırı DEĞİL, **zorunlu bir TAVANDIR**
   * (`assertUnderSocialLimit`, 409 `SOCIAL_LIMIT_REACHED`).
   *
   * `pendingRequestsLimit` ile AYNI gerekçe: davet, karşı tarafa bildirim
   * üreten bir uçtur. Tavanı olmasaydı tek bir hesap yüzlerce oyuncuya
   * davet yağdırabilirdi. Arkadaşlık isteğinden AYRI bir değerdir çünkü
   * davet DAHA AĞIR bir iştir: her davet karşı tarafın ekranında iki
   * düğmeli ([JOIN]/[DECLINE]) bir kart üretir.
   *
   * **`SocialLimitReachedError`'ın `reason` birleşimine `'PENDING_INVITES'`
   * eklenmesiyle birlikte gelir** — istemci hangi tavanın dolduğunu
   * metinden ayırt edebilmelidir.
   */
  pendingInvitesLimit: number;
  /**
   * `message_received` bildiriminin `payload.preview` alanındaki azami
   * KARAKTER sayısı (brief §28, §42 PHASE 13).
   *
   * **NEDEN KIRPILIR:** mesaj gövdesi `maxMessageLength` (500) kadar
   * olabilir; kırpılmadan yazılsaydı her bildirim satırı tam mesajı
   * taşır ve bildirim listesi bir mesaj arşivine dönerdi — üstelik
   * kullanıcı bildirime tıklayıp sohbete gitmek yerine metni orada
   * okurdu. Kırpma SUNUCUDA yapılır (`buildMessagePreview`), çünkü
   * istemcinin `body`yi hiç görmemesi gerekir: görseydi "önizleme"
   * değil "mesaj" olurdu ve bildirim ucu bir okuma yoluna dönüşürdü.
   *
   * **SİHİRLİ SAYI DEĞİL (CLAUDE.md kural 6):** kırpma sınırı buradan
   * okunur, `buildMessagePreview`e PARAMETRE olarak geçer.
   */
  notificationPreviewLength: number;
  /**
   * `GET /players/:id/blocks` yanıtındaki azami engel satırı (brief §33,
   * §42 PHASE 15) — bir LİSTE sınırıdır.
   *
   * **BU BİR TAVAN DEĞİLDİR ve olmamalıdır:** engelleme sayısını
   * sınırlamak, "daha fazla rahatsız edilene kadar engelleyebilirsin"
   * demek olurdu — moderasyonun amacına TERS. `overviewFriendsLimit` ile
   * AYNI sınıf: yalnızca yanıtın boyutunu sınırlar. Kırpılsa bile engelin
   * kendisi yürürlükte kalır — yazma yolları listeyi DEĞİL,
   * `player_blocks` tablosunu okur (`inboxLimit` ile AYNI ilişki).
   */
  blockListLimit: number;
  /**
   * `POST /players/:id/reports` gövdesindeki serbest metin `reason`
   * alanının azami KARAKTER sayısı (brief §33).
   *
   * **DB'de TEKRARLANMAZ** (`player_reports.reason` serbest metindir —
   * migration 0040): bu bir ÜRÜN kararıdır, veri bütünlüğü kuralı değil
   * (hediye üst sınırı ile AYNI gerekçe). Sınırı uygulayan şey
   * `normalizeReportReason`dır ve değer ONA parametre olarak geçer.
   */
  reportReasonMaxLength: number;
}

/**
 * Yönetim (admin) ayarları — brief §34 "ADMIN PANEL" (§42 PHASE 15-B).
 * `loadAdminConfig()` ile okunur.
 *
 * **BU AYARLAR BİR YETKİ KAPISI DEĞİLDİR.** Yönetici olup olmamak
 * `players.is_admin` kolonundadır (migration 0041); buradaki değerler
 * yalnızca LİSTE BOYUTUDUR. Config'i kurcalayabilen biri kendini
 * yönetici yapamaz — bu ayrım bilinçlidir, çünkü config dosyaları
 * kaynak kodla birlikte dağıtılır ve bir yetki kararını oraya koymak,
 * onu bir dağıtım hatasıyla açığa çıkarılabilir hâle getirirdi.
 */
export interface AdminConfig {
  /**
   * `GET /admin/reports` yanıtındaki azami şikâyet sayısı.
   *
   * **BU BİR KUYRUK TAVANI DEĞİLDİR:** sınır yalnızca yanıtın boyutunu
   * belirler, kayıtların VARLIĞINI değil — kırpılan bir şikâyet
   * veritabanında durmaya devam eder (`blockListLimit` ile AYNI sınıf).
   */
  reportQueueLimit: number;
  /** `GET /admin/audit-log` yanıtındaki azami kayıt sayısı (`reportQueueLimit` ile AYNI sınıf). */
  auditLogLimit: number;
  /**
   * `GET /admin/players` yanıtındaki azami oyuncu sayısı.
   *
   * **BU EKRAN HEM "Users" HEM "Wallet"DIR** (brief §34): cüzdan, oyuncunun
   * `money`/`gems` kolonlarıdır ve ayrı bir "cüzdan" varlığı YOKTUR
   * (migration 0001). Aynı listeyi ikinci bir uç noktayla sunmak, iki
   * yanıtın birbirinden kaymasına açık bir kapı olurdu.
   */
  playerListLimit: number;
  /** `GET /admin/races` yanıtındaki azami yarış sayısı (`reportQueueLimit` ile AYNI sınıf). */
  raceListLimit: number;
  /**
   * `GET /admin/transactions` yanıtındaki azami defter satırı sayısı.
   *
   * **BU EKRAN HEM "Transactions" HEM "Gifts"TİR** (brief §34): hediye bir
   * `economy_transactions` satırıdır (`type = 'gift_send'`), ayrı bir
   * hediye defteri YOKTUR (migration 0034). Süzgeç istemcinin işidir —
   * sunucuda `type` süzgeci, tür listesinin serbest metin olması yüzünden
   * (migration 0019 notu) sessizce eksik sonuç döndürürdü.
   */
  transactionListLimit: number;
}

/**
 * Hediye gönderimi ayarları (proje sahibinin açık talebi, 27.09.2026 —
 * üç parçanın üçüncüsü: "tribün, arkadaşlık + mesajlaşma, hediye
 * gönderimi").
 *
 * `loadGiftConfig()` ile okunur. **BU BİR PARA YOLUDUR:** her gönderim
 * `economy_transactions`'a İKİ satır yazar (NEGATİF debit + POZİTİF credit,
 * AYNI `reference_id`), `players` satırları sözlüksel sırada `FOR UPDATE`
 * ile kilitlenir ve `Idempotency-Key` ZORUNLUDUR (bkz.
 * `PostgresGiftRepository`).
 *
 * `game-config` yükleyicisi saf bir cast yaptığından (çalışma zamanı
 * doğrulaması YOK) bu değerlerin tutarlılığı bir TESTLE garanti edilir
 * (bkz. `apps/api/test/domain/gift/gift-config.spec.ts`).
 */
export interface GiftConfig {
  /**
   * Tek bir hediyenin ALT sınırı (dahil). 1'den küçük olamaz — sıfır
   * miktarlı bir hediye hem `gift_sends.amount > 0` CHECK'ine hem
   * `economy_transactions.amount <> 0` CHECK'ine takılırdı (migration 0019).
   */
  minAmount: number;
  /**
   * Tek bir hediyenin ÜST sınırı (dahil).
   *
   * **NEDEN VAR (güvenlik, denge değil):** bu sınır olmadan bir hesap,
   * ele geçirilmiş bir oturumla TEK istekte tüm bakiyesini başka bir
   * hesaba aktarabilirdi ve "yanlışlıkla bir sıfır fazla yazma" hatası
   * telafi edilemez olurdu. `economy_transactions.amount` BIGINT olduğundan
   * teknik taşma riski yoktur; sınır tamamen kullanıcı hatasına karşıdır.
   */
  maxAmount: number;
  /**
   * Bir gönderenin `dailyWindowHours` saatlik KAYAN pencerede
   * gönderebileceği azami hediye SAYISI (tutar değil — `maxAmount` ile
   * birlikte "çok sayıda küçük hediye" ile "tek büyük hediye" iki ayrı
   * vektördür). Aşılırsa 409 `DAILY_GIFT_LIMIT_REACHED`.
   *
   * **Pencere KAYAN (rolling) bir penceredir, takvim günü DEĞİLDİR** —
   * takvim günü seçilseydi saat dilimi (`Europe/Istanbul` varsayımı) koda
   * sızardı ve gece yarısında limit sıfırlanırken iki "gün" arasında
   * sınırsız gönderim yapılabilen bir sınır durumu doğardı. Pencerenin
   * UZUNLUĞU `dailyWindowHours`'tadır (ayrı bir alan — çünkü "günlük
   * limit" ne demek olduğu, kaç saat olduğu söylenmeden anlamsızdır ve
   * sorguya gömülü bir `interval '24 hours'` sihirli sayı olurdu).
   */
  dailyLimit: number;
  /**
   * `dailyLimit`'in ölçüldüğü KAYAN pencere, SAAT cinsinden. Tipik değer
   * 24'tür (yani "günlük"). Bu değer SQL tarafında
   * `created_at >= now() - ($2::int * interval '1 hour')` biçiminde
   * kullanılır — AÇIK `::int` cast'i ZORUNLUDUR: node-postgres
   * parametreleri `unknown` tipiyle gönderir ve çıplak `$2 * interval
   * '1 hour'` PostgreSQL tarafından "operator is not unique: unknown *
   * interval" ile reddedilir (`make_interval(hours => $2)` de aynı
   * belirsizliği taşır — adlandırılmış argümanın tipi yine `unknown`
   * kalır).
   */
  dailyWindowHours: number;
  /** `GET /players/:id/gifts` yanıtındaki azami hediye sayısı. */
  historyLimit: number;
  /**
   * Hediye olarak gönderilebilecek para birimleri.
   *
   * **NEDEN config'te ve neden bir DİZİ:** brief §14 "MULTIPLE CURRENCY"
   * ileride yeni bir birim (ör. etkinlik para birimi — brief §13) getirirse,
   * o birimin hediye edilebilir olup olmadığı AYRI bir ürün kararıdır.
   * Etkinlik para biriminin ana Çip ile karıştırılmaması brief'in AÇIK
   * kuralıdır; bu dizi o kuralın hediye yolundaki karşılığıdır.
   *
   * Her eleman `@at-sevdalisi/shared-types`'taki `CURRENCIES`'in bir üyesi
   * OLMAK ZORUNDADIR — `game-config` shared-types'a bağımlı olmadığından
   * (bkz. `FarmConfig.facilities` ile AYNI gerekçe) burada `string` olarak
   * yazılır; uyum `gift-config.spec.ts` tarafından kanıtlanır.
   */
  allowedCurrencies: string[];
}

/**
 * Yarış sohbeti + canlı izleyici sayısı (brief §13/§27, proje sahibinin
 * açık talebi, 27.09.2026). `loadChatConfig()` ile okunur.
 *
 * **`maxMessageLength`'in DB CHECK kısıtıyla (`race_messages.body`,
 * migration 0035) EŞLEŞMESİ ZORUNLUDUR** — bu yüzden değer bir test
 * tarafından, MİGRASYON DOSYASI OKUNARAK sabitlenir (bkz.
 * `loadChatConfig` doc yorumu ve `chat-config.spec.ts`).
 *
 * **NEDEN `social.maxMessageLength`'ten AYRI BİR SAYI:** ikisi farklı
 * yüzeylerdir. Özel mesaj kalıcı bir kişisel yazışmadır; yarış sohbeti ise
 * yarışın ORTASINDA, hızlı akan, o anki yarışla birlikte anlamını yitiren
 * bir kanaldır — 300 karakter bu kanal için doğru, 500 ise gereksiz
 * uzundur. İkisini tek sayıya bağlamak, birini değiştirmenin diğerini
 * sessizce değiştirmesi demek olurdu.
 */
export interface ChatConfig {
  /**
   * Bir sohbet mesajının azami KARAKTER sayısı (byte değil — `char_length`
   * kullanılır, bkz. migration 0035: Türkçe karakterler UTF-8'de 2 byte'tır
   * ama kullanıcı için 1 karakterdir).
   *
   * **DB CHECK'i ile eşleşmek zorundadır.**
   */
  maxMessageLength: number;
  /**
   * `race.subscribe` sonrası istemciye gönderilen azami GEÇMİŞ mesaj
   * sayısı. Bir LİSTE sınırıdır; sohbetin üyelik tavanı YOKTUR (yarış
   * sohbetine katılmak için yapılacak tek şey yarışı izlemektir).
   *
   * Sınırsız bırakmak, uzun bir yarışta yeni abone olan HER istemciye tüm
   * geçmişi göndermek demek olurdu (brief §38 "100+/500+ izleyici" ile
   * doğrudan çelişir).
   */
  historyLimit: number;
  /**
   * Sohbet hız sınırı (brief §32 "RATE LIMIT — chat").
   *
   * **NEDEN HTTP'DEKİ `RateLimitGuard` KULLANILAMAZ:** o guard bir NestJS
   * `CanActivate`'tir ve yalnızca HTTP isteklerinde çalışır; sohbet ise
   * WebSocket üzerinden akar (brief §13). Aynı `config` değerlerinin
   * burada, gateway'in kendi sayaç mantığı için yaşaması bu yüzdendir —
   * sayı TEK bir yerde tanımlı kalır, iki taşıma katmanı da aynı kaynaktan
   * okur.
   */
  rateLimit: {
    /** Bir istemcinin `windowSeconds` içinde gönderebileceği azami mesaj. */
    limit: number;
    /** Sabit pencere genişliği (saniye) — `RateLimitOptions.windowSeconds` ile aynı anlam. */
    windowSeconds: number;
  };
}

/**
 * Oyuncunun KENDİ oluşturduğu ücretli yarış (brief §1-§7, §9-§11, §42 PHASE 1)
 * — `loadRaceLobbyConfig()` ile okunur.
 *
 * **NEDEN AYRI BİR CONFIG DOSYASI (`race.config.json` DEĞİL):** oradaki
 * değerler Race Engine'in FİZİĞİDİR (hız, stamina, geçiş, yorgunluk) ve
 * CLAUDE.md'nin "RACE ENGINE'E DOKUNMA" kuralı kapsamındadır — o dosyaya
 * bir alan eklemek, `configVersion`'ı ve dolayısıyla TÜM eski replay'lerin
 * determinizm sözleşmesini ilgilendirir. Buradaki değerler ise simülasyona
 * HİÇ girmez; yalnızca "bir yarış kaydı nasıl doğrulanır" sorusunu
 * cevaplar (bkz. `domain/race/lobby.ts`). İki farklı yaşam döngüsünü aynı
 * dosyaya bağlamak, bir lobi kuralını değiştirmenin engine sürümünü
 * gereksiz yere artırmasına yol açardı.
 *
 * **BURADAKİ HER SINIR İKİ KEZ UYGULANIR VE BU BİLİNÇLİDİR:** DTO
 * dekoratörleri (`@IsIn`, `@Min`) Vitest/esbuild altında SESSİZCE atlanır
 * (CLAUDE.md kural 5 — `design:paramtypes` üretilmez, `ValidationPipe`
 * gövdeyi hiç doğrulamaz). Bu yüzden asıl kapı `validateRaceCreation`'dır
 * ve dekoratörler yalnızca gerçek bir HTTP sunucusunda (tsc/`nest build`)
 * çalışan ikinci bir katmandır. İkisi AYNI config'i okur ki ayrışmasınlar.
 *
 * `game-config` yükleyicisi saf bir cast yaptığından (çalışma zamanı
 * doğrulaması YOK) bu değerlerin iç tutarlılığı bir TESTLE garanti edilir
 * (bkz. `apps/api/test/domain/race/race-lobby-config.spec.ts`).
 */
export interface RaceLobbyConfig {
  /**
   * Bir yarışta KOŞABİLECEK at sayısı (brief §1/§7: "At sayısı sadece 8 10
   * 12 14 16 olabilir").
   *
   * **NEDEN bir DİZİ, `min`/`max` ÇİFTİ DEĞİL:** brief serbest bir aralık
   * değil, SAYILMIŞ beş seçenek verir. `min`/`max` olsaydı 9 atlık bir yarış
   * da geçerli olurdu — brief'e aykırı. Ayrıca §7 "start gate, horse slots
   * sayısına göre otomatik oluşturulmalı" dediğinden bu beş değerin HER
   * BİRİ ayrı ayrı desteklenmek zorundadır; bir dizi bunu ifade eder.
   */
  fieldSizes: number[];
  /**
   * Bir yarışın BAŞLAYABİLMESİ için gereken en az GERÇEK OYUNCU sayısı
   * (brief §6: "MIN_PLAYERS = 8"). Kalan koltuklar `aiFillEnabled` ise
   * yapay zekâ atlarıyla doldurulur — §6'nın "12 atlık yarış = 8 oyuncu +
   * 4 AI horse" örneği TAM OLARAK budur.
   *
   * DİKKAT — bu değer `fieldSizes`'ın en küçüğüne (8) EŞİT olduğundan,
   * 8 atlık bir yarışta yapay zekâya yer KALMAZ (8 oyuncunun hepsi gerçek
   * olmalıdır). Bu bir hata değil, §6'nın doğrudan sonucudur; yapay zekâ
   * yalnızca 10/12/14/16 atlık yarışlarda devreye girer.
   */
  minPlayers: number;
  /**
   * Bir yarışa KATILABİLECEK azami gerçek oyuncu sayısı (brief §6:
   * "MAX_PLAYERS = 16"). `fieldSize`'ı AŞAMAZ — 12 atlık bir yarışa 13
   * oyuncu alınamaz (bkz. `maxPlayers <= fieldSize` değişmezi,
   * `validateRaceCreation`).
   */
  maxPlayers: number;
  /**
   * Boş koltukların yapay zekâ atlarıyla doldurulup doldurulmayacağı
   * (brief §6). `false` yapılırsa bir yarış ANCAK `fieldSize` kadar GERÇEK
   * oyuncu bulduğunda başlayabilir — bu, 16 atlık bir yarışta 16 gerçek
   * oyuncu beklemek demektir ve lobilerin asla dolmamasına yol açar.
   * Varsayılan `true`'dur; alan bir KAÇIŞ KAPISI olarak bırakılmıştır.
   */
  aiFillEnabled: boolean;
  /**
   * `raceType = 'paid'` bir yarış için seçilebilecek giriş ücretleri
   * (brief §2: "50 coin, 100 coin, 250 coin, 500 coin, 1000 coin").
   *
   * **NEDEN SERBEST BİR SAYI DEĞİL:** serbest bırakılsaydı bir oyuncu
   * 1 Çip'lik yarışlar açıp `maxOpenRacesPerPlayer` tavanını anlamsız
   * kılabilir, ya da ödül havuzunu öngörülemez biçimde şişirebilirdi.
   * Liste, §2'nin verdiği örnekleri birebir uygular.
   */
  paidEntryFeeOptions: number[];
  /**
   * Tribün girişi için seçilebilecek ücretler (brief §10: "FREE / 10 Coin /
   * 25 Coin / 50 Coin"). **0 = FREE** — §9'un "Tribün: FREE PAID olabilir"
   * ayrımı tam olarak bu sıfır/non-sıfır sınırıdır, bu yüzden ayrı bir
   * `tribuneType` alanı YOKTUR; tip `tribuneFee > 0`'dan TÜRETİLİR (iki
   * alanı ayrı tutmak, "FREE ama 25 Çip" gibi çelişkili bir satırı
   * mümkün kılardı).
   */
  tribuneFeeOptions: number[];
  /**
   * Tribün kapasitesi seçenekleri (brief §11: "500 spectators, 1000
   * spectators, 5000 spectators"). Kapasite dolduğunda istemci "TRIBUNE
   * FULL" gösterir (§11) — bu uç nokta PHASE 6'nın işidir, ama sütun
   * §1'in açık talebi olduğu için yarış OLUŞTURULURKEN yazılır.
   */
  spectatorCapacityOptions: number[];
  /** Yarış mesafesi sınırları (metre). `race.config.json`daki `distance` eşiklerinden BAĞIMSIZDIR — o, motorun kısa/orta/uzun sınıflandırmasıdır, bu ise kayıt doğrulamasıdır. */
  distanceMeters: { min: number; max: number };
  /**
   * Yarış adı uzunluğu (karakter). Üst sınır aynı zamanda DB CHECK'idir
   * (migration 0036) — ikisi AYNI değeri taşımak zorundadır, bkz.
   * `race-lobby-config.spec.ts` (migrasyon dosyasını okuyarak doğrular).
   */
  nameLength: { min: number; max: number };
  /**
   * `startTime`'ın "şimdi"ye göre alt/üst sınırı (saniye). Alt sınır
   * olmadan geçmişte bir yarış açılabilir (kimse katılamadan biterdi);
   * üst sınır olmadan 10 yıl sonrasına bir yarış açılıp `maxOpenRacesPerPlayer`
   * tavanı süresiz işgal edilebilirdi.
   */
  startDelaySeconds: { min: number; max: number };
  /**
   * Bir oyuncunun AYNI ANDA açık tutabileceği azami yarış sayısı.
   *
   * **NEDEN VAR (güvenlik, denge değil):** bu tavan olmadan tek bir hesap
   * saniyeler içinde binlerce yarış kaydı açabilirdi — bu hem bir depolama
   * hem de bir "keşif listesini çöple doldurma" (brief §26) vektörüdür.
   * Aşılırsa 409 `RACE_LIMIT_REACHED`.
   */
  maxOpenRacesPerPlayer: number;
  /** Seçilebilecek pist yüzeyleri — `races.surface` CHECK'i (migration 0006) ile AYNI küme. */
  allowedSurfaces: string[];
  /** Seçilebilecek hava durumları — `races.weather` CHECK'i (migration 0006) ile AYNI küme. */
  allowedWeather: string[];
  /**
   * Bir lobi katılımının (`race_entries.status`) alabileceği durumlar
   * (brief §6: "WAITING / READY / NOT_READY / CANCELLED").
   *
   * Katılım ANINDA yazılan değer `waiting`'tir; `ready`/`not_ready` PHASE 3'ün
   * READY düğmesiyle, `cancelled` ise katılım iptaliyle gelir. Bu dizi
   * migration 0037'nin CHECK kısıtıyla BİREBİR aynı olmak zorundadır —
   * ikisi ayrışırsa config'te geçerli bir durum veritabanında reddedilir
   * (bkz. `race-lobby-config.spec.ts`, migration dosyası OKUNARAK).
   */
  entryStatuses: string[];
  /**
   * Lobi yarışının ödül havuzunun hangi dağıtımla paylaşılacağı — brief §3
   * "Prize distribution configurable olmalı", §42 PHASE 5.
   *
   * `EconomyConfig.prizeDistributions` içinde ARANIR. Lobi yarışı bir
   * KADEME (`raceTiers`) DEĞİLDİR (kademeler pratik yarış içindir ve
   * `fieldSize`'ları sabittir; lobi yarışının alanı 8-16 arasında
   * değişir), bu yüzden dağıtımını ayrıca bildirir — ama oranlar yine TEK
   * yerde (`prizeDistributions`) tanımlıdır, burada kopyalanmaz.
   *
   * NEDEN `top5`: lobi yarışı 16 oyuncuya kadar çıkabilir; ödül alan sıra
   * sayısı alan büyüklüğünden BAĞIMSIZ olmalıdır ki "16 kişilik yarışta ilk
   * 16'ya ödül" gibi rekabeti anlamsızlaştıran bir durum doğmasın. İlk 5
   * sıra, alan ne olursa olsun sabit bir hedeftir.
   */
  prizeDistributionId: string;
  /**
   * `GET /races` lobi listesinin, istek `limit` VERMEDİĞİNDE döneceği kayıt
   * sayısı (PHASE 3). Sayfalama yoktur — lobi listesi "şu an katılabileceğin
   * yarışlar" listesidir ve bu küme `maxOpenRacesPerPlayer` × oyuncu sayısı
   * kadar büyüyebilir; yine de istemciye SINIRSIZ bir yanıt göndermek
   * bellek ve bant genişliği açısından kabul edilemez (brief §18
   * performans).
   */
  lobbyListDefaultLimit: number;
  /**
   * `GET /races`'in kabul ettiği AZAMI `limit` (PHASE 3). Bunun üstündeki
   * bir istek 400 DEĞİL, bu değere KIRPILIR: istemcinin "hepsini getir"
   * demesi meşrudur, sunucunun bunu reddetmesi için bir sebep yoktur —
   * kırpmak hem isteği karşılar hem sunucuyu korur.
   */
  lobbyListMaxLimit: number;
  /**
   * KİLİT ZAMANLAYICISI (brief §42 PHASE 1, migration 0042, 28.09.2026) —
   * `startTime` geldiğinde yarışı `scheduled`dan `locking`e geçiren,
   * kadroyu/seed'i/snapshot'ı donduran arka plan işi.
   *
   * **BURADAKİ DEĞERLER "SİHİRLİ SAYI" OLMASIN DİYE VAR** (CLAUDE.md kural
   * 6): tik aralığı ve tek turda işlenecek yarış sayısı kodun içine
   * gömülmez.
   *
   * **`enabled: false` BİR KAÇIŞ KAPISIDIR, varsayılan DEĞİL.** Kapatılırsa
   * yarışlar eskisi gibi yalnızca `POST /races/:id/settle` "crank"i ile
   * koşar — ve snapshot yine `startTime`dan sonra alınır (adaletsiz
   * pencere geri gelir). Yani bu anahtar bir güvenlik supabıdır, bir
   * tercih değil.
   */
  /**
   * Tribün soketi, henüz bitmemiş bir yarışa abone olan izleyici için yarışın
   * kesinleşmesini/iptalini kaç saniyede bir yoklar (01.10.2026). Kontrollü
   * yarışta bekleme dakikalar sürebilir; yarış bitince oynatma odaya başlar.
   */
  spectatorWaitPollSeconds: number;
  lockScheduler: {
    enabled: boolean;
    /**
     * Kaç saniyede bir taranacak. `startTime` hassasiyeti saniye
     * mertebesindedir (kullanıcı yarışı saatler önce açar), bu yüzden
     * saniyeler ölçeğinde bir tik fazlasıyla yeterlidir; daha küçük bir
     * değer yalnızca boş sorgu trafiği üretirdi.
     */
    tickSeconds: number;
    /**
     * Tek bir turda kilitlenecek AZAMI yarış sayısı. Sınırsız bırakmak,
     * aynı anda olgunlaşan yüzlerce yarışın tek bir turda işlenip
     * gecikmeyi (ve bellek kullanımını) kontrolsüz büyütmesine yol açardı;
     * kalanlar bir SONRAKİ turda alınır. Kilit zaten idempotenttir
     * (`scheduled → locking` geçişi atomiktir), yani gecikmenin bedeli
     * yalnızca birkaç saniyedir.
     */
    batchSize: number;
  };
  /**
   * 01.10.2026 — YARIŞ TAKVİMİ. Sunucu her programın bir sonraki
   * yuvalarını (`intervalMinutes` adımlı, UTC çağından hizalı +
   * `offsetMinutes`) `horizonHours` ileriye kadar lobi yarışı olarak açar.
   * Yarış oyuncunun açtığı lobi yarışıyla AYNIDIR (giriş ücreti, READY,
   * bot dolgusu, kilit, kesinleşme); yalnızca `created_by` NULL'dır. Her
   * program `validateRaceCreation`dan geçmek zorundadır (test).
   */
  calendar: {
    enabled: boolean;
    tickSeconds: number;
    horizonHours: number;
    /** Başlangıcına bundan az kalan yuva açılmaz (kayıt için süre kalsın). */
    minLeadMinutes: number;
    programs: RaceCalendarProgram[];
  };
}

export interface RaceCalendarProgram {
  /** Kalıcı kimlik — `race_calendar_slots.program_id`. Değiştirmek yeni program demektir. */
  id: string;
  name: string;
  intervalMinutes: number;
  /** [0, intervalMinutes) — aynı aralıklı programlar çakışmasın. */
  offsetMinutes: number;
  fieldSize: number;
  maxPlayers: number;
  /** 0 → ücretsiz yarış. */
  entryFee: number;
  distanceMeters: number;
  surface: string;
  weather: string;
  tribuneFee: number;
  spectatorCapacity: number;
  /** 01.10.2026 — bu programın yarışları oyuncu kontrollü mü (varsayılan false). */
  playerControl?: boolean;
}

/**
 * `config/auth.config.json` (30.09.2026) — e-posta + şifre girişi.
 * `email.maxLength` `player_credentials.email` CHECK'iyle (254) eşleşmelidir.
 */
export interface AuthConfig {
  email: { maxLength: number };
  password: { minLength: number; maxLength: number };
  /** Node `crypto.scrypt` parametreleri: `cost` (N, 2'nin kuvveti), `blockSize` (r), `parallelization` (p). */
  scrypt: {
    cost: number;
    blockSize: number;
    parallelization: number;
    keyLength: number;
    saltBytes: number;
  };
  /**
   * Şifre sıfırlama (migration 0047): bağlantı ömrü, rastgele bayt sayısı ve
   * aynı oyuncuya iki e-posta arasındaki en kısa süre (posta kutusunu
   * doldurmayı önler — yanıt yine aynıdır, enumerasyon yok).
   */
  passwordReset: { tokenTtlMinutes: number; tokenBytes: number; minIntervalSeconds: number };
  /**
   * 02.10.2026 — OTURUM (migration 0057). Erişim token'ı kısa ömürlüdür ve
   * oturum kimliği (`sid`) taşır; refresh token her yenilemede değişir.
   * `maxActiveSessionsPerPlayer` aşılırsa EN ESKİ oturum kapatılır.
   */
  session: {
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    refreshTokenBytes: number;
    maxActiveSessionsPerPlayer: number;
    userAgentMaxLength: number;
  };
  /** 02.10.2026 — e-posta doğrulama bağlantısı (migration 0058). */
  emailVerification: { tokenTtlHours: number; tokenBytes: number; minIntervalSeconds: number };
}

/**
 * 01.10.2026 — atın GÖRÜNÜŞÜ (don rengi + işaretler). Ağırlıklar göreli
 * sayılardır (toplamı 100 olmak zorunda değil). Kalıtım: tay, `parentCoatChance`
 * olasılıkla bir ebeveynin donunu alır (`sireCoatShare` = babadan alma payı),
 * aksi hâlde ağırlıklı rastgele bir don. Seçim seed'li PRNG ile determinist.
 */
export interface HorseAppearanceConfig {
  coatWeights: Record<string, number>;
  faceMarkingWeights: Record<string, number>;
  legMarkingWeights: Record<string, number>;
  inheritance: { parentCoatChance: number; sireCoatShare: number };
}

/**
 * 01.10.2026 — atın durumunun 3D davranışa yansıması (salt GÖRSEL; oyun
 * mantığı değildir). Eşikler `Horse` alanları (0-100) üzerindedir; her
 * ruh hâli bir animasyon parametre seti seçer (1 = nötr hız/genlik).
 */
export interface HorsePresenceMoodParams {
  breathRate: number;
  headLift: number;
  tailSwishRate: number;
  weightShiftRate: number;
  earPerk: number;
}

export interface HorsePresenceConfig {
  thresholds: {
    lowHealth: number;
    lowEnergy: number;
    highFatigue: number;
    lowMorale: number;
    highEnergy: number;
    highMorale: number;
  };
  moods: Record<
    'energetic' | 'neutral' | 'calm' | 'tired' | 'unwell' | 'injured',
    HorsePresenceMoodParams
  >;
}

/**
 * 01.10.2026 — hipodrom atmosferi (salt GÖRSEL/İŞİTSEL; yarış sonucuna
 * etkisi YOK). Kalabalık heyecanı 0..1: tribün hareketi ve (adım 9) kalabalık
 * sesinin şiddeti aynı değerden beslenir.
 */
export interface AtmosphereConfig {
  crowd: {
    preRaceExcitement: number;
    raceExcitement: number;
    finalStretchExcitement: number;
    finishExcitement: number;
    /** Bitişten sonra coşkunun sürdüğü süre; sonra yarış seviyesine iner. */
    finishCelebrationSeconds: number;
    /** Kalabalık animasyonunun güncelleme sıklığı (performans). */
    animationHz: number;
    /** Heyecan 1 iken bir seyircinin en fazla zıplama yüksekliği. */
    maxBobMeters: number;
    /** Bu heyecanın üstünde seyirciler ayağa kalkar. */
    standUpThreshold: number;
    /** Kamera tribüne bundan uzaksa kalabalık animasyonu durur (LOD). */
    lodDistanceMeters: number;
    /** Kalite kademesine göre doldurulan koltuk oranı. */
    densityByTier: Record<'low' | 'medium' | 'high' | 'ultra', number>;
  };
}

/**
 * 01.10.2026 — 3D sahnelerin ortak ışık ayarları (3D adım 7). Yarış, ana
 * sayfa ve ahır AYNI değerleri okur (sahneler arası tutarlı görünüm).
 * `bloom` bilinçli olarak ölçülüdür (yalnızca gerçekten parlak yüzeyler).
 */
export interface LightingConfig {
  toneMappingExposure: number;
  hdri: { environmentIntensity: number; backgroundIntensity: number };
  bloom: { luminanceThreshold: number; luminanceSmoothing: number; intensity: number };
  /** Yalnızca 'ultra' kalite kademesinde (PCSS, pahalı). */
  softShadows: { size: number; samples: number; focus: number };
}

/**
 * 01.10.2026 (3D adım 10) — çalışma anı performans izleme. "Otomatik"
 * kalite seçiliyken kare hızı `lowerFps` altında kalırsa kademe bir
 * düşürülür (en fazla `maxAutoDowngrades` kez); `flipflops` kez inip
 * çıkan ölçümde izleme durur (drei `PerformanceMonitor`).
 */
export interface PerformanceConfig {
  version: string;
  monitor: {
    lowerFps: number;
    upperFps: number;
    flipflops: number;
  };
  maxAutoDowngrades: number;
}

/**
 * 01.10.2026 — OYUNCU KONTROLLÜ PRATİK YARIŞ (canlı oturum). Yarış sunucuda
 * gerçek zamanlı akar: segment `j`, lider `j`'ye başlamadan `revealLeadMs`
 * önce gösterilir ve o andan sonra o segmente komut verilemez (komut ilk
 * gösterilmemiş segmente yazılır). `finishGraceMs` son atın bitişinden sonra
 * kesinleşmeye izin verilmeden önce beklenen pay. Zamanlayıcı, oyuncu
 * sayfayı kapatsa da yarışı kesinleştirir (terk ederek ücretten kaçılamaz).
 */
export interface InteractiveRaceConfig {
  version: string;
  startCountdownSeconds: number;
  /**
   * Yarış saatinin gerçek saate oranı (2 = iki kat hızlı). Motorun ürettiği
   * süreler gerçekçi at hızına göredir ama yavaş bir başlangıç atıyla 1600 m
   * gerçek zamanda ~3,5 dk sürer; canlı kontrol için bu çok uzun. Sonucu
   * DEĞİŞTİRMEZ, yalnızca akış hızını. `revealLeadMs`/`finishGraceMs` YARIŞ
   * saati cinsindendir.
   */
  timeScale: number;
  revealLeadMs: number;
  /**
   * Komut hedefi gösterim sınırının bu kadar (yarış ms) İLERİSİNDEN seçilir:
   * hesap ile yazım arasında sınır ilerlese de komut gösterilmiş bir
   * segmente düşmez.
   */
  commandSafetyMs: number;
  finishGraceMs: number;
  /**
   * Canlı lobi yarışı görünümünün simülasyon önbelleği (02.10.2026) — en
   * fazla kaç (yarış × komut durumu) sonucu bellekte tutulur. Sürücü ve
   * tribün her saniye yoklar; komutlar değişmedikçe sonuç aynıdır. 0 kapatır.
   */
  liveRunCacheEntries: number;
  scheduler: { enabled: boolean; tickSeconds: number; batchSize: number };
}
