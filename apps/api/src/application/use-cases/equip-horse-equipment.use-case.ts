import { Inject, Injectable } from '@nestjs/common';
import type { HorseEquipment } from '@at-sevdalisi/shared-types';
import { HORSE_EQUIPMENT_REPOSITORY, type HorseEquipmentRepository } from '../ports/horse-equipment.repository';

/**
 * `POST /horses/:id/equipment/:equipmentId/equip` (docs/API.md §4).
 * `HorseOwnerGuardByParam` yalnızca `:id`'nin (atın) çağırana ait
 * olduğunu doğrular — `:equipmentId`'nin GERÇEKTEN o ata ait olup
 * olmadığı kontrolü BURADA, `PostgresHorseEquipmentRepository.equip`'in
 * `WHERE id = $1 AND horse_id = $2` koşuluna (bulunamazsa `Horse
 * EquipmentNotFoundError`) devredilir — `equip-horse-equipment.repository.ts`
 * (port) doc yorumundaki AYNI transaction ilkesi (önce aynı tipten
 * eskisini çıkar, sonra yeniyi kuşandır) burada değil, repository
 * katmanında yaşar.
 */
@Injectable()
export class EquipHorseEquipmentUseCase {
  constructor(@Inject(HORSE_EQUIPMENT_REPOSITORY) private readonly horseEquipmentRepository: HorseEquipmentRepository) {}

  async execute(horseId: string, equipmentId: string): Promise<HorseEquipment> {
    return this.horseEquipmentRepository.equip(horseId, equipmentId);
  }
}
