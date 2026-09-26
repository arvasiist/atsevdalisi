import type { HorseEquipment } from '@at-sevdalisi/shared-types';

/**
 * `HorseEquipmentRepository` — Application katmanının Infrastructure'a
 * bağlandığı PORT (`training-session.repository.ts` ile AYNI desen,
 * docs/ARCHITECTURE.md §4). `horse_equipment` (migration 0028) bir atın
 * ekipman envanterini tutar (bkz. `packages/shared-types/src/horse.ts`
 * `HorseEquipment` doc yorumu).
 *
 * `equip` TEK bir metodda hem "bu parçayı kuşandır" HEM "aynı tipten
 * kuşanılmış başka bir parça varsa onu ÇIKAR" işlemini yapar — bu, `idx_
 * horse_equipment_one_equipped_per_type` kısmi tekil index'inin
 * (migration 0028) İHLAL edilmemesi için TEK bir transaction içinde
 * (önce eskisini çıkar, sonra yeniyi kuşandır SIRASIYLA) çalışmalıdır,
 * bkz. `PostgresHorseEquipmentRepository.equip` doc yorumu.
 */
export interface HorseEquipmentRepository {
  save(item: HorseEquipment): Promise<void>;
  findById(id: string): Promise<HorseEquipment | null>;
  findByHorseId(horseId: string): Promise<HorseEquipment[]>;
  /**
   * `run-practice-race.use-case.ts`/`join-matchmaking-queue.use-case.ts`'in
   * `buildHorseEntrantSnapshot`'a geçireceği veri — yalnızca `equipped:
   * true` satırları döner (performansı etkileyen TEK alt küme, bkz.
   * `computeEquipmentPerformanceModifier`'ın doc yorumu). Ayrı bir metod
   * olarak tutulması (findByHorseId'nin filtrelenmesi yerine) `RaceRepository.
   * findRecentResultsByHorseId`'nin "sorgunun KENDİSİ zaten dar" ilkesiyle
   * AYNI gerekçe — gereksiz satırları DB'den hiç çekmemek.
   */
  findEquippedByHorseId(horseId: string): Promise<HorseEquipment[]>;
  equip(horseId: string, equipmentId: string): Promise<HorseEquipment>;
  unequip(horseId: string, equipmentId: string): Promise<HorseEquipment>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const HORSE_EQUIPMENT_REPOSITORY = Symbol('HORSE_EQUIPMENT_REPOSITORY');
