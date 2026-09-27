import { describe, expect, it } from 'vitest';
import {
  assertGiftAllowedByFriendship,
  assertGiftConfigIsValid,
  assertNotSelfGift,
  assertUnderDailyGiftLimit,
  assertValidGiftAmount,
  resolveGiftCurrency,
  type GiftRules,
} from '../../../src/domain/gift/gift';
import {
  CannotGiftSelfError,
  DailyGiftLimitReachedError,
  GiftCurrencyNotAllowedError,
  GiftRequiresFriendshipError,
  InvalidGiftAmountError,
} from '../../../src/domain/gift/errors';

/**
 * Hediye gönderimi — SAF kurallar (proje sahibinin açık talebi, 27.09.2026).
 *
 * **Bu dosyanın asıl değeri:** beş kapının SINIR DEĞERLERİNİ
 * doğrulamasıdır. `assertUnderDailyGiftLimit`'in `>=` mi `>` mi olduğu,
 * `assertValidGiftAmount`'ın aralığın UÇLARINI kabul edip etmediği gibi
 * sorular, para yolu bir dilimde "yaklaşık doğru" olamaz — ya sınırdadır
 * ya değildir.
 */

const RULES: GiftRules = {
  minAmount: 10,
  maxAmount: 1_000,
  dailyLimit: 3,
  dailyWindowHours: 24,
  allowedCurrencies: ['money'],
};

describe('assertNotSelfGift', () => {
  it('kendine hediye göndermeyi reddeder', () => {
    expect(() => assertNotSelfGift('a', 'a')).toThrow(CannotGiftSelfError);
  });

  it('iki FARKLI oyuncuya izin verir', () => {
    expect(() => assertNotSelfGift('a', 'b')).not.toThrow();
  });

  it('büyük/küçük harf farkı "farklı oyuncu" sayılır (normalizasyon YAPILMAZ — id\'ler makine üretimidir)', () => {
    // `canonicalPair`'ın `toLowerCase()`'inin AKSİNE: burada normalize
    // etmek, `gift_sends_not_self` CHECK'ini atlatmaya çalışan bir girdiyi
    // sessizce EŞİTLEŞTİRİRDİ. UUID'ler zaten küçük harf üretilir.
    expect(() => assertNotSelfGift('ABC', 'abc')).not.toThrow();
  });
});

describe('assertValidGiftAmount', () => {
  it('tam sayı olmayan miktarı NOT_AN_INTEGER ile reddeder', () => {
    try {
      assertValidGiftAmount(10.5, RULES);
      throw new Error('beklenen hata fırlatılmadı');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidGiftAmountError);
      expect((error as InvalidGiftAmountError).reason).toBe('NOT_AN_INTEGER');
    }
  });

  it('alt sınırın ALTINI BELOW_MIN ile reddeder', () => {
    try {
      assertValidGiftAmount(RULES.minAmount - 1, RULES);
      throw new Error('beklenen hata fırlatılmadı');
    } catch (error) {
      expect((error as InvalidGiftAmountError).reason).toBe('BELOW_MIN');
    }
  });

  it('üst sınırın ÜSTÜNÜ ABOVE_MAX ile reddeder', () => {
    try {
      assertValidGiftAmount(RULES.maxAmount + 1, RULES);
      throw new Error('beklenen hata fırlatılmadı');
    } catch (error) {
      expect((error as InvalidGiftAmountError).reason).toBe('ABOVE_MAX');
    }
  });

  it('sıfır ve negatif miktarı reddeder (minAmount\'un altındadır)', () => {
    expect(() => assertValidGiftAmount(0, RULES)).toThrow(InvalidGiftAmountError);
    expect(() => assertValidGiftAmount(-5, RULES)).toThrow(InvalidGiftAmountError);
  });

  it('SINIR DEĞERLERİ KAPSAYICIDIR: min ve max geçerlidir', () => {
    // Aralığın uçlarının dışlanması, config'te yazan sayının
    // gönderilememesi gibi anlaşılmaz bir durum yaratırdı.
    expect(() => assertValidGiftAmount(RULES.minAmount, RULES)).not.toThrow();
    expect(() => assertValidGiftAmount(RULES.maxAmount, RULES)).not.toThrow();
  });

  it('hata mesajı min/max değerlerini taşır (kullanıcı sınırı öğrenmek için ikinci istek atmaz)', () => {
    // Şablon dizesi ham sayıyı yazar (`1000`, `1.000` DEĞİL) — bu yüzden
    // karşılaştırma biçimlendirmeye değil, DEĞERE bakar.
    expect(() => assertValidGiftAmount(5, RULES)).toThrow(/10 ile 1000 arasında/);
  });
});

describe('resolveGiftCurrency', () => {
  it('izinli ve bilinen bir birimi kabul eder', () => {
    expect(resolveGiftCurrency('money', ['money', 'gems'])).toBe('money');
    expect(resolveGiftCurrency('gems', ['money', 'gems'])).toBe('gems');
  });

  it('BİLİNEN ama İZİNLİ OLMAYAN bir birimi reddeder', () => {
    expect(() => resolveGiftCurrency('gems', ['money'])).toThrow(GiftCurrencyNotAllowedError);
  });

  it('BİLİNMEYEN bir birimi reddeder (config\'e yazım hatası yazılmış olsa bile)', () => {
    // `CURRENCIES`'e karşı kontrol OLMASAYDI, `allowedCurrencies: ['chip']`
    // gibi bir yazım hatası "izinli" sayılır ve
    // `economy_transactions.currency` CHECK'ine takılıp anlaşılmaz bir
    // `23514` (500) üretirdi.
    expect(() => resolveGiftCurrency('chip', ['chip'])).toThrow(GiftCurrencyNotAllowedError);
  });

  it('metin olmayan girdiyi reddeder', () => {
    expect(() => resolveGiftCurrency(null, ['money'])).toThrow(GiftCurrencyNotAllowedError);
    expect(() => resolveGiftCurrency(42, ['money'])).toThrow(GiftCurrencyNotAllowedError);
    expect(() => resolveGiftCurrency(undefined, ['money'])).toThrow(GiftCurrencyNotAllowedError);
  });

  it('BÜYÜK HARFLİ bir birimi reddeder (sessiz normalleştirme YAPILMAZ)', () => {
    // `canonicalPair`'ın aksine burada `toLowerCase()` YOKTUR: bozuk bir
    // config'i ya da istemci hatasını gizlemek yerine 400 dönmek doğrudur.
    expect(() => resolveGiftCurrency('MONEY', ['money'])).toThrow(GiftCurrencyNotAllowedError);
  });
});

describe('assertGiftAllowedByFriendship', () => {
  it('arkadaş değilse 403\'e eşlenen hatayı fırlatır', () => {
    expect(() => assertGiftAllowedByFriendship(false, 'r-1')).toThrow(GiftRequiresFriendshipError);
  });

  it('arkadaşsa geçer', () => {
    expect(() => assertGiftAllowedByFriendship(true, 'r-1')).not.toThrow();
  });

  it('hata, alıcı id\'sini taşır (istemci doğru ekrana yönlendirebilsin diye)', () => {
    try {
      assertGiftAllowedByFriendship(false, 'recipient-x');
      throw new Error('beklenen hata fırlatılmadı');
    } catch (error) {
      expect((error as GiftRequiresFriendshipError).recipientId).toBe('recipient-x');
    }
  });
});

describe('assertUnderDailyGiftLimit', () => {
  it('tavanın ALTINDA izin verir', () => {
    expect(() => assertUnderDailyGiftLimit(0, 3)).not.toThrow();
    expect(() => assertUnderDailyGiftLimit(2, 3)).not.toThrow();
  });

  it('TAVARA ULAŞINCA reddeder (sınır KAPSAYICIDIR: "en fazla N" demektir)', () => {
    expect(() => assertUnderDailyGiftLimit(3, 3)).toThrow(DailyGiftLimitReachedError);
  });

  it('tavanın ÜSTÜNDE de reddeder', () => {
    expect(() => assertUnderDailyGiftLimit(4, 3)).toThrow(DailyGiftLimitReachedError);
  });

  it('hata, tavanı mesajda taşır', () => {
    // `sentCount` tavanı AŞMALI (`7 >= 7`) — aksi halde bu blok kendi
    // `throw new Error(...)`'ını yakalar ve `limit` `undefined` çıkar.
    try {
      assertUnderDailyGiftLimit(7, 7);
      throw new Error('beklenen hata fırlatılmadı');
    } catch (error) {
      expect(error).toBeInstanceOf(DailyGiftLimitReachedError);
      expect((error as DailyGiftLimitReachedError).limit).toBe(7);
      expect((error as Error).message).toContain('7');
    }
  });
});

describe('assertGiftConfigIsValid', () => {
  it('geçerli config\'i kabul eder', () => {
    expect(() => assertGiftConfigIsValid(RULES)).not.toThrow();
  });

  it('bozuk config\'te 400 DEĞİL, düz bir Error fırlatır (bu bir OPERATÖR hatasıdır)', () => {
    // `assertTicketPriceIsValid` ile AYNI ilke: kullanıcıya "400" demek,
    // sorumluluğu yanlış tarafa yükleme olurdu.
    const broken: GiftRules = { ...RULES, minAmount: 0 };
    expect(() => assertGiftConfigIsValid(broken)).toThrow(Error);
    expect(() => assertGiftConfigIsValid(broken)).not.toThrow(InvalidGiftAmountError);
  });

  const invalidOverrides: [string, Partial<GiftRules>][] = [
    ['minAmount sıfır', { minAmount: 0 }],
    ['minAmount negatif', { minAmount: -1 }],
    ['minAmount kesirli', { minAmount: 1.5 }],
    ['maxAmount sıfır', { maxAmount: 0 }],
    ['dailyLimit sıfır', { dailyLimit: 0 }],
    ['dailyWindowHours sıfır', { dailyWindowHours: 0 }],
    ['dailyWindowHours negatif', { dailyWindowHours: -24 }],
    ['dailyWindowHours kesirli', { dailyWindowHours: 1.5 }],
  ];

  it.each(invalidOverrides)('%s → fırlatır', (_name, override) => {
    expect(() => assertGiftConfigIsValid({ ...RULES, ...override })).toThrow(Error);
  });

  it('dailyWindowHours = 0 ÖZELLİKLE yakalanır: pencere boşalır ve tavan SESSİZCE kapanır', () => {
    // `now() - (0 * interval '1 hour')` = `now()` → `COUNT(*)` her zaman 0
    // → `sentCount >= dailyLimit` hiç sağlanmaz. Hata görünmez, savunma
    // ortadan kalkar. Bu yüzden bu alan da config doğrulamasındadır.
    expect(() => assertGiftConfigIsValid({ ...RULES, dailyWindowHours: 0 })).toThrow(/dailyWindowHours/);
  });

  it('minAmount > maxAmount olan çıkmaz sokağı yakalar', () => {
    expect(() => assertGiftConfigIsValid({ ...RULES, minAmount: 2_000 })).toThrow(/minAmount/);
  });

  it('boş allowedCurrencies\'i yakalar (hiçbir hediye gönderilemez)', () => {
    expect(() => assertGiftConfigIsValid({ ...RULES, allowedCurrencies: [] })).toThrow(/allowedCurrencies/);
  });

  it('bilinmeyen para birimini yakalar', () => {
    expect(() => assertGiftConfigIsValid({ ...RULES, allowedCurrencies: ['money', 'chip'] })).toThrow(/chip/);
  });
});
