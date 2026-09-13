import type { MarketListing } from '@at-sevdalisi/shared-types';

/** `BuyMarketListingUseCase.execute`'in girdisi. */
export interface ExecuteMarketPurchaseInput {
  listingId: string;
  buyerId: string;
  /** `IdempotencyInterceptor`'ın header'ından — ledger satırında iz olarak tutulur (bkz. migration 0019). */
  idempotencyKey: string | null;
}

export interface ExecuteMarketPurchaseResult {
  listing: MarketListing;
  buyerBalance: { money: number; gems: number };
  sellerBalance: { money: number; gems: number };
}

/**
 * AUDIT_AND_HARDENING Öncelik 1 (EN KRİTİK, bu oturum) — At Pazarı satın
 * alma artık TEK bir port/TEK bir Postgres transaction'ı üzerinden
 * yürütülür. Bunu ne `MarketListingRepository` ne de `PlayerRepository`
 * "sahiplenebilir" — dördü de (`market_listings`, `horses`, İKİ `players`
 * satırı) AYNI transaction'da kilitlenip güncellenmesi gerektiğinden, bu
 * kendi başına, dört aggregate'i kapsayan bir KOORDİNATÖR port'tur
 * (`docs/ARCHITECTURE.md` §4'ün "her aggregate kendi repository'si"
 * idealinden BİLİNÇLİ bir sapma — tıpkı `RaceRepository.savePvpMatch`'in
 * races+race_entries+race_entry_segments+pvp_matches'i TEK metodda
 * kapsaması gibi, ama BURADA dört FARKLI aggregate söz konusu olduğu için
 * ayrı, adanmış bir port daha DOĞRU/okunabilir).
 *
 * ESKİ TASARIM (BuyMarketListingUseCase'in önceki hali, artık KULLANILMIYOR):
 * `PlayerRepository.updateTwoWithLock` (yalnızca İKİ `players` satırını
 * kilitler) + AYRI, kilitlenmemiş `horseRepository.update`/`marketListing
 * Repository.update` çağrıları — bkz. docs/SECURITY.md §5'in "bilinçli
 * kabul edilmiş risk" notu (artık GEÇERSİZ, bu port o riski KAPATIR).
 *
 * Domain hataları (`ListingNotFoundError`, `CannotBuyOwnListingError`,
 * `ListingNotActiveError`, `ListingExpiredError`, `InsufficientFundsError`,
 * `HorseNotFoundError`, `PlayerNotFoundError`) implementasyon tarafından,
 * transaction ROLLBACK olduktan SONRA, `domain/market/market.ts`'teki
 * `purchaseListing`'in fırlattığı AYNI sınıflarla fırlatılır — HTTP
 * eşlemesi (`http-exception.filter.ts`) hiç DEĞİŞMEDİ.
 */
export interface MarketPurchaseRepository {
  executePurchase(input: ExecuteMarketPurchaseInput): Promise<ExecuteMarketPurchaseResult>;
}

/** NestJS DI için token. */
export const MARKET_PURCHASE_REPOSITORY = Symbol('MARKET_PURCHASE_REPOSITORY');
