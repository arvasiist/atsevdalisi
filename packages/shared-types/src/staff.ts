import type { ISODateTimeString, UUID } from './common';

/**
 * brief §33 Personel Sistemi. Personel tipleri: Antrenör, Jokey, Veteriner,
 * Nalbant, Seyis, Genetik uzmanı, Scout, Çiftlik yöneticisi.
 *
 * Tasarım kararı: 'jockey' bu union'a DAHİL EDİLMEMİŞTİR. Jokeyler zaten
 * kendi zengin veri modeline sahip (bkz. `jockey.ts` / `jockeys` tablosu —
 * FAZ 0'da ayrı bir varlık olarak tasarlanmış: startSkill/tacticalSkill/
 * sprintSkill/horseControl/riskManagement/trackKnowledge gibi yarışa özel
 * alanlar taşır). Bu domain, brief §33 listesindeki DİĞER 7 personel tipini
 * kapsar; jokey kiralama akışı `domain/jockey/` içindedir.
 */
export type StaffRole =
  | 'trainer' // Antrenör
  | 'vet' // Veteriner
  | 'farrier' // Nalbant
  | 'groom' // Seyis
  | 'geneticist' // Genetik uzmanı
  | 'scout' // Scout
  | 'farm_manager'; // Çiftlik yöneticisi

export interface StaffContract {
  startedAt: ISODateTimeString;
  /** null = süresiz sözleşme (brief §33 "contract" alanı). */
  durationMonths: number | null;
}

/** brief §33 Personel özellikleri: skill, experience, salary, specialization, morale, contract. */
export interface Staff {
  id: UUID;
  role: StaffRole;
  name: string;
  skill: number; // 0-100
  experience: number; // hizmet verdiği ay sayısı (basit sayaç)
  salary: number; // aylık ücret (money)
  specialization: string | null;
  morale: number; // 0-100
  contract: StaffContract;
  /** null = henüz kimse tarafından kiralanmamış (piyasadaki aday havuzu). */
  ownerId: UUID | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** 01.10.2026 — `GET /staff` satırı: personel + sözleşme durumu + etkisi. */
export interface StaffView extends Staff {
  /** Sözleşme bitişi (kiralanmamış adayda `null`). */
  contractEndsAt: ISODateTimeString | null;
  /** Sözleşme sürüyor mu — süresi dolmuş personel bonus VERMEZ. */
  active: boolean;
  /** Yenileme düğmesi açık mı (bitime `renewWindowDays` kala ya da bitmiş). */
  renewable: boolean;
  /** Etki çarpanı (örn. 1.12 = %12 güçlü). */
  bonusMultiplier: number;
  /** Bir sözleşme döneminin peşin bedeli (`salary × contractMonths`). */
  contractCost: number;
}

export interface StaffOverview {
  hired: StaffView[];
  candidates: StaffView[];
  /** `staff_building` seviyesinden türeyen kapasite. */
  capacity: number;
  contractMonths: number;
}

export interface StaffHireResult {
  staff: StaffView;
  paid: number;
  balanceAfter: number;
}
