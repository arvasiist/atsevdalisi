/**
 * Çiftlik (Farm) — brief §32. Ahır (`stable`) hariç, brief §32'de listelenen
 * EK tesisler: Paddock, Antrenman pisti, Veteriner merkezi, Nalbant alanı,
 * Üreme/yetiştirme merkezi, Depo, Personel binası (bkz. shared-types
 * `FacilityType`). Ahırın kendi kapasite/yükseltme mantığı FAZ 1/2'den beri
 * `domain/stable`'da yaşar ve burada TEKRAR EDİLMEZ.
 *
 * Fonksiyonlar saftır; DB/zaman erişimi yoktur (aynı desen: `domain/stable`,
 * `domain/staff`).
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { FarmConfig } from '@at-sevdalisi/game-config';
import type { Facility, FacilityType } from '@at-sevdalisi/shared-types';
import { MaxFacilityLevelReachedError, StaffCapacityExceededError } from './errors';

/**
 * Tesis tanımının config'te olmasını doğrular. `FacilityType` union'ı
 * derleme zamanında tüm geçerli değerleri garanti eder; bu kontrol yalnızca
 * `farm.config.json`'un union ile senkron kaldığını doğrulayan bir savunma
 * hattıdır (config elle düzenlenebilir bir JSON dosyası olduğu için).
 */
function getFacilityDefinition(type: FacilityType, config: FarmConfig) {
  const facility = config.facilities[type];
  if (!facility) {
    throw new Error(`farm.config.json içinde "${type}" tesisi tanımlı değil.`);
  }
  return facility;
}

export interface FacilityUpgradeCost {
  currency: 'money' | 'gems';
  amount: number;
  nextLevel: number;
}

/**
 * Bir tesisi bir sonraki seviyeye çıkarmanın (level 0 → 1 dahil, yani ilk
 * inşa da bu fonksiyondan geçer) maliyetini döner — `domain/stable`'daki
 * `getNextStableUpgradeCost` ile aynı desen. Tanımlı en yüksek seviyeye
 * zaten ulaşılmışsa `MaxFacilityLevelReachedError` fırlatır.
 */
export function getNextFacilityUpgradeCost(type: FacilityType, currentLevel: number, config: FarmConfig): FacilityUpgradeCost {
  const facility = getFacilityDefinition(type, config);
  const nextLevel = currentLevel + 1;
  const levelDefinition = facility.levels[String(nextLevel)];
  if (!levelDefinition) {
    throw new MaxFacilityLevelReachedError(type, currentLevel);
  }
  return { currency: levelDefinition.cost.currency, amount: levelDefinition.cost.amount, nextLevel };
}

/** Bir tesis tipi için config'te tanımlı en yüksek seviyeyi döner (0 = hiç tanım yok). */
export function getMaxDefinedFacilityLevel(type: FacilityType, config: FarmConfig): number {
  const facility = getFacilityDefinition(type, config);
  const levels = Object.keys(facility.levels).map(Number);
  return levels.length === 0 ? 0 : Math.max(...levels);
}

/**
 * Bir tesisin GEÇERLİ SEVİYESİNDEKİ ham bonus değerini döner (level 0 =
 * henüz inşa edilmemiş → 0). Tanımsız bir ara seviye verilirse, o
 * seviyenin ALTINDA tanımlı en yüksek seviyenin değeri kullanılır — aynı
 * "geriye doğru en yakın tanım" deseni `domain/stable`'daki
 * `getStableCapacity`'de de kullanılmıştır.
 *
 * Birim tesis tipine göre değişir (bkz. `FarmConfig.facilities[].levels[].bonusValue`
 * yorumu): bu fonksiyon HAM değeri döner, yorumlama aşağıdaki `get*Multiplier`/
 * `getMaxStaffCapacity` fonksiyonlarındadır.
 */
export function getFacilityBonusValue(type: FacilityType, level: number, config: FarmConfig): number {
  if (level <= 0) {
    return 0;
  }
  const facility = getFacilityDefinition(type, config);
  const definedLevels = Object.keys(facility.levels)
    .map(Number)
    .sort((a, b) => a - b);
  const applicableLevel = [...definedLevels].reverse().find((definedLevel) => definedLevel <= level) ?? 0;
  if (applicableLevel === 0) {
    return 0;
  }
  return facility.levels[String(applicableLevel)]!.bonusValue;
}

export interface BuildFacilityInput {
  id: string;
  ownerId: string;
  type: FacilityType;
  now?: Date;
}

/**
 * Bir tesisi SIFIRDAN inşa eder (level 0 → 1). Maliyeti çağıran (application
 * layer) düşer; bu fonksiyon sadece yeni tesis kaydını ve maliyetini
 * hesaplar (para düşme işlemi `domain/economy`'nin sorumluluğundadır — aynı
 * desen `domain/jockey`/`domain/market` satın alma akışlarında da
 * kullanılmıştır).
 */
export function buildFacility(input: BuildFacilityInput, config: FarmConfig): { facility: Facility; cost: FacilityUpgradeCost } {
  const cost = getNextFacilityUpgradeCost(input.type, 0, config);
  const nowIso = (input.now ?? new Date()).toISOString();

  return {
    facility: {
      id: input.id,
      ownerId: input.ownerId,
      type: input.type,
      level: cost.nextLevel,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    cost,
  };
}

/** Var olan (level ≥ 1) bir tesisi bir sonraki seviyeye yükseltir. */
export function upgradeFacility(facility: Facility, config: FarmConfig, now: Date = new Date()): { facility: Facility; cost: FacilityUpgradeCost } {
  const cost = getNextFacilityUpgradeCost(facility.type, facility.level, config);
  return {
    facility: { ...facility, level: cost.nextLevel, updatedAt: now.toISOString() },
    cost,
  };
}

/**
 * Savunma amaçlı üst/alt sınırlar (brief §32 "Bonuslar kontrollü olmalıdır").
 * `farm.config.json`'daki `bonusValue`'lar zaten makul aralıkta tutulur;
 * bunlar sadece config'e yanlışlıkla aşırı bir değer girilirse devreye
 * giren bir savunma hattıdır (aynı gerekçe: `docs/GENETICS.md` §4
 * mutasyon sınırları için "defansif no-op" notu).
 */
const MAX_INCREASE_MULTIPLIER = 2;
const MIN_REDUCTION_MULTIPLIER = 0.5;

/** Ortak yardımcı: [0,1] bonus payını [1, MAX_INCREASE_MULTIPLIER] artış çarpanına çevirir. */
function toIncreaseMultiplier(bonusValue: number): number {
  return clamp(1 + bonusValue, 1, MAX_INCREASE_MULTIPLIER);
}

/** Ortak yardımcı: [0,1] bonus payını [MIN_REDUCTION_MULTIPLIER, 1] azaltma çarpanına çevirir. */
function toReductionMultiplier(bonusValue: number): number {
  return clamp(1 - bonusValue, MIN_REDUCTION_MULTIPLIER, 1);
}

/**
 * Paddock — dinlenme/recovery bonus çarpanı, [1, 2] aralığında.
 * **Wiring notu (kapsam dışı):** hangi `domain/care`/`domain/horse` alanına
 * (örn. `recoveryRateDelta`) uygulanacağı, `domain/staff`'taki
 * `calculateStaffBonusMultiplier` ile aynı gerekçeyle bu teslimatın
 * kapsamı dışında bırakılmıştır.
 */
export function getPaddockRecoveryMultiplier(level: number, config: FarmConfig): number {
  return toIncreaseMultiplier(getFacilityBonusValue('paddock', level, config));
}

/** Antrenman pisti — antrenmandaki sakatlık riski azaltma çarpanı, [0.5, 1]. Wiring: `training.config.json` `baseInjuryRisk`. */
export function getTrainingTrackInjuryRiskMultiplier(level: number, config: FarmConfig): number {
  return toReductionMultiplier(getFacilityBonusValue('training_track', level, config));
}

/** Veteriner merkezi — tedavi maliyeti azaltma çarpanı, [0.5, 1]. Wiring: `care.config.json` `vet` action `cost`. */
export function getVetCenterCostMultiplier(level: number, config: FarmConfig): number {
  return toReductionMultiplier(getFacilityBonusValue('vet_center', level, config));
}

/** Nalbant alanı — nal/eklem kaynaklı sakatlık riski azaltma çarpanı, [0.5, 1]. Wiring: `care.config.json` `farrier` action `injuryRiskDelta`. */
export function getFarrierAreaInjuryRiskMultiplier(level: number, config: FarmConfig): number {
  return toReductionMultiplier(getFacilityBonusValue('farrier_area', level, config));
}

/**
 * Üreme/yetiştirme merkezi — doğum sağlık riski azaltma çarpanı, [0.5, 1].
 * Wiring: `docs/GENETICS.md` §6 `birth_health_risk` formülüne ek bir
 * çarpan olarak (`genetics.config.json`'daki mevcut risk çarpanlarının
 * yanına, onları DEĞİŞTİRMEDEN).
 */
export function getBreedingCenterHealthRiskMultiplier(level: number, config: FarmConfig): number {
  return toReductionMultiplier(getFacilityBonusValue('breeding_center', level, config));
}

/** Depo — yem maliyeti azaltma çarpanı, [0.5, 1]. Wiring: `care.config.json` `feedTypes[].cost`. */
export function getWarehouseFeedCostMultiplier(level: number, config: FarmConfig): number {
  return toReductionMultiplier(getFacilityBonusValue('warehouse', level, config));
}

/**
 * Personel binası — o seviyede geçerli TOPLAM personel kapasitesi (mutlak
 * sayı, çarpan değil). Seviye 0 (hiç inşa edilmemiş) için bile
 * `config.baseStaffCapacityWithoutFacility` sayesinde bir taban kapasite
 * vardır.
 */
export function getMaxStaffCapacity(staffBuildingLevel: number, config: FarmConfig): number {
  return config.baseStaffCapacityWithoutFacility + getFacilityBonusValue('staff_building', staffBuildingLevel, config);
}

export function canHireMoreStaff(currentStaffCount: number, capacity: number): boolean {
  return currentStaffCount < capacity;
}

/** `canHireMoreStaff` false ise `StaffCapacityExceededError` fırlatan yardımcı — `domain/stable`'daki `assertCanAddHorseToStable` ile aynı desen. */
export function assertCanHireMoreStaff(currentStaffCount: number, capacity: number): void {
  if (!canHireMoreStaff(currentStaffCount, capacity)) {
    throw new StaffCapacityExceededError(capacity);
  }
}
