/**
 * Hediye gönderimi — SAF domain mantığı (framework'süz TS, `CLAUDE.md`
 * "KATMAN YÖNÜ TEK YÖNLÜ"). Proje sahibinin açık talebi (27.09.2026):
 * "hediye gönderimi".
 *
 * **Burada YAPILMAYAN şey:** para hareketi. `transfer`
 * (`domain/economy/wallet.ts`) ve `SELECT ... FOR UPDATE` + İKİ
 * `economy_transactions` satırı Infrastructure katmanında, TEK bir
 * transaction içinde yapılır (`PostgresGiftRepository.sendGift`) —
 * `PostgresMarketPurchaseRepository.executePurchase` ile AYNI iş bölümü.
 * Bu dosya YALNIZCA "bu hediye gönderilebilir mi" sorusunu cevaplar.
 *
 * **Neden bir SAF modül (neden doğrudan use-case içinde değil):** beş kural
 * (kendine değil, tutar geçerli, birim izinli, arkadaşız, günlük tavan
 * dolmadı) bir veritabanı olmadan test edilebilsin diye —
 * `domain/grandstand/ticket.ts`'in `assertRaceWatchable`'ı ile AYNI gerekçe.
 * `apps/api/test/domain/gift/gift.spec.ts` bu beşini de sınır değerleriyle
 * doğrular.
 */

import type { Currency } from '../economy/wallet';
import { CURRENCIES } from '../economy/wallet';
import {
  CannotGiftSelfError,
  DailyGiftLimitReachedError,
  GiftCurrencyNotAllowedError,
  GiftRequiresFriendshipError,
  InvalidGiftAmountError,
} from './errors';

/** `GiftConfig`'in bu modülün İHTİYAÇ DUYDUĞU alt kümesi — `game-config`'e bağımlılık YARATMAZ (domain framework'süz ve paketsiz kalır). */
export interface GiftRules {
  minAmount: number;
  maxAmount: number;
  dailyLimit: number;
  /** `dailyLimit`'in ölçüldüğü kayan pencere (saat) — SQL'de `$2::int * interval '1 hour'`. */
  dailyWindowHours: number;
  allowedCurrencies: readonly string[];
}

/** Kendine hediye gönderilemez. `gift_sends_not_self` CHECK'inin (`migration 0034`) domain karşılığı. */
export function assertNotSelfGift(senderId: string, recipientId: string): void {
  if (senderId === recipientId) {
    throw new CannotGiftSelfError();
  }
}

/**
 * Miktar geçerli mi: TAM SAYI, `minAmount`–`maxAmount` aralığında (İKİSİ DE
 * DAHİL).
 *
 * **Neden tam sayı:** `players.money`/`gems` ve `economy_transactions.amount`
 * BIGINT'tir; kesirli bir miktar ya sessizce kırpılır ya da `22P02` ile
 * anlaşılmaz bir veritabanı hatası üretirdi.
 *
 * **Neden sıfır/negatif ayrı bir dal DEĞİL:** config `minAmount`'u zaten
 * 1'den küçük olamaz (`assertGiftConfigIsValid`) — yani "0 gönderilemez"
 * kuralı `BELOW_MIN` dalının içindedir, ikinci bir kontrol gereksizdir.
 *
 * `reason` ayrımı kullanıcıya doğru mesajı vermek içindir: "tam sayı
 * olmalı" ile "10 ile 10.000 arasında olmalı" farklı düzeltmeler gerektirir.
 */
export function assertValidGiftAmount(amount: number, rules: Pick<GiftRules, 'minAmount' | 'maxAmount'>): void {
  if (!Number.isInteger(amount)) {
    throw new InvalidGiftAmountError('NOT_AN_INTEGER', rules.minAmount, rules.maxAmount);
  }
  if (amount < rules.minAmount) {
    throw new InvalidGiftAmountError('BELOW_MIN', rules.minAmount, rules.maxAmount);
  }
  if (amount > rules.maxAmount) {
    throw new InvalidGiftAmountError('ABOVE_MAX', rules.minAmount, rules.maxAmount);
  }
}

/**
 * Ham `currency` değerini doğrular ve `Currency`'ye daraltır.
 *
 * **İKİ İŞ YAPAR (bilinçli):** (1) gelen değerin bilinen bir para birimi
 * olup olmadığını, (2) o birimin HEDİYE EDİLEBİLİR olup olmadığını
 * kontrol eder. İkisi TEK bir hata koduyla döner (`GIFT_CURRENCY_NOT_ALLOWED`)
 * çünkü kullanıcının gözünde ikisi de aynıdır: "bu birimi gönderemezsin".
 * Ayrım yalnızca hata mesajındaki `allowed` listesinde görünür.
 *
 * **Neden `CURRENCIES`'e karşı da kontrol edilir:** config'e yazım hatasıyla
 * (`"chip"`, `"Money"`) bir değer girerse, o değer `allowedCurrencies`'te
 * olduğu için "izinli" sayılırdı — ve `economy_transactions.currency`
 * CHECK'ine (`IN ('money','gems')`) takılıp anlaşılmaz bir `23514` üretirdi.
 * Bu kontrol o hatayı 400'e çevirir.
 *
 * `toLowerCase()` UYGULANMAZ: para birimi kimlikleri makine tarafından
 * üretilir (istemci onları config'ten/DTO'dan aynen kopyalar), kullanıcı
 * elle yazmaz — `canonicalPair`'ın aksine burada bir "kullanıcı büyük harf
 * yazmış olabilir" senaryosu yoktur ve sessiz normalleştirme, bozuk bir
 * config'i gizlerdi.
 */
export function resolveGiftCurrency(raw: unknown, allowedCurrencies: readonly string[]): Currency {
  if (typeof raw !== 'string' || !CURRENCIES.includes(raw as Currency) || !allowedCurrencies.includes(raw)) {
    throw new GiftCurrencyNotAllowedError(String(raw), allowedCurrencies);
  }
  return raw as Currency;
}

/**
 * Arkadaşlık kapısı. `isFriend` çağıran tarafından SORGULANMIŞ olmalıdır
 * (`SocialRepository.areFriends` veya transaction içindeki eşdeğeri).
 *
 * Bu kuralın İKİNCİ savunma hattı yoktur (bir DB CHECK'i olamaz — iki tablo
 * arası bir "durum" kuralıdır), bu yüzden çağıran onu HEM use-case'te
 * (erken, anlaşılır hata için) HEM de yazma transaction'ının İÇİNDE
 * (kilitli satırlarla, yarış koşuluna karşı) çalıştırmalıdır — bkz.
 * `PostgresGiftRepository.sendGift`.
 */
export function assertGiftAllowedByFriendship(isFriend: boolean, recipientId: string): void {
  if (!isFriend) {
    throw new GiftRequiresFriendshipError(recipientId);
  }
}

/**
 * Kayan penceredeki (`dailyWindowHours`) hediye SAYISI tavanı.
 *
 * `sentCount` çağıran tarafından SORGULANMIŞ olmalıdır. Sınır değeri
 * KAPSAYICIDIR: tam `dailyLimit` kadar göndermiş bir oyuncu BİR tane daha
 * gönderemez (`sentCount >= dailyLimit` → hata) — yani tavan "en fazla N
 * hediye" demektir, "N+1 hediye" değil.
 *
 * **Yarış koşulu:** sayaç, gönderenin `players` satırı `FOR UPDATE` ile
 * KİLİTLİYKEN okunur (bkz. `PostgresGiftRepository.sendGift`) — aynı
 * gönderenin eşzamanlı iki isteği bu kilit üzerinden SERİLEŞİR, bu yüzden
 * sayım güvenle tutarlıdır (`StableCapacityExceededError` kontrolünün
 * alıcı satır kilidiyle serileşmesiyle AYNI gerekçe).
 */
export function assertUnderDailyGiftLimit(sentCount: number, dailyLimit: number): void {
  if (sentCount >= dailyLimit) {
    throw new DailyGiftLimitReachedError(dailyLimit);
  }
}

/**
 * Config'in KENDİSİNİ doğrular — kullanıcı girdisinden ÖNCE çağrılmalıdır.
 *
 * `game-config` yükleyicisi saf bir cast olduğundan (çalışma zamanı
 * doğrulaması YOK, bkz. `packages/game-config/src/index.ts` dosya başı notu)
 * bozuk bir config şu üç sessiz felakete dönüşebilirdi:
 *  - `minAmount <= 0` → `gift_sends.amount > 0` CHECK'ine takılan bir
 *    "sıfır hediye" yolu (`InvalidAmountError` ile anlaşılmaz bir çökme),
 *  - `maxAmount < minAmount` → HİÇBİR miktarın geçemediği bir çıkmaz sokak
 *    (her istek `BELOW_MIN` ya da `ABOVE_MAX` döner, sebebi görünmez),
 *  - boş/geçersiz `allowedCurrencies` → hiçbir hediyenin gönderilemediği
 *    ama sunucunun sağlıklı GÖRÜNDÜĞÜ bir durum,
 *  - `dailyWindowHours <= 0` → SQL penceresi BOŞ (ya da geleceğe kaymış)
 *    olur, `COUNT(*)` her zaman 0 döner ve **günlük tavan SESSİZCE
 *    kapanır** — bu, dört felaketin en sinsi olanıdır: hiçbir hata
 *    görünmez, yalnızca savunma ortadan kalkar.
 *
 * `assertTicketPriceIsValid` ile AYNI ilke: bu bir OPERATÖR hatasıdır, düz
 * bir `Error` ile (400 değil) yüzeye çıkar ve `gift-config.spec.ts` ile
 * CI'da da yakalanır.
 */
export function assertGiftConfigIsValid(config: GiftRules): void {
  const integers = [config.minAmount, config.maxAmount, config.dailyLimit, config.dailyWindowHours];
  if (integers.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error(
      `Hediye config'i geçersiz (config/gift.config.json): minAmount/maxAmount/dailyLimit/dailyWindowHours pozitif tam sayı olmalıdır.`,
    );
  }
  if (config.minAmount > config.maxAmount) {
    throw new Error(
      `Hediye config'i geçersiz (config/gift.config.json): minAmount (${config.minAmount}) maxAmount (${config.maxAmount}) değerinden büyük olamaz.`,
    );
  }
  if (config.allowedCurrencies.length === 0) {
    throw new Error(
      `Hediye config'i geçersiz (config/gift.config.json): allowedCurrencies boş olamaz (hiçbir hediye gönderilemez).`,
    );
  }
  const unknown = config.allowedCurrencies.filter((currency) => !CURRENCIES.includes(currency as Currency));
  if (unknown.length > 0) {
    throw new Error(
      `Hediye config'i geçersiz (config/gift.config.json): bilinmeyen para birimi(leri): ${unknown.join(', ')}.`,
    );
  }
}
