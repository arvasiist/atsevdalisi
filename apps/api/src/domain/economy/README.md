# domain/economy

Cüzdan işlemleri (brief §53 "negatif para oluşmamalı", "satın alma atomik olmalı").

- `wallet.ts` — `canAfford`, `debit`, `credit`, `transfer` (saf fonksiyonlar,
  hiçbiri girdi nesnesini değiştirmez).
- `errors.ts` — `InsufficientFundsError`, `InvalidAmountError`.

Testler: `apps/api/test/domain/economy/wallet.spec.ts`.
