import type { ISODateTimeString, UUID } from './common';

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
