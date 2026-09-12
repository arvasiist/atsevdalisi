/**
 * Economy domain'ine özgü hatalar. Bu hatalar Application katmanında
 * yakalanıp docs/API.md §11'deki ErrorCode değerlerine eşlenir (bkz.
 * apps/api/src/api/middleware/http-exception.filter.ts, FAZ 1'de
 * genişletilecek).
 */

export class InsufficientFundsError extends Error {
  constructor(
    public readonly currency: 'money' | 'gems',
    public readonly required: number,
    public readonly available: number,
  ) {
    super(
      `Yetersiz bakiye: ${currency} için ${required} gerekiyor, mevcut ${available}.`,
    );
    this.name = 'InsufficientFundsError';
  }
}

export class InvalidAmountError extends Error {
  constructor(amount: number) {
    super(`Geçersiz miktar: ${amount}. Miktar pozitif bir tam sayı olmalıdır.`);
    this.name = 'InvalidAmountError';
  }
}
