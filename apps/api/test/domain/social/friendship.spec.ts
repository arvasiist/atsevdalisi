import { describe, expect, it } from 'vitest';
import {
  assertFriendRequestAllowed,
  assertNotSelf,
  assertUnderSocialLimit,
  canonicalPair,
  otherParty,
} from '../../../src/domain/social/friendship';
import {
  CannotFriendSelfError,
  FriendshipAlreadyExistsError,
  SocialLimitReachedError,
} from '../../../src/domain/social/errors';

/**
 * `domain/social/friendship.ts` — kanonik çift ve sosyal kurallar.
 *
 * NEDEN BU TESTLER ÖNEMLİ: `canonicalPair`'in ürettiği sıra, `friendships`
 * tablosunun `player_low_id < player_high_id` CHECK'iyle UYUŞMAK
 * ZORUNDADIR. Uyuşmazsa INSERT veritabanı seviyesinde `23514` ile düşer ve
 * kullanıcı 500 görür — yani bu dosya, "iki katmanda iki farklı sıralama
 * mantığı" riskine karşı TEK savunmadır (`sql-literals.spec.ts`'in
 * SQL/config uyumunu korumasıyla AYNI kategori).
 */
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('canonicalPair', () => {
  it('küçük id her zaman `lowId` olur', () => {
    expect(canonicalPair(A, B)).toEqual({ lowId: A, highId: B });
  });

  it('SIRADAN BAĞIMSIZDIR: (A,B) ile (B,A) AYNI çifti üretir', () => {
    // Bu, "A→B isteği" ile "B→A isteği"nin TEK satır olmasının garantisidir.
    expect(canonicalPair(B, A)).toEqual(canonicalPair(A, B));
  });

  it('büyük harfli uuid KÜÇÜK harfe indirilir', () => {
    // PostgreSQL `uuid` parametresini normalize eder ama JS metin
    // karşılaştırması ETMEZ ('A' > 'a') — normalize edilmezse CHECK ihlali
    // riski doğardı.
    expect(canonicalPair(A.toUpperCase(), B)).toEqual({ lowId: A, highId: B });
  });

  it('eşit id verilirse low === high döner (DB CHECK yakalar, sessizce yanlış satır üretilmez)', () => {
    // `assertNotSelf` çağrılmadan bu fonksiyona eşit id gelmesi bir
    // programlama hatasıdır; burada AMAÇ çökmeden, CHECK'in reddedeceği
    // bir değer üretmektir — yanlış bir çift ÜRETMEK değil.
    expect(canonicalPair(A, A)).toEqual({ lowId: A, highId: A });
  });
});

describe('assertNotSelf', () => {
  it('aynı id için CannotFriendSelfError fırlatır', () => {
    expect(() => assertNotSelf(A, A)).toThrow(CannotFriendSelfError);
  });

  it('farklı id için fırlatmaz', () => {
    expect(() => assertNotSelf(A, B)).not.toThrow();
  });
});

describe('otherParty', () => {
  const pair = canonicalPair(A, B);

  it('karşı tarafı döner (low tarafından bakınca)', () => {
    expect(otherParty(pair, A)).toBe(B);
  });

  it('karşı tarafı döner (high tarafından bakınca)', () => {
    expect(otherParty(pair, B)).toBe(A);
  });

  it('büyük harfli id ile de doğru çalışır (case-insensitive)', () => {
    expect(otherParty(pair, B.toUpperCase())).toBe(A);
  });
});

describe('assertFriendRequestAllowed', () => {
  it('kayıt YOKKEN (null) izin verir', () => {
    expect(() => assertFriendRequestAllowed(null)).not.toThrow();
  });

  it('REDDEDİLMİŞ kayıtta izin verir (yeniden istek gönderilebilir)', () => {
    // Bilinçli ürün kararı: reddedilen bir istek, kalıcı bir yasak değildir.
    // Satır yeniden `pending` yapılır (yeni satır AÇILMAZ — UNIQUE).
    expect(() => assertFriendRequestAllowed('rejected')).not.toThrow();
  });

  it('BEKLEYEN kayıtta FriendshipAlreadyExistsError fırlatır', () => {
    expect(() => assertFriendRequestAllowed('pending')).toThrow(FriendshipAlreadyExistsError);
  });

  it('KABUL EDİLMİŞ kayıtta FriendshipAlreadyExistsError fırlatır', () => {
    expect(() => assertFriendRequestAllowed('accepted')).toThrow(FriendshipAlreadyExistsError);
  });

  it('hatanın `status` alanı çağırana hangi durumun engellediğini söyler', () => {
    try {
      assertFriendRequestAllowed('accepted');
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect(error).toBeInstanceOf(FriendshipAlreadyExistsError);
      expect((error as FriendshipAlreadyExistsError).status).toBe('accepted');
    }
  });
});

describe('assertUnderSocialLimit', () => {
  it('sınırın ALTINDA izin verir', () => {
    expect(() => assertUnderSocialLimit(24, 25, 'PENDING_REQUESTS')).not.toThrow();
  });

  it('sınıra TAM ULAŞINCA engeller (sınır kapsayıcıdır: "en fazla N" = N tane varken yenisi yok)', () => {
    expect(() => assertUnderSocialLimit(25, 25, 'PENDING_REQUESTS')).toThrow(SocialLimitReachedError);
  });

  it('sınırın ÜSTÜNDE engeller', () => {
    expect(() => assertUnderSocialLimit(30, 25, 'PENDING_REQUESTS')).toThrow(SocialLimitReachedError);
  });

  it('hatırlatıcı `reason` ve `limit` alanlarını taşır', () => {
    try {
      assertUnderSocialLimit(25, 25, 'PENDING_REQUESTS');
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect((error as SocialLimitReachedError).reason).toBe('PENDING_REQUESTS');
      expect((error as SocialLimitReachedError).limit).toBe(25);
    }
  });

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'bozuk config sınırı (%s) sessizce "sınırsız"a dönüşmez, açıkça çöker',
    (limit) => {
      // `game-config` yükleyicisi saf bir cast olduğundan (çalışma zamanı
      // doğrulaması YOK) bu kontrol ŞARTTIR: `limit = 0` olsaydı HER istek
      // 409 alırdı, `NaN` olsaydı karşılaştırma hep `false` dönüp tavan
      // SESSİZCE KAYBOLURDU.
      expect(() => assertUnderSocialLimit(0, limit, 'FRIENDS')).toThrow(/Sosyal sınır geçersiz/);
    },
  );
});
