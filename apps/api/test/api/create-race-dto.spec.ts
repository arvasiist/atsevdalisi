import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateRaceDto } from '../../src/api/race/dto/create-race.dto';

/**
 * `CreateRaceDto.breedClass` (08.10.2026). Üretimde `whitelist: true`
 * DTO'da olmayan alanı SESSİZCE siler — ırk sınıfı DTO'ya yazılmasaydı yarış
 * herkese açık açılırdı ve e2e (esbuild, dekoratörsüz gövde) bunu görmezdi.
 * class-validator burada DOĞRUDAN çağrılır (`join-race-dto.spec.ts` deseni).
 */
const base = {
  name: 'Yerli Koşu',
  fieldSize: 8,
  maxPlayers: 8,
  entryFee: 0,
  raceType: 'free',
  startTime: new Date().toISOString(),
  surface: 'dirt',
  weather: 'sunny',
  distanceMeters: 1400,
  tribuneFee: 0,
  spectatorCapacity: 500,
};

describe('CreateRaceDto — ırk sınıfı', () => {
  it('verilmezse ve metin verilirse geçerlidir; alan whitelist\'te kalır', async () => {
    expect(await validate(plainToInstance(CreateRaceDto, base), { whitelist: true })).toEqual([]);
    const dto = plainToInstance(CreateRaceDto, { ...base, breedClass: 'native' });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(dto.breedClass).toBe('native');
  });

  it('metin olmayan ırk sınıfı reddedilir (küme denetimi domain\'dedir)', async () => {
    const errors = await validate(plainToInstance(CreateRaceDto, { ...base, breedClass: 7 }));
    expect(errors.map((error) => error.property)).toEqual(['breedClass']);
  });

  it('09.10.2026 — masa (tableId) whitelist\'te kalır; metin olmayan reddedilir', async () => {
    const dto = plainToInstance(CreateRaceDto, { ...base, tableId: 'local' });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(dto.tableId).toBe('local');
    const errors = await validate(plainToInstance(CreateRaceDto, { ...base, tableId: 3 }));
    expect(errors.map((error) => error.property)).toEqual(['tableId']);
  });
});
