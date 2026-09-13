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
kullanımı At Pazarı satın alma akışıydı (`domain/market/market.ts`
`purchaseListing`) — bu, projenin PARA değiştiren İLK ÇOK-taraflı (iki
OYUNCU arasında) akışıdır, önceki altı para/mülkiyet-değiştiren
use-case'in hepsi TEK oyuncunun kendi bakiyesini değiştiriyordu.

**GÜNCELLEME (AUDIT_AND_HARDENING Öncelik 1, bu oturum) — yukarıdaki
paragraf ARTIK KISMEN GEÇERSİZ:** `BuyMarketListingUseCase` eskiden
`PlayerRepository.updateTwoWithLock`'ı DOĞRUDAN kullanıyordu (ayrı,
kilitsiz bir `market_listings`/`horses` güncellemesiyle birlikte —
`docs/SECURITY.md` §5'in eski "bilinçli kabul edilmiş risk" notu). Bu
KAPATILDI: satın alma artık `PlayerRepository`'yi HİÇ kullanmaz, bunun
yerine `market_listings`+`horses`+iki `players` satırını TEK bir
transaction'da kilitleyen YENİ, dedike bir `MarketPurchaseRepository`
(`apps/api/src/infrastructure/market/postgres-market-purchase.repository.ts`)
kullanır — bkz. `docs/ROADMAP.md` AUDIT_AND_HARDENING bölümü, Öncelik 1.
`transfer`'in KENDİSİ (bu dosyadaki saf fonksiyon) DEĞİŞMEDİ, sadece onu
ÇAĞIRAN kod (artık `domain/market/market.ts` `purchaseListing`, o yeni
repository tarafından çağrılıyor) transaction sınırları değişti.

**Wiring (AUDIT_AND_HARDENING Öncelik 2, bu oturum) — Economy Ledger:**
`debit`/`credit`/`transfer`'i ÇAĞIRAN her use-case artık AYNI zamanda
kalıcı bir `economy_transactions` satırı (migration 0019) yazar — bkz.
`docs/SECURITY.md` §12. Bu dosyadaki saf fonksiyonların KENDİSİ ledger'dan
HABERSİZDİR (bilinçli — Domain katmanı bir "yazma" yan etkisi İÇERMEZ,
ledger satırları çağıran Infrastructure kodunda oluşturulur).
