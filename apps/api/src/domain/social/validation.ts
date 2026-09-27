/**
 * Arkadaşlık + mesajlaşma GİRDİ doğrulaması — SAF domain (framework'süz TS).
 *
 * **Neden domain'de (DTO'da değil):** `CLAUDE.md`'nin "Kardeş tuzak" notu —
 * Vitest/esbuild `design:paramtypes` üretmediği için DTO dekoratörleri
 * (`@IsIn`, `@IsString`, `@MaxLength`) sessizce ATLANIR ve doğrulama
 * yalnızca CI'da ya da üretimde patlar. Bu yüzden gerçek doğrulama burada,
 * DTO'dan BAĞIMSIZ olarak yapılır; DTO dekoratörleri yalnızca Swagger
 * şeması için vardır (bkz. `api/feed/dto/buy-feed.dto.ts` dosya başı notu).
 */

import { InvalidFriendshipActionError, InvalidMessageBodyError } from './errors';

/** Yanıtlanabilir iki işlem. `friendships.status` CHECK'iyle aynı sözlük. */
export const FRIENDSHIP_ACTIONS = ['accept', 'reject'] as const;
export type FriendshipAction = (typeof FRIENDSHIP_ACTIONS)[number];

/**
 * İstemciden gelen ham değeri `'accept' | 'reject'`e çevirir; başka her
 * şeyde `InvalidFriendshipActionError` fırlatır.
 *
 * `typeof value === 'string'` kontrolü ŞART: gövde `{ "action": 1 }` ya da
 * `{ "action": ["accept"] }` olduğunda `includes` çağrısı (daraltılmamış
 * `unknown` üzerinde) sessizce `false` dönerdi — hata yine fırlardı ama
 * tip güvenliği kaybolurdu.
 */
export function parseFriendshipAction(value: unknown): FriendshipAction {
  if (typeof value !== 'string' || !(FRIENDSHIP_ACTIONS as readonly string[]).includes(value)) {
    throw new InvalidFriendshipActionError(value);
  }
  return value as FriendshipAction;
}

/**
 * Mesaj gövdesini normalize eder (baş/son boşlukları kırpar) ve doğrular.
 *
 * **Kırpma (trim) bilinçlidir:** yalnızca boşluklardan oluşan bir mesaj
 * "boş" sayılır. Aksi halde `"   "` gönderen bir istemci, sohbet ekranında
 * görünmez ama bildirim üreten bir satır oluşturabilirdi.
 *
 * **Uzunluk ÖLÇÜMÜ `char_length` İLE UYUMLUDUR:** veritabanı CHECK'i
 * (`migration 0033`) `char_length(body) BETWEEN 1 AND 500` der; PostgreSQL
 * `char_length`'i UTF-8'de KARAKTER (kod noktası) sayar. JS'te `str.length`
 * UTF-16 birimi sayardı, yani bir emoji (👍) 2 sayılır ve sunucu 500
 * karakterlik geçerli bir mesajı 501 sanıp REDDEDERDİ. `[...str].length`
 * kod noktası sayar ve `char_length` ile aynı sonucu verir.
 */
export function normalizeMessageBody(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') {
    throw new InvalidMessageBodyError('NOT_A_STRING', maxLength);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InvalidMessageBodyError('EMPTY', maxLength);
  }
  if ([...trimmed].length > maxLength) {
    throw new InvalidMessageBodyError('TOO_LONG', maxLength);
  }
  return trimmed;
}
