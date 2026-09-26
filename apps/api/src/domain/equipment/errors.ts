/** Ekipman domain'ine özgü hata tipleri (`domain/training/errors.ts` ile AYNI desen). */

/**
 * `docs/ARCHITECTURE.md` §9.1 Hata 7 ile AYNI savunma — DTO'nun
 * `@IsIn(EQUIPMENT_TYPES)`/`@Min`/`@Max`/`@Length` kontrolleri
 * Vitest/esbuild altında (üst veri yayınlanmadığından) sessizce
 * atlanabilir; domain katmanı (`assertValidEquipmentInput`,
 * `create-horse-equipment.use-case.ts`) bunu KENDİSİ de bağımsız olarak
 * doğrular.
 */
export class InvalidEquipmentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEquipmentInputError';
  }
}

/**
 * `GET /horses/:id/equipment/:equipmentId` gibi bir uç noktada, ya hiç
 * var olmayan ya da BAŞKA bir ata ait bir `equipmentId` verildiğinde
 * fırlatılır. `HorseOwnerGuardByParam` yalnızca `:id`'nin (atın)
 * çağırana ait olduğunu doğrular — `:equipmentId`'nin GERÇEKTEN o ata ait
 * olduğu kontrolü guard'ın DEĞİL, ilgili use-case'in sorumluluğudur (bkz.
 * `equip-horse-equipment.use-case.ts` doc yorumu), `HorseNotFoundError`
 * ile AYNI kategori (404) ama farklı kaynak.
 */
export class HorseEquipmentNotFoundError extends Error {
  constructor(public readonly equipmentId: string) {
    super(`Ekipman (${equipmentId}) bulunamadı.`);
    this.name = 'HorseEquipmentNotFoundError';
  }
}
