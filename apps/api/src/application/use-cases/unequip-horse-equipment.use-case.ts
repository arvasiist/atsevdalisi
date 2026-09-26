import { Inject, Injectable } from '@nestjs/common';
import type { HorseEquipment } from '@at-sevdalisi/shared-types';
import { HORSE_EQUIPMENT_REPOSITORY, type HorseEquipmentRepository } from '../ports/horse-equipment.repository';

/**
 * `POST /horses/:id/equipment/:equipmentId/unequip` (docs/API.md §4) —
 * `EquipHorseEquipmentUseCase` ile AYNI gerekçe (`:equipmentId`'nin ata
 * aitliği repository katmanında doğrulanır).
 */
@Injectable()
export class UnequipHorseEquipmentUseCase {
  constructor(@Inject(HORSE_EQUIPMENT_REPOSITORY) private readonly horseEquipmentRepository: HorseEquipmentRepository) {}

  async execute(horseId: string, equipmentId: string): Promise<HorseEquipment> {
    return this.horseEquipmentRepository.unequip(horseId, equipmentId);
  }
}
