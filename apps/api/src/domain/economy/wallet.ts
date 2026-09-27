import { InsufficientFundsError, InvalidAmountError } from './errors';

/**
 * Cüzdan (bakiye) domain kuralları. Brief §31: "Ekonomi backend tarafından
 * authoritative tutulmalıdır" ve Kural: "Negatif para oluşmamalı".
 *
 * Bu fonksiyonlar SAF'tır: hiçbir veritabanı/HTTP erişimi içermez, sadece
 * girdi/çıktı üzerinden çalışır. Gerçek transaction/row-locking
 * (docs/SECURITY.md §5) Application/Infrastructure katmanında, bu
 * fonksiyonların etrafına sarılarak uygulanır.
 */

/**
 * Para birimi modeli TEK bir yerde tanımlıdır: `@at-sevdalisi/shared-types`
 * (`packages/shared-types/src/currency.ts`) — çünkü aynı birleşimi
 * `apps/web` de kullanır. Burada YENİDEN TANIMLANMAZ, yalnızca domain'in
 * geri kalanının (ve `application/ports/economy-ledger.ts`,
 * `domain/economy/errors.ts`'in) kullandığı içe aktarma yolundan dışa
 * aktarılır — böylece tek bir doğruluk kaynağı kalır (brief §14, §29
 * "duplicate economy implementation oluşturma").
 *
 * Oyuncuya görünen adlar (Çip / Elmas) UI katmanında yaşar:
 * `apps/web/src/lib/currency.ts` + `docs/ECONOMY.md` §4.
 *
 * `CURRENCIES` ile `economy_transactions.currency` üzerindeki
 * `CHECK (currency IN (...))` arasındaki kaymayı
 * `apps/api/test/database/economy-currency.spec.ts` yakalar.
 */
import type { Currency } from '@at-sevdalisi/shared-types';

export { CURRENCIES, type Currency } from '@at-sevdalisi/shared-types';

export interface WalletBalance {
  money: number;
  gems: number;
}

function assertValidAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new InvalidAmountError(amount);
  }
}

/** Verilen bakiyenin belirtilen miktarı karşılayıp karşılamadığını kontrol eder. */
export function canAfford(balance: WalletBalance, amount: number, currency: Currency): boolean {
  assertValidAmount(amount);
  return balance[currency] >= amount;
}

/**
 * Bakiyeden düşer. Yetersiz bakiye varsa InsufficientFundsError fırlatır —
 * hiçbir koşulda negatif bakiye üretmez (brief §31, §53 Economy testleri).
 */
export function debit(balance: WalletBalance, amount: number, currency: Currency): WalletBalance {
  assertValidAmount(amount);
  if (balance[currency] < amount) {
    throw new InsufficientFundsError(currency, amount, balance[currency]);
  }
  return { ...balance, [currency]: balance[currency] - amount };
}

/** Bakiyeye ekler (yarış ödülü, satış geliri, günlük ödül vb.). */
export function credit(balance: WalletBalance, amount: number, currency: Currency): WalletBalance {
  assertValidAmount(amount);
  return { ...balance, [currency]: balance[currency] + amount };
}

/**
 * Bir transfer işlemini (örn. at satışı: alıcıdan düş, satıcıya ekle) tek
 * bir saf fonksiyonda ifade eder; Application katmanı bunu tek bir DB
 * transaction'ı içinde çalıştırır (docs/SECURITY.md §5).
 */
export function transfer(
  from: WalletBalance,
  to: WalletBalance,
  amount: number,
  currency: Currency,
): { from: WalletBalance; to: WalletBalance } {
  const updatedFrom = debit(from, amount, currency);
  const updatedTo = credit(to, amount, currency);
  return { from: updatedFrom, to: updatedTo };
}
