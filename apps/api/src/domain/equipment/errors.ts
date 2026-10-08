/** Ekipman domain'ine özgü hata tipleri (`domain/training/errors.ts` ile AYNI desen). */

/**
 * Geçersiz ekipman girdisi (400). 08.10.2026'dan beri tek girdi katalog
 * anahtarıdır: metin olmayan ya da katalogda bulunmayan anahtar
 * (`findEquipmentItem`). DTO dekoratörü esbuild altında atlanabildiği için
 * kontrol domain'de bağımsız yapılır (`docs/ARCHITECTURE.md` §9.1 Hata 7).
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
