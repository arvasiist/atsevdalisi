import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { JoinRaceDto } from '../../src/api/race/dto/join-race.dto';

/**
 * `JoinRaceDto` — taktik alanları İSTEĞE BAĞLIDIR (01.10.2026, tarayıcıda
 * yaşandı). e2e esbuild altında `ValidationPipe` gövdeyi doğrulamadığı için
 * `@IsOptional()` eksikliği CI'da görünmüyordu; gerçek sunucu `LobbyPanel`'in
 * yalnızca `horseId` gönderen katılımını 400 ile reddediyordu. Burada
 * class-validator DOĞRUDAN çağrılır (dekoratör meta verisi esbuild altında da
 * kaydolur), yani boşluk geri gelirse bu test kırılır.
 */
describe('JoinRaceDto doğrulaması', () => {
  it('yalnızca horseId gönderen gövde geçerlidir', async () => {
    const dto = plainToInstance(JoinRaceDto, { horseId: 'e7a1c1d2-0000-4000-8000-000000000001' });
    expect(await validate(dto)).toEqual([]);
  });

  it('verilen taktik yine metin olmak zorundadır', async () => {
    const dto = plainToInstance(JoinRaceDto, { horseId: 'x', tacticalStyle: 5, riskLevel: [] });
    const fields = (await validate(dto)).map((error) => error.property).sort();
    expect(fields).toEqual(['riskLevel', 'tacticalStyle']);
  });
});
