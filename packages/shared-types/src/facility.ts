import type { ISODateTimeString, UUID } from './common';
import type { CurrencyAmount } from './currency';

/**
 * Çiftlik (Farm) tesisleri — brief §32 "ÇİFTLİK". `stable`/ahır BU listede
 * YOKTUR: ahırın kendi kapasite/seviye modeli zaten FAZ 1/2'de
 * `domain/stable` altında var (bkz. `stable.config.json`,
 * `getNextStableUpgradeCost`) — burada tekrar tanımlanmaz, `domain/farm`
 * bunun ÜZERİNE ek tesisler ekler (bkz. `domain/farm/README.md`).
 *
 * Brief §32 "Depo" ve "Personel binası" isimlerini, kod içinde daha
 * açıklayıcı olan `warehouse`/`staff_building` olarak karşılar; "Nalbant
 * alanı" → `farrier_area`, "Üreme/yetiştirme merkezi" → `breeding_center`.
 */
export type FacilityType =
  | 'paddock' // Paddock — dinlenme/recovery bonusu
  | 'training_track' // Antrenman pisti — antrenman sakatlık riski azaltımı
  | 'vet_center' // Veteriner merkezi — tedavi maliyeti azaltımı
  | 'farrier_area' // Nalbant alanı — nal/eklem kaynaklı sakatlık riski azaltımı
  | 'breeding_center' // Üreme/yetiştirme merkezi — doğum sağlık riski azaltımı
  | 'warehouse' // Depo — yem maliyeti azaltımı
  | 'staff_building'; // Personel binası — ek personel kapasitesi

/** Bir oyuncunun sahip olduğu (inşa ettiği) tek bir tesis kaydı. */
export interface Facility {
  id: UUID;
  ownerId: UUID;
  type: FacilityType;
  /** 0 = henüz inşa edilmedi (bu değer genelde ayrı bir satır olarak hiç tutulmaz; domain fonksiyonları 0'ı "yok" varsayımıyla ele alır). */
  level: number;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/**
 * `Facility`'nin KAYIT (persistence) şekli değil, EKRAN şeklidir — bu turda
 * EKLENDİ (brief §32 "Çiftlik" ekranı). Fark önemlidir:
 *
 * - `Facility` yalnızca DB satırını taşır (id/ownerId/tarihler dahil) ve
 *   seviyesi 0 OLABİLMEZ (0 = satır yok).
 * - `FacilitySummaryView` ise `config/farm.config.json` ile BİRLEŞTİRİLMİŞ
 *   hâldir: `maxLevel`, `bonusValue` ve `nextUpgrade` alanları yalnızca
 *   config'ten türetilebilir, DB'de tutulmaz. `level: 0` GEÇERLİDİR ve
 *   "bu tesis henüz inşa edilmedi" demektir.
 *
 * Bu ayrım sayesinde istemci HİÇBİR hesap yapmaz: maliyeti, tavan seviyeyi
 * ve bonusu sunucudan hazır alır (CLAUDE.md "SUNUCU OTORİTESİ").
 */
export interface FacilitySummaryView {
  type: FacilityType;
  /** 0 = henüz inşa edilmedi. */
  level: number;
  maxLevel: number;
  /**
   * Geçerli seviyedeki HAM bonus değeri — birimi tesis tipine göre değişir
   * (bkz. `FarmConfig.facilities[].levels[].bonusValue` doc yorumu):
   * `staff_building` DIŞINDAKİ altı tesiste [0,1] arası bir oran (0.10 =
   * %10), `staff_building`'de ise mutlak EK personel kapasitesi (tam sayı).
   * İstemci bu ayrımı bilmek ZORUNDA DEĞİLDİR; yalnızca gösterir.
   */
  bonusValue: number;
  /** Tesis tavana ulaştıysa `null` — bu bir HATA değil, normal bir durumdur. */
  nextUpgrade: FacilityUpgradeOfferView | null;
}

/** Bir sonraki seviyeye geçmenin sunucuda hesaplanmış maliyeti. */
export interface FacilityUpgradeOfferView {
  nextLevel: number;
  cost: CurrencyAmount;
}

/** `GET /players/:id/farm` yanıtı — oyuncunun çiftliğinin tamamı. */
export interface FarmSummaryView {
  ownerId: UUID;
  /** `FACILITY_TYPES` sırasında YEDİ satır; inşa edilmemişler `level: 0` ile gelir. */
  facilities: FacilitySummaryView[];
  /**
   * `staff_building` seviyesine göre geçerli TOPLAM personel kapasitesi.
   * Hiç personel binası yokken bile `farm.config.json` →
   * `baseStaffCapacityWithoutFacility` kadar bir taban vardır.
   */
  staffCapacity: number;
}

/**
 * `POST /players/:id/farm/facilities/:type/upgrade` yanıtı.
 *
 * `newBalance`/`cost` SUNUCUDAN gelir (istemci bakiyeyi kendisi düşmez) —
 * `StableUpgradeResult` ile AYNI sözleşme.
 */
export interface FacilityUpgradeResult {
  /** Yükseltme SONRASI tesisin tam özeti (yeni `nextUpgrade` dahil). */
  facility: FacilitySummaryView;
  newBalance: { money: number; gems: number };
  cost: CurrencyAmount;
}
