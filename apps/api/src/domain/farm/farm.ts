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
import {
  FacilityInactiveError,
  MaxFacilityLevelReachedError,
  StaffCapacityExceededError,
} from './errors';
import { FACILITY_TYPES } from './validation';

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
export function getNextFacilityUpgradeCost(
  type: FacilityType,
  currentLevel: number,
  config: FarmConfig,
): FacilityUpgradeCost {
  const facility = getFacilityDefinition(type, config);
  const nextLevel = currentLevel + 1;
  const levelDefinition = facility.levels[String(nextLevel)];
  if (!levelDefinition) {
    throw new MaxFacilityLevelReachedError(type, currentLevel);
  }
  return {
    currency: levelDefinition.cost.currency,
    amount: levelDefinition.cost.amount,
    nextLevel,
  };
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
export function getFacilityBonusValue(
  type: FacilityType,
  level: number,
  config: FarmConfig,
): number {
  if (level <= 0) {
    return 0;
  }
  const facility = getFacilityDefinition(type, config);
  const definedLevels = Object.keys(facility.levels)
    .map(Number)
    .sort((a, b) => a - b);
  const applicableLevel =
    [...definedLevels].reverse().find((definedLevel) => definedLevel <= level) ?? 0;
  if (applicableLevel === 0) {
    return 0;
  }
  return facility.levels[String(applicableLevel)]!.bonusValue;
}

export interface FacilityUpgradeOffer {
  nextLevel: number;
  cost: { currency: 'money' | 'gems'; amount: number };
}

/**
 * `getNextFacilityUpgradeCost`'un "hata fırlatmayan" kardeşi: tesis zaten en
 * yüksek seviyedeyse `null` döner, aksi halde sıradaki seviyeyi ve maliyetini
 * verir. `domain/stable/stable.ts`'teki `getNextStableUpgradeOffer` ile AYNI
 * desen ve AYNI gerekçe: "daha fazla yükseltilemez" bir HATA değil, ekranın
 * göstermesi gereken NORMAL bir durumdur — arayüzün bunu gösterebilmek için
 * `try/catch` yazması gerekmesin diye bu ayrım domain'de yapılır.
 */
export function getNextFacilityUpgradeOffer(
  type: FacilityType,
  currentLevel: number,
  config: FarmConfig,
): FacilityUpgradeOffer | null {
  let upgradeCost: FacilityUpgradeCost;
  try {
    upgradeCost = getNextFacilityUpgradeCost(type, currentLevel, config);
  } catch (error) {
    if (error instanceof MaxFacilityLevelReachedError) {
      return null;
    }
    throw error;
  }
  return {
    nextLevel: upgradeCost.nextLevel,
    cost: { currency: upgradeCost.currency, amount: upgradeCost.amount },
  };
}

/**
 * Tek bir tesisin ekranda gösterilecek hâli. TÜM alanlar `farm.config.json`'dan
 * TÜRETİLİR; hiçbiri burada İCAT EDİLMEZ. `level: 0` = "henüz inşa edilmedi"
 * (bkz. `Facility.level` doc yorumu — bu durum `facilities` tablosunda AYRI
 * bir satır olarak tutulmaz).
 */
export interface FacilitySummary {
  type: FacilityType;
  level: number;
  maxLevel: number;
  bonusValue: number;
  nextUpgrade: FacilityUpgradeOffer | null;
  isActive: boolean;
}

/** 01.10.2026 — tesisin etkisi oyunda bağlı mı (`inactiveFacilities` dışında mı). */
export function isFacilityActive(type: FacilityType, config: FarmConfig): boolean {
  return !config.inactiveFacilities.includes(type);
}

/** İnşa/yükseltme öncesi kapı — etkisiz tesis satılmaz. */
export function assertFacilityActive(type: FacilityType, config: FarmConfig): void {
  if (!isFacilityActive(type, config)) {
    throw new FacilityInactiveError(type);
  }
}

/** `summarizeFacilities`'in tek tesislik hâli — `facility.ts`'teki `getStableCapacity`/`summarizeStable` ayrımıyla AYNI desen. */
export function summarizeFacility(
  type: FacilityType,
  level: number,
  config: FarmConfig,
): FacilitySummary {
  return {
    type,
    level,
    maxLevel: getMaxDefinedFacilityLevel(type, config),
    bonusValue: getFacilityBonusValue(type, level, config),
    nextUpgrade: isFacilityActive(type, config)
      ? getNextFacilityUpgradeOffer(type, level, config)
      : null,
    isActive: isFacilityActive(type, config),
  };
}

/**
 * Bir oyuncunun TÜM tesislerinin özeti. `levelsByType`'ta KAYDI OLMAYAN her
 * tesis `level: 0` (inşa edilmedi) sayılır — böylece ekran, oyuncunun hiç
 * tesis inşa etmemiş olması durumunda bile YEDİ satırı da (maliyetleriyle
 * birlikte) gösterebilir. Sıra `FACILITY_TYPES`'tan gelir.
 *
 * Bu fonksiyon BİLEREK application katmanında DEĞİL burada yaşar: saf
 * (DB'siz, zamansız) olduğu için yerel olarak test edilebilir — proje
 * `apps/api/test/application/` altında use-case testi TUTMAZ (bkz.
 * `get-leaderboard.use-case.ts` doc yorumundaki AYNI gerekçe).
 */
export function summarizeFacilities(
  levelsByType: ReadonlyMap<FacilityType, number>,
  config: FarmConfig,
): FacilitySummary[] {
  return FACILITY_TYPES.map((type) => summarizeFacility(type, levelsByType.get(type) ?? 0, config));
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
export function buildFacility(
  input: BuildFacilityInput,
  config: FarmConfig,
): { facility: Facility; cost: FacilityUpgradeCost } {
  assertFacilityActive(input.type, config);
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
export function upgradeFacility(
  facility: Facility,
  config: FarmConfig,
  now: Date = new Date(),
): { facility: Facility; cost: FacilityUpgradeCost } {
  assertFacilityActive(facility.type, config);
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
  return (
    config.baseStaffCapacityWithoutFacility +
    getFacilityBonusValue('staff_building', staffBuildingLevel, config)
  );
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

/**
 * 01.10.2026 — TESİS ETKİLERİ (oyuna BAĞLANDI). Önceden yukarıdaki
 * çarpanların hiçbiri çağrılmıyordu: oyuncu tesise para ödüyor, karşılığında
 * hiçbir şey almıyordu. Etkinin nereye uygulandığı:
 *
 * | Tesis | Uygulandığı yer |
 * |---|---|
 * | paddock | `rest` bakım eyleminin tüm deltaları (`applyCareAction` `effectMultiplier`) |
 * | training_track × farrier_area | antrenman sakatlık olasılığı (`rollInjuryOccurred` öncesi) |
 * | warehouse | yem satın alma toplamı (`BuyFeedUseCase`) + yem listesindeki fiyat |
 * | breeding_center | tayın doğum sağlık riski (`breedHorses`) |
 * | vet_center | YOK — bakım ücretsiz; `inactiveFacilities`te |
 *
 * Etkisiz (`inactiveFacilities`) bir tesis eskiden inşa edilmişse etki
 * VERMEZ (1 = nötr) — sahibi bağlandığında kendiliğinden işler.
 */
export interface FarmEffects {
  restEffectMultiplier: number;
  trainingInjuryRiskMultiplier: number;
  feedCostMultiplier: number;
  birthHealthRiskMultiplier: number;
}

export const NEUTRAL_FARM_EFFECTS: FarmEffects = {
  restEffectMultiplier: 1,
  trainingInjuryRiskMultiplier: 1,
  feedCostMultiplier: 1,
  birthHealthRiskMultiplier: 1,
};

export function computeFarmEffects(
  levelsByType: ReadonlyMap<FacilityType, number>,
  config: FarmConfig,
): FarmEffects {
  const level = (type: FacilityType): number =>
    isFacilityActive(type, config) ? (levelsByType.get(type) ?? 0) : 0;
  return {
    restEffectMultiplier: getPaddockRecoveryMultiplier(level('paddock'), config),
    trainingInjuryRiskMultiplier:
      getTrainingTrackInjuryRiskMultiplier(level('training_track'), config) *
      getFarrierAreaInjuryRiskMultiplier(level('farrier_area'), config),
    feedCostMultiplier: getWarehouseFeedCostMultiplier(level('warehouse'), config),
    birthHealthRiskMultiplier: getBreedingCenterHealthRiskMultiplier(
      level('breeding_center'),
      config,
    ),
  };
}

/** Bakım eylemine tesis çarpanı: yalnızca `rest` padoktan güç alır. */
export function careActionFarmMultiplier(actionType: string, effects: FarmEffects): number {
  return actionType === 'rest' ? effects.restEffectMultiplier : 1;
}

/**
 * İndirimli toplam fiyat: birim × adet × çarpan, YUKARI yuvarlanır (hiçbir
 * zaman bedava kalem çıkmaz). Kayan nokta artığı (`2 × 10 × 0.9 =
 * 18.000000000000004`) yuvarlamadan önce temizlenir — yoksa 19 olurdu.
 */
export function discountedTotal(unitAmount: number, count: number, multiplier: number): number {
  const raw = Math.round(unitAmount * count * multiplier * 1e6) / 1e6;
  return Math.ceil(raw);
}
