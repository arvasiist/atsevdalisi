import { describe, expect, it } from 'vitest';
import { normalizeMessageBody, parseFriendshipAction } from '../../../src/domain/social/validation';
import { InvalidFriendshipActionError, InvalidMessageBodyError } from '../../../src/domain/social/errors';

/**
 * `domain/social/validation.ts` — girdi doğrulaması.
 *
 * NEDEN DOMAIN'DE TEST EDİLİYOR (DTO'da değil): CLAUDE.md "Kardeş tuzak" —
 * Vitest/esbuild altında DTO dekoratörleri (`@IsIn`, `@IsString`) sessizce
 * ATLANIR; yani bu testler, CI'da gerçekten çalışan TEK doğrulama
 * katmanını doğrular.
 */
describe('parseFriendshipAction', () => {
  it.each(['accept', 'reject'])('geçerli işlemi kabul eder: %s', (action) => {
    expect(parseFriendshipAction(action)).toBe(action);
  });

  it.each([
    ['ACCEPT', 'büyük harf — sözlük küçük harftir'],
    ['Accept', 'karışık harf'],
    ['', 'boş metin'],
    ['  accept  ', 'kırpılmaz: sözlük eşleşmesi TAM olmalıdır'],
    ['cancel', 'sözlükte olmayan bir kelime'],
  ])('geçersiz metni reddeder: %s (%s)', (value) => {
    expect(() => parseFriendshipAction(value)).toThrow(InvalidFriendshipActionError);
  });

  it.each([
    [undefined],
    [null],
    [1],
    [true],
    [['accept']],
    [{ action: 'accept' }],
  ])('metin OLMAYAN değeri reddeder: %s', (value) => {
    // `typeof value === 'string'` kontrolü şart: daraltılmamış `unknown`
    // üzerinde `includes` çağrılsaydı tip güvenliği kaybolurdu.
    expect(() => parseFriendshipAction(value)).toThrow(InvalidFriendshipActionError);
  });

  it('hatırlatıcı ham değeri taşır (hata ayıklama için)', () => {
    try {
      parseFriendshipAction('cancel');
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect((error as InvalidFriendshipActionError).value).toBe('cancel');
    }
  });
});

describe('normalizeMessageBody', () => {
  const MAX = 500;

  it('baş/son boşlukları KIRPAR', () => {
    expect(normalizeMessageBody('  merhaba  ', MAX)).toBe('merhaba');
  });

  it('normal metni olduğu gibi döner', () => {
    expect(normalizeMessageBody('merhaba', MAX)).toBe('merhaba');
  });

  it('YALNIZCA boşluktan oluşan gövdeyi EMPTY olarak reddeder', () => {
    // Aksi halde `"   "` gönderen bir istemci, sohbet ekranında GÖRÜNMEYEN
    // ama bildirim ÜRETEN bir satır oluşturabilirdi.
    try {
      normalizeMessageBody('   ', MAX);
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect((error as InvalidMessageBodyError).reason).toBe('EMPTY');
    }
  });

  it('boş metni EMPTY olarak reddeder', () => {
    try {
      normalizeMessageBody('', MAX);
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect((error as InvalidMessageBodyError).reason).toBe('EMPTY');
    }
  });

  it('TAM sınır uzunluğu kabul eder (sınır kapsayıcıdır: DB CHECK `BETWEEN 1 AND 500`)', () => {
    const body = 'a'.repeat(MAX);
    expect(normalizeMessageBody(body, MAX)).toBe(body);
  });

  it('sınırın BİR FAZLASINI reddeder', () => {
    try {
      normalizeMessageBody('a'.repeat(MAX + 1), MAX);
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect((error as InvalidMessageBodyError).reason).toBe('TOO_LONG');
      expect((error as InvalidMessageBodyError).maxLength).toBe(MAX);
    }
  });

  it('uzunluğu KOD NOKTASI sayar — emoji `char_length` ile AYNI sonucu verir', () => {
    // JS `str.length` UTF-16 birimi sayardı: 500 emoji 1000 sayılır ve
    // sunucu, veritabanının KABUL EDECEĞİ geçerli bir mesajı reddederdi.
    // PostgreSQL `char_length` karakter (kod noktası) sayar; `[...str].length`
    // de öyle.
    const emoji = '👍'.repeat(MAX);
    expect(emoji.length).toBe(MAX * 2); // UTF-16 birimi — yanlış ölçüm
    expect(normalizeMessageBody(emoji, MAX)).toBe(emoji); // kod noktası — doğru ölçüm
  });

  it('Türkçe karakterleri doğru sayar (İ/ş/ğ tek kod noktasıdır)', () => {
    const body = 'İstanbul şağır'.repeat(10);
    expect(normalizeMessageBody(body, MAX)).toBe(body);
  });

  it.each([[undefined], [null], [42], [true], [['merhaba']], [{ body: 'x' }]])(
    'metin OLMAYAN gövdeyi NOT_A_STRING olarak reddeder: %s',
    (value) => {
      try {
        normalizeMessageBody(value, MAX);
        expect.unreachable('hata fırlatmalıydı');
      } catch (error) {
        expect((error as InvalidMessageBodyError).reason).toBe('NOT_A_STRING');
      }
    },
  );
});
