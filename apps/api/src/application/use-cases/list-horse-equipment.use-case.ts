import { Inject, Injectable } from '@nestjs/common';
import type { HorseEquipment } from '@at-sevdalisi/shared-types';
import { HORSE_EQUIPMENT_REPOSITORY, type HorseEquipmentRepository } from '../ports/horse-equipment.repository';

/**
 * `GET /horses/:id/equipment` (docs/API.md §4) — `GetTrainingHistoryUseCase`
 * ile AYNI desen: atın var/sahip olup olmadığını KENDİSİ doğrulamaz, bu
 * `HorseOwnerGuardByParam`'ın (route'a zaten eklenmiş guard) sorumluluğudur.
 */
@Injectable()
export class ListHorseEquipmentUseCase {
  constructor(@Inject(HORSE_EQUIPMENT_REPOSITORY) private readonly horseEquipmentRepository: HorseEquipmentRepository) {}

  async execute(horseId: string): Promise<HorseEquipment[]> {
    return this.horseEquipmentRepository.findByHorseId(horseId);
  }
}
