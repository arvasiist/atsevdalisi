import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PurchaseHorseEquipmentDto } from '../../src/api/equipment/dto/purchase-horse-equipment.dto';

/**
 * Ekipman alım gövdesi (08.10.2026) — yalnızca `catalogKey`. Üretimde
 * `forbidNonWhitelisted` kalite/ad/tip/fiyat göndereni 400'ler; e2e (esbuild)
 * dekoratörleri görmediği için class-validator burada doğrudan çağrılır.
 */
describe('PurchaseHorseEquipmentDto', () => {
  it('katalog anahtarı geçerlidir', async () => {
    expect(await validate(plainToInstance(PurchaseHorseEquipmentDto, { catalogKey: 'saddle-basic' }))).toEqual([]);
  });

  it('kalite, ad, tip ya da fiyat gönderilemez', async () => {
    const errors = await validate(
      plainToInstance(PurchaseHorseEquipmentDto, {
        catalogKey: 'saddle-basic',
        quality: 100,
        name: 'Bedava',
        equipmentType: 'saddle',
        priceMoney: 0,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((error) => error.property).sort()).toEqual(['equipmentType', 'name', 'priceMoney', 'quality']);
  });
});
