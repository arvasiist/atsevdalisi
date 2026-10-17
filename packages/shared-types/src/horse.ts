import type { ISODateTimeString, UUID } from './common';

/** brief §7 Horse.gender */
export type HorseGender = 'mare' | 'stallion' | 'gelding';

/** brief §7 Horse.status */
export type HorseStatus = 'active' | 'injured' | 'retired' | 'resting';

/** brief §7 Horse */
/** 01.10.2026 — don rengi (3D görünüşün kaynağı; migration 0051 CHECK ile aynı küme). */
export const HORSE_COAT_COLORS = ['bay', 'dark_bay', 'chestnut', 'black', 'grey', 'palomino'] as const;
export type HorseCoatColor = (typeof HORSE_COAT_COLORS)[number];
export const HORSE_FACE_MARKINGS = ['none', 'star', 'stripe', 'blaze', 'snip'] as const;
export type HorseFaceMarking = (typeof HORSE_FACE_MARKINGS)[number];
export const HORSE_LEG_MARKINGS = ['none', 'socks', 'stockings'] as const;
export type HorseLegMarking = (typeof HORSE_LEG_MARKINGS)[number];

/** Atın görünüşü — veritabanında saklanır, at yaşadıkça DEĞİŞMEZ. */
export interface HorseAppearance {
  coatColor: HorseCoatColor;
  faceMarking: HorseFaceMarking;
  legMarking: HorseLegMarking;
}

export interface Horse {
  id: UUID;
  ownerId: UUID;
  name: string;
  gender: HorseGender;
  breed: string;
  birthDate: ISODateTimeString;
  level: number;
  xp: number;
  quality: number; // 0-100, brief §8.1
  potential: number; // 0-100, gizli/tahmini - brief §8.2
  health: number; // 0-100, brief §9
  fitness: number; // 0-100
  fatigue: number; // 0-100
  energy: number; // 0-100
  morale: number; // 0-100
  weightKg: number | null;
  status: HorseStatus;
  sireId: UUID | null;
  damId: UUID | null;
  /** 01.10.2026 — 3D sahnedeki görünüşün kaynağı (migration 0051). */
  appearance: HorseAppearance;
  /**
   * 15.10.2026 — hızlı yaşlanmanın başladığı an (migration 0084). Oyun yaşı
   * `birthDate` + bu an + `gameMonthsPerRealDay` ile SUNUCUDA hesaplanır
   * (`computeHorseAgeMonths`); istemciye bu alan değil `ageMonths` gider.
   */
  agingStartedAt: ISODateTimeString;
  /** 15.10.2026 — emeklilik anı; emekli değilse `null`. Emeklilik geri alınmaz. */
  retiredAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** brief §7 HorseStats — görünen + gizli performans özellikleri (brief §8) */
export interface HorseStats {
  horseId: UUID;
  speed: number;
  acceleration: number;
  stamina: number;
  strength: number;
  agility: number;
  balance: number;
  strideLength: number | null;
  strideFrequency: number | null;
  startSpeed: number;
  earlySpeed: number;
  midSpeed: number;
  finishSpeed: number;
  sprint: number;
  endurance: number;
  cornering: number;
  positioning: number;
  // Gizli özellikler (brief §8.2) - API DTO katmanında ham olarak dışa açılmaz.
  temperament: number;
  focus: number;
  courage: number;
  competitiveness: number;
  stressResistance: number;
  obedience: number;
}

/** Gizli kişilik özellikleri (brief §8.2) — ham değerleri istemciye GİTMEZ. */
export type HiddenHorseTraitKey = 'temperament' | 'focus' | 'courage' | 'competitiveness' | 'stressResistance' | 'obedience';

/** Oyuncuya gösterilen, gizli stat'ları çıkarılmış görünüm (docs/SECURITY.md §9). */
export type VisibleHorseStats = Omit<HorseStats, HiddenHorseTraitKey>;

/**
 * 08.10.2026 — atın kişilik ETİKETİ. Sunucu gizli sayılardan türetir
 * (`domain/horse/personality.ts`); istemci yalnızca hangi özelliğin hangi
 * uçta belirgin olduğunu görür, sayıyı DEĞİL. Boş liste = "Dengeli".
 * Metin (`label`/`hint`) `config/horse-personality.config.json`dadır.
 */
export interface HorsePersonalityView {
  traits: Array<{ trait: HiddenHorseTraitKey; pole: 'high' | 'low' }>;
}

/** brief §7 HorseSurfaceStats */
export interface HorseSurfaceStats {
  horseId: UUID;
  grass: number;
  dirt: number;
  wet: number;
  heavy: number;
  dry: number;
  mud: number;
}

/** brief §7 HorseDistanceStats, kategoriler brief §62 */
export interface HorseDistanceStats {
  horseId: UUID;
  shortDistance: number;
  middleDistance: number;
  longDistance: number;
}

/** brief §7 HorseHealth (detaylı/gizli sağlık verisi) */
export interface HorseHealth {
  horseId: UUID;
  health: number;
  injuryRisk: number;
  recoveryRate: number;
  muscleCondition: number;
  jointCondition: number;
  respiratoryCondition: number;
  weightCondition: number;
  lastVetCheck: ISODateTimeString | null;
}

/**
 * AUDIT_AND_HARDENING Öncelik 5 (bu oturum) — docs/SECURITY.md §9: "gerçek
 * potansiyel [...] API yanıtlarında asla ham değer olarak dönmez [...] ya
 * da scout sisteminin ürettiği bir ARALIK olarak dönülür (brief §34)."
 * Denetim, bu kuralın `apps/api/src/api/horse/horse.controller.ts`'te HİÇ
 * uygulanmadığını (ham `Horse` — `potential` DAHİL — doğrudan JSON'a
 * serialize ediliyordu) ve dokümanın işaret ettiği `apps/api/src/api/dto`
 * katmanının hiç VAR OLMADIĞINI ortaya çıkardı. `PublicHorse`, `Horse`'un
 * API'ye dönen görünümüdür: `potential` YERİNE sabit genişlikli (10 puanlık
 * "dilim") bir `potentialEstimate` aralığı taşır — brief §34'ün tarif
 * ettiği TAM scout mekaniği (personel kalitesine göre daralan aralık,
 * zamanla "keşif") burada KURULMAZ (bu YENİ BİR ÖZELLİK olurdu, bkz.
 * AUDIT_AND_HARDENING Mutlak Kural 1) — sadece ham değerin SIZMASI
 * engellenir (bkz. `apps/api/src/api/dto/horse.mapper.ts`).
 */
export type PublicHorse = Omit<Horse, 'potential' | 'agingStartedAt'> & {
  potentialEstimate: { min: number; max: number };
  /**
   * 15.10.2026 — oyun yaşı (ay; 1 gerçek gün = `gameMonthsPerRealDay` ay).
   * Sahibinin listesinde ve damızlık listesinde dolar; hesap sunucudadır.
   */
  ageMonths?: number;
  /**
   * 15.10.2026 — B13: yaş evresi (`foal`/`development`/`prime`/`mature`/`aging`)
   * ve o evrenin yarış çarpanı (hız/ivme/dayanıklılık; zirve 1). Yalnızca
   * sahibinin listesinde; çarpan kadro dondurulurken uygulanır.
   */
  lifeStage?: { name: string; racingFactor: number };
  /** 08.10.2026 — YALNIZCA sahibinin at listesinde (`GET /horses?ownerId=`) dolar. */
  personality?: HorsePersonalityView;
  /**
   * 14.10.2026 — pratik yarış sınıf gücü (hız + ivme + dayanıklılık ortalaması);
   * YALNIZCA sahibinin at listesinde. Kademe tavanı (`practiceRaceClasses`) ile
   * karşılaştırılır — kapı sunucudadır, bu alan yalnızca ekran içindir.
   */
  racingPower?: number;
  /**
   * 15.10.2026 — at yorgunluk/enerji yüzünden yarışa hazır değilse, zamanla
   * toparlanarak ne zaman hazır olacağı (ISO). Yalnızca sahibinin listesinde;
   * hazırsa ya da engel zamanla geçmiyorsa (sağlık, durum) alan yoktur.
   */
  raceReadyAt?: ISODateTimeString;
  /**
   * 16.10.2026 — atın görünür yarış statları (0–100). YALNIZCA sahibinin
   * listesinde; gizli kişilik sayıları ve potansiyel burada YOKTUR.
   */
  stats?: HorseVisibleStats;
  /**
   * 16.10.2026 — tay büyütme (brief §7): yalnızca tay/gelişim çağındaki atta,
   * sahibinin listesinde. Yetiştirme yemiyle kullanılan/kalan hak + kalan
   * maliyet (birim fiyat sunucu config'inden).
   */
  upbringing?: HorseUpbringingView;
  /**
   * 16.10.2026 (migration 0097) — atın sahibinin ahırındaki bölmesi
   * (1..kapasite; yerleşim sunucuda `resolveStableLayout`). Yalnızca sahibin
   * at listesinde döner.
   */
  stallNumber?: number;
};

export interface HorseUpbringingView {
  feedType: string;
  feedsUsed: number;
  feedsMax: number;
  /** Hak başına verilen stat puanı. */
  gainPerFeed: number;
  /** Bir adedin fiyatı (oyun parası). */
  unitPrice: number;
  /** Kalan hakların toplam maliyeti. */
  remainingCost: number;
}

/** Sahibine gösterilen yarış statları (gizli kişilik alanları HARİÇ). */
export const HORSE_VISIBLE_STAT_KEYS = [
  'speed',
  'acceleration',
  'stamina',
  'sprint',
  'endurance',
  'startSpeed',
  'finishSpeed',
  'cornering',
] as const satisfies readonly (keyof HorseStats)[];
export type HorseVisibleStatKey = (typeof HORSE_VISIBLE_STAT_KEYS)[number];
export type HorseVisibleStats = Pick<HorseStats, HorseVisibleStatKey>;

/** Yarış + yetiştirme özeti (kariyer ve soy ağacındaki atalar için). */
export interface HorseRecordSummary {
  starts: number;
  wins: number;
  /** İlk üç (birincilik dahil). */
  places: number;
  /** Atın koşusundan, koşturan oyuncuya ödenen ödül toplamı (iade HARİÇ). */
  earnings: number;
  /** Doğmuş tay sayısı (kısrak ya da aygır olarak). */
  foals: number;
}

/** `GET /horses/:id/career` satırı — tek bir bitmiş koşu. */
export interface HorseCareerRaceView {
  raceId: UUID;
  raceName: string;
  ranAt: ISODateTimeString;
  distanceMeters: number;
  surface: 'grass' | 'dirt' | 'synthetic';
  /** Hipodrom anahtarı; eski yarışta NULL (varsayılan hipodrom). */
  hippodromeKey: string | null;
  /** Bitiren at sayısı (botlar dahil). */
  fieldSize: number;
  finishPosition: number;
  /** Bu koşudan kazanılan ödül (yoksa 0). */
  prize: number;
}

/** `GET /horses/:id/career` — herkese açık yarış/yetiştirme geçmişi. */
export interface HorseCareerView extends HorseRecordSummary {
  horseId: UUID;
  seconds: number;
  thirds: number;
  bestPosition: number | null;
  recentRaces: HorseCareerRaceView[];
}

/** `HorseStats`'ın `horseId` DIŞINDAKİ alanları — tek bir stat'a atıfta bulunmak
 * için (örn. antrenmanın hangi stat'ı güncellediği) kullanılır. */
export type HorseStatField = Exclude<keyof HorseStats, 'horseId'>;

/**
 * `HorseStatField`'in HER ZAMAN sayısal (asla `null`) olan alt kümesi —
 * `strideLength`/`strideFrequency` DIŞINDA tüm stat alanları (bkz.
 * `HorseStats` — bu ikisi tek NULL olabilen alanlardır). Antrenmanın
 * güncellediği alanlar HER ZAMAN bu kümededir (bkz.
 * `domain/training/training.ts` `getPrimaryStatKey`).
 */
export type NumericHorseStatField = Exclude<HorseStatField, 'strideLength' | 'strideFrequency'>;

/** brief §7 TrainingSession, tür/yoğunluk brief §10 */
export type TrainingType = 'speed' | 'sprint' | 'stamina' | 'start' | 'cornering' | 'tempo' | 'rest';
export type TrainingIntensity = 'low' | 'medium' | 'high';

export interface TrainingSession {
  id: UUID;
  horseId: UUID;
  type: TrainingType;
  intensity: TrainingIntensity;
  durationMinutes: number;
  statGain: Partial<Record<HorseStatField, number>>;
  fatigueGain: number;
  injuryRisk: number;
  injuryOccurred: boolean;
  createdAt: ISODateTimeString;
}

/**
 * `POST /horses/{id}/train` yanıtı (docs/API.md §4). FAZ 1 wiring,
 * dördüncü dilim — bkz. `application/use-cases/train-horse.use-case.ts`
 * üstündeki KAPSAM notu. 16.10.2026: antrenman enerji harcar ve kondisyonu
 * geliştirir (`energyCost`, `fitnessGain`; config `training.types`).
 */
export interface TrainHorseResult {
  horseId: UUID;
  statChanges: Partial<Record<HorseStatField, number>>;
  fatigueGain: number;
  /** 16.10.2026 — düşülen enerji. */
  energyCost: number;
  /** 16.10.2026 — eklenen kondisyon. */
  fitnessGain: number;
  injuryOccurred: boolean;
  newStatus: Pick<Horse, 'fatigue' | 'energy' | 'morale' | 'fitness'>;
  /** 01.10.2026 — uygulanan antrenör çarpanı (1 = antrenörsüz). */
  staffMultiplier: number;
  /**
   * 17.10.2026 (brief §13) — seansı veren antrenör (etkin antrenör yoksa `null`):
   * uzmanlık eşleşti mi ve seans sonrası beceri/deneyim (dinlenmede gelişim yok).
   */
  trainer: {
    staffId: UUID;
    name: string;
    specialization: string | null;
    specializationMatched: boolean;
    skill: number;
    experience: number;
    skillGained: boolean;
  } | null;
}

/** brief §39 Ahır ekranı kartı için minimal görünüm. */
export interface HorseCardView {
  id: UUID;
  name: string;
  level: number;
  health: number;
  energy: number;
  fitness: number;
  fatigue: number;
  morale: number;
  raceForm: number; // brief §39 "Race form" — docs/ALGORITHMS.md'deki Form değerine karşılık gelir
}

/**
 * Ekipman (brief §14 PHASE 14 — STABLE, §17 PHASE 17 — ECONOMY gider
 * kalemi olarak "Equipment"; `claude/hizli-bitirme-plani.md`'nin proje
 * sahibi tarafından önceliklendirilen "düşük riskli, karar gerektirmeyen"
 * dilimlerinden biri). Beş tip desteklenir — brief'in kendisi somut bir
 * liste VERMEZ, bu proje için `domain/equipment/validation.ts`'te
 * `EQUIPMENT_TYPES` olarak SABİTLENMİŞTİR (gerçek at yarışçılığında
 * yaygın ekipman kategorileri): eyer, dizgin, nal, göz siperi, bacak
 * bandajı.
 *
 * KASITLI OLARAK BASİT TUTULDU — `carried-weight.ts`'in "ekipman ağırlığı
 * BİLİNÇLİ olarak kapsam dışı" kararıyla ÇELİŞMEZ: o karar, ekipmanın
 * Carried Weight'in bir ALT-FAKTÖRÜ olarak (at/jokey/handikap ağırlığıyla
 * BİRLİKTE tek bir sayıda tahmin edilerek) modellenmesini reddediyordu
 * ("projede ekipman/gear envanteri kavramı YOK" gerekçesiyle). Bu envanter
 * ARTIK var — ekipmanın performans etkisi Carried Weight'in DIŞINDA,
 * kendi bağımsız, küçük ve KONTROLLÜ modifikatörü olarak modellenir (bkz.
 * `domain/equipment/performance.ts` `computeEquipmentPerformanceModifier`
 * doc yorumu) — bu, `carried-weight.ts`'in reddettiği "tahmin ederek
 * BİRLEŞTİRME" DEĞİL, YENİ ve AYRI bir sistemdir.
 *
 * Serbest biçimli bir `effects: Record<string, number>` JSONB alanı
 * BİLEREK EKLENMEDİ (spekülatif/"belki ileride lazım olur" bir alan,
 * `UNMODELED_SNAPSHOT_FIELDS`'ın karşı çıktığı "sessizce sahte veri"
 * riskiyle AYNI kategori) — tek somut sayısal girdi `quality`dir (diğer
 * kalite alanlarıyla, ör. `Horse.quality`, AYNI 0-100 ölçek).
 */
export type PerformanceEquipmentType = 'saddle' | 'bridle' | 'horseshoe' | 'blinkers' | 'leg_wraps';
/**
 * 16.10.2026 (brief §8, migration 0096) — kozmetik aksesuar: yular, örtü/
 * battaniye, isimlik, koleksiyon. Yarışa HİÇBİR etkisi yoktur
 * (`computeEquipmentPerformanceModifier` tipten eler) ve aşınmaz.
 */
export type CosmeticEquipmentType = 'halter' | 'blanket' | 'nameplate' | 'collectible';
export type EquipmentType = PerformanceEquipmentType | CosmeticEquipmentType;

export interface HorseEquipment {
  id: UUID;
  horseId: UUID;
  equipmentType: EquipmentType;
  name: string;
  /** 0-100 — `Horse.quality` ile AYNI ölçek (bkz. `domain/equipment/validation.ts`). */
  quality: number;
  /**
   * Bir at, AYNI ANDA her `equipmentType`'tan EN FAZLA bir tane kuşanabilir
   * (veritabanı seviyesinde `idx_horse_equipment_one_equipped_per_type`
   * kısmi tekil index'i ile ZORUNLU kılınır — `market_listings`'in
   * "bir atın en fazla bir aktif ilanı olabilir" kısıtıyla AYNI desen,
   * bkz. migration 0028 doc yorumu). Kuşanılmamış (satın alınmış ama
   * envanterde bekleyen) ekipmanın yarış performansına HİÇBİR etkisi
   * yoktur (bkz. `computeEquipmentPerformanceModifier`'ın `equipped`
   * filtresi).
   */
  equipped: boolean;
  createdAt: ISODateTimeString;
  /**
   * 08.10.2026 (migration 0076) — katalog kalemi (`config/equipment.config.json`).
   * `null` = katalogdan önce oyuncunun kendi tanımladığı eski parça.
   */
  catalogKey: string | null;
  /**
   * 16.10.2026 (migration 0096) — dayanıklılık: her koşulan yarışta kuşanılı
   * parçadan 1 düşer; 0'a inen parça çıkarılır ve yeniden kuşanılamaz.
   * `null` = aşınmaz (kozmetik ya da 0096'dan önce alınmış parça).
   */
  maxRaces: number | null;
  racesRemaining: number | null;
  /** Zemine özel nal: bonus yalnızca bu zeminde (`null` = her zeminde). */
  surface: 'grass' | 'dirt' | 'synthetic' | null;
  wornOutAt: ISODateTimeString | null;
}

/** `POST /horses/:id/equipment` yanıtı (08.10.2026) — alınan parça + ödenen + yeni bakiye. */
export interface PurchaseHorseEquipmentResult {
  item: HorseEquipment;
  price: number;
  money: number;
}
