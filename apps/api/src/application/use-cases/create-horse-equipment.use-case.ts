import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EquipmentType, HorseEquipment } from '@at-sevdalisi/shared-types';
import { assertValidEquipmentInput } from '../../domain/equipment/validation';
import { HORSE_EQUIPMENT_REPOSITORY, type HorseEquipmentRepository } from '../ports/horse-equipment.repository';

export interface CreateHorseEquipmentInput {
  equipmentType: EquipmentType;
  name: string;
  quality: number;
}

/**
 * `POST /horses/:id/equipment` (docs/API.md §4). `HorseOwnerGuardByParam`
 * ROTAYA zaten eklenmiştir (bkz. `equipment.controller.ts`) — bu use-case
 * `GetTrainingHistoryUseCase` ile AYNI ilkeyle atın var/sahip olup
 * olmadığını KENDİSİ doğrulamaz.
 *
 * Yeni bir parça HER ZAMAN `equipped: false` olarak oluşturulur (satın
 * alma/oluşturma ≠ kuşanma — `equip-horse-equipment.use-case.ts` AYRI bir
 * adımdır) — bu, `idx_horse_equipment_one_equipped_per_type` (migration
 * 0028) kısıtının bir CREATE isteğinde asla tetiklenmeyeceği anlamına
 * gelir (yalnızca `equip` transaction'ı bu kısıtla ilgilenir).
 */
@Injectable()
export class CreateHorseEquipmentUseCase {
  constructor(@Inject(HORSE_EQUIPMENT_REPOSITORY) private readonly horseEquipmentRepository: HorseEquipmentRepository) {}

  async execute(horseId: string, input: CreateHorseEquipmentInput): Promise<HorseEquipment> {
    assertValidEquipmentInput(input);

    const item: HorseEquipment = {
      id: randomUUID(),
      horseId,
      equipmentType: input.equipmentType,
      name: input.name.trim(),
      quality: input.quality,
      equipped: false,
      createdAt: new Date().toISOString(),
    };

    await this.horseEquipmentRepository.save(item);
    return item;
  }
}
