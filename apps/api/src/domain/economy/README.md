# domain/economy

Cüzdan işlemleri (brief §53 "negatif para oluşmamalı", "satın alma atomik olmalı").

- `wallet.ts` — `canAfford`, `debit`, `credit`, `transfer` (saf fonksiyonlar,
  hiçbiri girdi nesnesini değiştirmez).
- `daily-reward.ts` (FAZ 1 wiring, yedinci dilim) — `canClaimDailyReward`/
  `assertCanClaimDailyReward` (brief §37 "GÜNLÜK OYUN DÖNGÜSÜ" Daily
  Reward) — `domain/care/care.ts`'teki `canPerformCareAction` ile AYNI
  kayan-pencere cooldown deseni.
- `errors.ts` — `InsufficientFundsError`, `InvalidAmountError`,
  `DailyRewardAlreadyClaimedError`.

Testler: `apps/api/test/domain/economy/wallet.spec.ts`,
`apps/api/test/domain/economy/daily-reward.spec.ts`.

**Wiring (FAZ 1 wiring, altıncı dilim):** `debit`'in İLK gerçek kullanımı
`apps/api/src/application/use-cases/upgrade-stable.use-case.ts`'tedir
(Ahır Yükseltme). Bu, projenin PARA değiştiren İLK use-case'i olduğu için
docs/SECURITY.md §5'in satır kilitleme (`SELECT ... FOR UPDATE`) kuralı
İLK KEZ burada gerçek anlamda uygulandı — bkz.
`application/ports/player.repository.ts` `updateWithLock` doc yorumu.

**Wiring (FAZ 1 wiring, yedinci dilim):** `credit`'in İLK gerçek kullanımı
`apps/api/src/application/use-cases/claim-daily-reward.use-case.ts`'tedir
(Günlük Ödül, `POST /players/{id}/daily-reward`) — AYNI `updateWithLock`
satır kilitleme deseni burada da kullanılır.

**Wiring (FAZ 1 wiring, on birinci dilim):** `transfer`'in İLK gerçek
kullanımı `apps/api/src/application/use-cases/buy-market-listing.use-case.ts`'tedir
(At Pazarı satın alma, `POST /market/listings/{id}/buy`, bkz.
`domain/market/market.ts` `purchaseListing`) — ama bu kez `updateWithLock`
DEĞİL, YENİ bir `PlayerRepository.updateTwoWithLock` kullanılır: bu,
projenin PARA değiştiren İLK ÇOK-taraflı (iki OYUNCU arasında) use-case'i,
önceki altı para/mülkiyet-değiştiren use-case'in (Ahır Yükseltme, Günlük
Ödül, Pratik Yarış, Ahır Yükseltme'nin Idempotency-Key sertleştirmesi)
hepsi TEK oyuncunun kendi bakiyesini değiştiriyordu.
