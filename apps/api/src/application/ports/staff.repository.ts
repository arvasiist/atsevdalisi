import type { Staff, StaffRole } from '@at-sevdalisi/shared-types';

/**
 * Personel deposu (brief §33; `staff` tablosu migration 0012'den beri vardı
 * ama okuyan/yazan kod yoktu — 01.10.2026'da bağlandı).
 *
 * **PARA YOLU:** `hire` ve `renew` sözleşme bedelini düşer — `staff` satırı
 * ve ardından `players` satırı `FOR UPDATE` ile kilitlenir, karar KİLİT
 * ALTINDA verilir ve `staff_contract` defter satırı AYNI transaction'da
 * yazılır (CLAUDE.md kural 7). Tekrar koruması anahtarla değil DURUMLA
 * sağlanır: ikinci `hire` sahipli satır bulur (409), ikinci `renew` pencere
 * dışında kalır (409).
 */
export interface StaffRepository {
  findByOwnerId(ownerId: string): Promise<Staff[]>;
  /** Kiralanmamış adaylar (`owner_id IS NULL`), maaşa göre artan. */
  findCandidates(roles: readonly string[]): Promise<Staff[]>;
  /** Yeni adayları havuza ekler (aday üretimi use-case'tedir). */
  insertCandidates(candidates: Staff[]): Promise<void>;
  /** `staff_building` tesis seviyesi (yoksa 0). */
  findStaffBuildingLevel(ownerId: string): Promise<number>;
  hire(input: StaffMoneyInput & { capacity: number }): Promise<StaffMoneyResult>;
  renew(input: StaffMoneyInput): Promise<StaffMoneyResult>;
  /** Personeli bırakır — PARA HAREKET ETMEZ (peşin sözleşme iade edilmez). */
  release(input: { staffId: string; playerId: string; now: Date }): Promise<Staff>;
}

export interface StaffMoneyInput {
  staffId: string;
  /** TOKEN'dan gelir — gövdeden DEĞİL. */
  playerId: string;
  now: Date;
}

export interface StaffMoneyResult {
  staff: Staff;
  paid: number;
  balanceAfter: number;
}

export type { StaffRole };

export const STAFF_REPOSITORY = Symbol('STAFF_REPOSITORY');
