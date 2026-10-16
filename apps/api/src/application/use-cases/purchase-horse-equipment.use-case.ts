import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PurchaseHorseEquipmentResult } from '@at-sevdalisi/shared-types';
import { loadEquipmentConfig } from '@at-sevdalisi/game-config';
import { findEquipmentItem } from '../../domain/equipment/catalog';
import { HORSE_EQUIPMENT_REPOSITORY, type HorseEquipmentRepository } from '../ports/horse-equipment.repository';

const config = loadEquipmentConfig();

/**
 * EKİPMAN — KATALOGDAN ALIM (08.10.2026). Eskiden `POST /horses/:id/equipment`
 * kaliteyi istemciden alıyor ve ücret kesmiyordu (bedavaya azami yarış bonusu).
 * Artık istemci yalnızca katalog ANAHTARINI seçer; ad/tip/kalite/fiyat/seviye
 * şartı config'ten, para kilit altında düşer (CLAUDE.md kural 1 ve 7).
 */
@Injectable()
export class PurchaseHorseEquipmentUseCase {
  constructor(@Inject(HORSE_EQUIPMENT_REPOSITORY) private readonly repository: HorseEquipmentRepository) {}

  async execute(
    playerId: string,
    horseId: string,
    rawCatalogKey: unknown,
    idempotencyKey: string | null,
    now: Date = new Date(),
  ): Promise<PurchaseHorseEquipmentResult> {
    const catalogItem = findEquipmentItem(config, rawCatalogKey);
    const { item, money } = await this.repository.purchase({
      playerId,
      horseId,
      catalogItem,
      equipmentId: randomUUID(),
      idempotencyKey,
      now,
    });
    return { item, price: catalogItem.priceMoney, money };
  }
}
