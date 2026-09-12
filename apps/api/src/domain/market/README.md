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
