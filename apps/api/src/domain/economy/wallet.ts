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

export type Currency = 'money' | 'gems';

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
