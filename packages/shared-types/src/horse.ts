import type { ISODateTimeString, UUID } from './common';

/** brief §7 Horse.gender */
export type HorseGender = 'mare' | 'stallion' | 'gelding';

/** brief §7 Horse.status */
export type HorseStatus = 'active' | 'injured' | 'retired' | 'resting';

/** brief §7 Horse */
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

/** Oyuncuya gösterilen, gizli stat'ları çıkarılmış görünüm (docs/SECURITY.md §9). */
export type VisibleHorseStats = Omit<
  HorseStats,
  'temperament' | 'focus' | 'courage' | 'competitiveness' | 'stressResistance' | 'obedience'
>;

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
export type PublicHorse = Omit<Horse, 'potential'> & {
  potentialEstimate: { min: number; max: number };
};

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
 * üstündeki KAPSAM notu (yalnızca birincil stat, energy/morale değişmez).
 */
export interface TrainHorseResult {
  horseId: UUID;
  statChanges: Partial<Record<HorseStatField, number>>;
  fatigueGain: number;
  injuryOccurred: boolean;
  newStatus: Pick<Horse, 'fatigue' | 'energy' | 'morale'>;
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
