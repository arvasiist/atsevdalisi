/**
 * Hediye gönderimi — ham girdinin AYRIŞTIRILMASI (parsing).
 *
 * `domain/social/validation.ts` ile AYNI ilke ve AYNI gerekçe
 * (`CLAUDE.md` "Kardeş tuzak"): **DTO dekoratörleri (`@IsInt`, `@IsIn`)
 * TEK BAŞINA YETERLİ DEĞİLDİR** — Vitest/esbuild `design:paramtypes`
 * üretmediğinden ve dekoratörleri atladığından, HTTP gövdesinden gelen
 * değer ÇALIŞMA ZAMANINDA `number` olduğu iddia edilen bir `string`
 * olabilir. Bu yüzden doğrulama burada, domain katmanında, değerin
 * GERÇEK tipine bakılarak yapılır.
 *
 * `assertValidGiftAmount` (`gift.ts`) `number` bekler; bu dosya ondan
 * ÖNCE çalışır ve "bu bir sayı bile değil" durumunu aynı hata koduna
 * (`INVALID_GIFT_AMOUNT`) çevirir — istemci için ikisi de "bu miktar
 * gönderilemez" demektir.
 */

import { InvalidGiftAmountError } from './errors';

/**
 * Ham `amount` alanını `number`'a çevirir; çevrilemiyorsa
 * `InvalidGiftAmountError('NOT_AN_INTEGER')` fırlatır.
 *
 * **`Number(raw)` KULLANILMAZ:** `Number('')` ve `Number(' ')` `0` döner,
 * `Number(true)` `1` döner, `Number([])` `0` döner — yani boş bir gövde
 * alanı sessizce "0 Çip" ya da "1 Çip" hediyeye dönüşürdü. Yalnızca
 * `typeof raw === 'number'` kabul edilir (JSON gövdesinden gelen sayı
 * zaten budur) ve sonluluk `Number.isFinite` ile ayrıca kontrol edilir
 * (`Infinity`/`NaN` JSON'da temsil EDİLEMEZ ama `undefined`/nesne gibi
 * değerler edilebilir; `JSON.stringify(Infinity)` `null` üretir).
 *
 * `min`/`max` yalnızca HATA MESAJI içindir — aralık kontrolü
 * `assertValidGiftAmount`'ta yapılır, burada TEKRARLANMAZ (tek doğruluk
 * kaynağı).
 */
export function parseGiftAmount(raw: unknown, min: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new InvalidGiftAmountError('NOT_AN_INTEGER', min, max);
  }
  return raw;
}
