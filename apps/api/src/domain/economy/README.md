# domain/economy

Cüzdan işlemleri (brief §53 "negatif para oluşmamalı", "satın alma atomik olmalı").

- `wallet.ts` — `canAfford`, `debit`, `credit`, `transfer` (saf fonksiyonlar,
  hiçbiri girdi nesnesini değiştirmez).
- `errors.ts` — `InsufficientFundsError`, `InvalidAmountError`.

Testler: `apps/api/test/domain/economy/wallet.spec.ts`.

**Wiring (FAZ 1 wiring, altıncı dilim):** `debit`'in İLK gerçek kullanımı
`apps/api/src/application/use-cases/upgrade-stable.use-case.ts`'tedir
(Ahır Yükseltme). Bu, projenin PARA değiştiren İLK use-case'i olduğu için
docs/SECURITY.md §5'in satır kilitleme (`SELECT ... FOR UPDATE`) kuralı
İLK KEZ burada gerçek anlamda uygulandı — bkz.
`application/ports/player.repository.ts` `updateWithLock` doc yorumu.
`credit`/`transfer` henüz WIRING EDİLMEDİ (yarış ödülü/at pazarı satışı
gibi gelecekteki dilimleri bekliyor).
