# domain/market

At Pazarı (brief §30, docs/ALGORITHMS.md §11 MarketValue).

- `market.ts` — `calculateMarketValue` (ağırlıklı puan × `baseMarketValueMultiplier`
  × isteğe bağlı `demandFactor`), `createListingDraft`, `isListingExpired`,
  `purchaseListing` (wallet `transfer` ile authoritative para transferi),
  `cancelListing`, `expireListingIfNeeded`.
- `errors.ts` — `InvalidListingPriceError`, `ListingNotActiveError`,
  `ListingExpiredError`, `CannotBuyOwnListingError`.

Config: `economy.config.json` → `marketValueWeights` + `baseMarketValueMultiplier`.

**Kapsam dışı:** Açık artırma (`auction` listingType şemada var ama teklif
verme/kazanma mantığı burada yok — sadece `fixed_price` akışı uygulanmıştır);
gerçek arz/talep (`demandFactor`) hesaplaması bir application-layer/analytics
sorumluluğudur, burada parametre olarak kabul edilir.

Testler: `apps/api/test/domain/market/market.spec.ts`.

## FAZ 1 wiring, on birinci dilim — gerçek veritabanına bağlanma (bu oturum)

Bu dosyadaki fonksiyonların HİÇBİRİ FAZ 0'dan bu yana değişmedi — bu
dilim onları gerçek `HorseRepository`/`PlayerRepository`/YENİ
`MarketListingRepository`'ye bağlayan orkestrasyondur (bkz.
`application/use-cases/{create,buy,cancel,get}-market-listing.use-case.ts`,
`api/market/`). `purchaseListing`'in çağırdığı `wallet.transfer`
(`domain/economy/wallet.ts`) BURADA İLK KEZ gerçek kullanıcısına
kavuşuyor — bkz. `domain/economy/README.md`.

`ListingNotFoundError`/`HorseAlreadyListedError` (YENİ, `errors.ts`)
domain katmanına ait olsa da hiçbir SAF fonksiyon tarafından
fırlatılmaz — application katmanının repository `null` döndürdüğünde
(veya "bu ata zaten aktif bir ilan var" iş kuralını uyguladığında)
fırlattığı hatalardır (`PlayerNotFoundError`/`HorseNotFoundError` ile
AYNI kategori).

## FAZ 1 wiring, on ikinci dilim — tarama + "İlanlarım" (bu oturum)

Bu dosyada YİNE hiçbir değişiklik yok — `GET /market/listings` (tarama)
ve `GET /market/my-listings` salt-okunur uç noktaları, SAF domain
fonksiyonu ÇAĞIRMAZ (girdi doğrulaması `MarketController`'da, sonuç
doğrudan `MarketListingRepository.search`/`findBySellerId`'den gelir —
bkz. `application/ports/market-listing.repository.ts`). `docs/API.md`
§1.4'te FAZ 0'dan beri belgelenmiş sayfalama zarfının İLK gerçek
kullanıcısı `search`'tür.

## FAZ 1 wiring, on üçüncü dilim — ilan süresi dolma (expiry) (bu oturum)

İKİ değişiklik: (1) `createListingDraft` artık `expiresInHours`'ı
gerçekten DOĞRULUYOR (`InvalidListingExpiryError`, YENİ — sınırlar
`validation.ts`'te); FAZ 0'dan beri parametre kabul ediyordu ama hiçbir
çağıran onu göndermiyordu, bu yüzden bu dal hiç ÇALIŞMAMIŞTI. (2)
`expireListingIfNeeded` (FAZ 0'dan beri hazır SAF fonksiyon) BURADA İLK
KEZ gerçekten ÇAĞRILIYOR — `infrastructure/market/postgres-market-listing.
repository.ts`'in TEMBEL süpürmesi tarafından (bkz. o dosyanın doc
yorumu; projede henüz bir zamanlanmış görev/cron altyapısı olmadığından
tercih edilen KARAR). Bu dosyadaki fonksiyonların KENDİSİ yine hiç
değişmedi — sadece artık gerçekten kullanılıyorlar.
