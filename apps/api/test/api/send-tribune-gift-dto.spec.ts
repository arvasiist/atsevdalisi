import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { SendTribuneGiftDto } from '../../src/api/tribune-gift/dto/send-tribune-gift.dto';

/**
 * Tribün hediyesi gövdesi (08.10.2026) — yalnızca at + hediye anahtarı.
 * İstemci fiyat ya da alıcı GÖNDEREMEZ: üretimdeki `forbidNonWhitelisted`
 * fazladan alanı reddeder. e2e (esbuild) DTO dekoratörlerini görmediği için
 * class-validator burada DOĞRUDAN çağrılır (`create-race-dto.spec.ts` deseni).
 */
const horseId = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';

describe('SendTribuneGiftDto', () => {
  it('at + hediye anahtarı geçerlidir', async () => {
    expect(await validate(plainToInstance(SendTribuneGiftDto, { horseId, giftKey: 'carrot' }))).toEqual([]);
  });

  it('fiyat, alıcı ya da tutar gönderilemez (forbidNonWhitelisted)', async () => {
    const errors = await validate(
      plainToInstance(SendTribuneGiftDto, { horseId, giftKey: 'carrot', price: 1, recipientId: horseId, amount: 9999 }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((error) => error.property).sort()).toEqual(['amount', 'price', 'recipientId']);
  });

  it('UUID olmayan at ve metin olmayan anahtar reddedilir', async () => {
    const errors = await validate(plainToInstance(SendTribuneGiftDto, { horseId: 'kaplan', giftKey: 3 }));
    expect(errors.map((error) => error.property).sort()).toEqual(['giftKey', 'horseId']);
  });
});
