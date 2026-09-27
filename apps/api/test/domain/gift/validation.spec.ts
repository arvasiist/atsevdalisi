import { describe, expect, it } from 'vitest';
import { parseGiftAmount } from '../../../src/domain/gift/validation';
import { InvalidGiftAmountError } from '../../../src/domain/gift/errors';

/**
 * `parseGiftAmount` — HAM gövde değerinin ayrıştırılması.
 *
 * **Bu dosyanın asıl değeri:** `Number(raw)` TUZAĞINI kanıtlamasıdır.
 * `Number('')` `0`, `Number(' ')` `0`, `Number(true)` `1`, `Number([])` `0`
 * döner — yani "boş gövde alanı" sessizce geçerli bir hediyeye dönüşürdü.
 * Aşağıdaki testler bu girdilerin HEPSİNİN reddedildiğini gösterir.
 *
 * Bu, `CLAUDE.md`'nin "Kardeş tuzak" uyarısının somut karşılığıdır: DTO
 * dekoratörleri Vitest/esbuild altında ATLANDIĞI için gövdeden gelen değer
 * buraya ham (`unknown`) ulaşır.
 */

const MIN = 1;
const MAX = 10_000;

describe('parseGiftAmount — kabul edilen girdiler', () => {
  it('sonlu bir sayıyı olduğu gibi döner', () => {
    expect(parseGiftAmount(500, MIN, MAX)).toBe(500);
    expect(parseGiftAmount(1, MIN, MAX)).toBe(1);
    expect(parseGiftAmount(0, MIN, MAX)).toBe(0);
  });

  it('negatif bir sayıyı da GEÇİRİR — aralık kontrolü `assertValidGiftAmount`\'tadır', () => {
    // Bu fonksiyonun işi "sayı mı" sorusudur, "geçerli mi" DEĞİL (tek
    // doğruluk kaynağı ilkesi: aralık bir yerde kontrol edilir).
    expect(parseGiftAmount(-5, MIN, MAX)).toBe(-5);
  });

  it('kesirli bir sayıyı da GEÇİRİR — tam sayı kontrolü `assertValidGiftAmount`\'tadır', () => {
    expect(parseGiftAmount(1.5, MIN, MAX)).toBe(1.5);
  });
});

describe('parseGiftAmount — reddedilen girdiler', () => {
  const rejected: [string, unknown][] = [
    ['boş metin (Number("") = 0 TUZAĞI)', ''],
    ['yalnızca boşluk (Number(" ") = 0 TUZAĞI)', ' '],
    ['sayısal metin ("500" — sessizce çevrilmez)', '500'],
    ['true (Number(true) = 1 TUZAĞI)', true],
    ['false (Number(false) = 0 TUZAĞI)', false],
    ['boş dizi (Number([]) = 0 TUZAĞI)', []],
    ['tek elemanlı dizi (Number([7]) = 7 TUZAĞI)', [7]],
    ['nesne', {}],
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ];

  it.each(rejected)('%s → InvalidGiftAmountError(NOT_AN_INTEGER)', (_name, raw) => {
    try {
      parseGiftAmount(raw, MIN, MAX);
      throw new Error('beklenen hata fırlatılmadı');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidGiftAmountError);
      expect((error as InvalidGiftAmountError).reason).toBe('NOT_AN_INTEGER');
    }
  });

  it('hata mesajı min/max taşır (çağıran config\'ten geçirir)', () => {
    try {
      parseGiftAmount('x', 10, 20);
      throw new Error('beklenen hata fırlatılmadı');
    } catch (error) {
      expect((error as InvalidGiftAmountError).min).toBe(10);
      expect((error as InvalidGiftAmountError).max).toBe(20);
    }
  });
});
