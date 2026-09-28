/**
 * SANAL para yatırma doğrulaması — brief §21 "Gerçek para entegrasyonunu
 * şimdilik doğrudan hard-code etme", §41 "Sistemi önce: Virtual Coin /
 * Mock Wallet olarak geliştir", §42 PHASE 4b.
 *
 * ## Neden bu doğrulama DOMAIN'de (DTO'da değil)
 *
 * CLAUDE.md kural 5: Vitest/esbuild `design:paramtypes` üretmez, bu yüzden
 * `@Body()`'nin metatipi `undefined` kalır ve global `ValidationPipe` gövde
 * doğrulamasını SESSİZCE atlar. `@IsInt()`/`@Min()` yazmak derleyiciden
 * geçer, testte çalışır, ama gerçek (esbuild ile paketlenmiş) çalışma
 * anında hiç çalışmaz — yani `{ "amount": "sonsuz" }` doğrudan use-case'e
 * ulaşır. Bu yüzden doğrulamanın kendisi burada, framework'süz saf TS
 * olarak durur ve `amount` parametresi bilerek `unknown` tiplidir: gövde
 * ÇALIŞMA ANINDA her şey olabilir.
 *
 * Aynı gerekçe `InvalidRaceJoinInputError`/`InvalidGiftAmountError` için
 * de yazılmıştır (bkz. `domain/race/lobby.ts`, `domain/gift/gift.ts`).
 *
 * ## Neden "sessizce kırp" DEĞİL, "reddet"
 *
 * `wallet-history.ts`'teki `normalizeWalletHistoryLimit` sınırı AŞAN bir
 * `?limit` değerini sessizce kırpar — orada kırpılan şey bir GÖRÜNTÜLEME
 * tercihidir. Burada kırpılan şey oyuncunun parası olurdu: `maxAmount`
 * aşıldığında kırpmak, oyuncunun istediğinden AZ yatırması ve bunu ancak
 * bakiyesine bakınca fark etmesi demektir. Reddetmek (400) dürüst olandır.
 *
 * Fonksiyon saftır: DB/zaman/rastgelelik erişimi yoktur.
 */

import type { MockDepositConfig } from '@at-sevdalisi/game-config';
import type { InvalidDepositAmountProblem } from './errors';

export type MockDepositValidation =
  | { ok: true; amount: number }
  | { ok: false; problem: InvalidDepositAmountProblem };

/**
 * Ham `amount` girdisini doğrular. **ASLA fırlatmaz** — sonucu döner;
 * fırlatma kararı çağıranındır (use-case `InvalidDepositAmountError`
 * fırlatır). Bu ayrım testte her nedenin AYRI AYRI kanıtlanabilmesini
 * sağlar (bkz. `test/domain/economy/mock-deposit.spec.ts`).
 *
 * ## Bu fonksiyon `enabled` alanına BAKMAZ — bilinçlidir
 *
 * "Yatırma açık mı" sorusunun TEK cevap yeri `PaymentProvider.isEnabled()`'dır
 * (bkz. `MockPaymentProvider`), çünkü o karar config'e EK olarak ortama da
 * (`NODE_ENV === 'production'`) bağlıdır. İki yerde kontrol etmek, iki
 * doğruluk kaynağı ve er geç ayrışan iki davranış demek olurdu. Bu yüzden
 * use-case ÖNCE sağlayıcıyı sorar, SONRA tutarı doğrular.
 *
 * ## Sıra ÖNEMLİDİR ve bilinçlidir
 *
 *  1. `not_an_integer` — `typeof !== 'number'` kontrolü `'100'` (metin)
 *     girdisini yakalar; `@Body()` esbuild altında doğrulanmadığı için
 *     (CLAUDE.md kural 5) JSON'daki bir sayı gerçekten metin olarak
 *     gelebilir. `Number.isInteger` TEK BAŞINA yeterli DEĞİLDİR çünkü
 *     `NaN`/`Infinity` için `false` döner ama `'100'` için de `false`
 *     döner — ikisini AYNI mesajla ("tam sayı olmalı") karşılamak
 *     doğrudur, ama `typeof` kontrolünü atlamak `1e999` gibi bir değeri
 *     `Infinity` olarak geçirirdi (o da tam sayı DEĞİLDİR, yine elenir —
 *     yani bu iki kontrol birbirinin yedeğidir, biri kaldırılırsa diğeri
 *     tek başına yeterli olmaz).
 *  2. Aralık kontrolleri EN SONDA: ancak "bu gerçekten bir tam sayı"
 *     kanıtlandıktan sonra `min`/`max` ile karşılaştırmak anlamlıdır.
 *     `NaN` ile yapılan bir karşılaştırma HER ZAMAN `false` döner, yani
 *     sıra ters olsaydı `NaN` sessizce aralık kontrolünden geçerdi.
 */
export function validateMockDeposit(rawAmount: unknown, config: MockDepositConfig): MockDepositValidation {
  if (typeof rawAmount !== 'number' || !Number.isInteger(rawAmount)) {
    return { ok: false, problem: 'not_an_integer' };
  }
  if (rawAmount < config.minAmount) {
    return { ok: false, problem: 'below_minimum' };
  }
  if (rawAmount > config.maxAmount) {
    return { ok: false, problem: 'above_maximum' };
  }
  return { ok: true, amount: rawAmount };
}

/**
 * Config'in KENDİ tutarlılığını denetler — bir oyuncu girdisi değil,
 * bir PROGRAMLAMA/yapılandırma hatasıdır, bu yüzden düz `Error` fırlatır
 * (API katmanına 400/403 olarak DEĞİL, 500 olarak çıkar ve bu doğrudur:
 * yanlış yapılandırılmış bir sunucuda para yatırma ucu çalışmamalıdır).
 *
 * `claim-daily-reward.use-case.ts`'teki `assertDailyGiftItemsAreStocked`
 * ile AYNI gerekçe: sessiz bir yapılandırma hatası, "uç nokta çalışıyor
 * ama hiçbir şey yapmıyor" gibi teşhisi zor bir duruma dönüşürdü.
 *
 * Kontroller:
 *  - `minAmount`/`maxAmount` sonlu tam sayı olmalı (`NaN` ile yapılan bir
 *    karşılaştırma HER ZAMAN `false` döner — yani `minAmount: null`
 *    içeren bir config, doğrulamayı sessizce "her tutar geçerli" hâline
 *    getirirdi).
 *  - `minAmount > 0` olmalı: migration 0019'un `CHECK (amount <> 0)`'ı
 *    sıfır tutarlı bir defter satırını zaten reddeder; bunu config
 *    aşamasında yakalamak, hatayı 500 yerine açık bir mesajla verir.
 *  - `maxAmount >= minAmount` olmalı — tersi, HİÇBİR tutarın geçerli
 *    olmadığı bir uç nokta demektir.
 */
export function assertValidMockDepositConfig(config: MockDepositConfig): void {
  const { minAmount, maxAmount } = config;
  if (!Number.isInteger(minAmount) || !Number.isInteger(maxAmount)) {
    throw new Error(
      `economy.config.json → mockDeposit: minAmount/maxAmount tam sayı olmalı (min=${String(minAmount)}, max=${String(maxAmount)}).`,
    );
  }
  if (minAmount <= 0) {
    throw new Error(`economy.config.json → mockDeposit.minAmount pozitif olmalı (şu an ${minAmount}).`);
  }
  if (maxAmount < minAmount) {
    throw new Error(
      `economy.config.json → mockDeposit.maxAmount minAmount'dan küçük olamaz (min=${minAmount}, max=${maxAmount}) — hiçbir tutar geçerli olmazdı.`,
    );
  }
}
