import { Inject, Injectable } from '@nestjs/common';
import type { MarketListing } from '@at-sevdalisi/shared-types';
import { MARKET_PURCHASE_REPOSITORY, type MarketPurchaseRepository } from '../ports/market-purchase.repository';

export interface BuyMarketListingResult {
  listing: MarketListing;
  buyerBalance: { money: number; gems: number };
  sellerBalance: { money: number; gems: number };
}

/**
 * `POST /market/listings/{id}/buy` (docs/API.md §5, brief §30/§31) —
 * `Idempotency-Key` ZORUNLU (bkz. `api/market/market.controller.ts`).
 *
 * AUDIT_AND_HARDENING Öncelik 1 (EN KRİTİK, bu oturum) — bu use-case
 * yeniden yazıldı. ÖNCEKİ tasarım (on birinci dilim), para transferini
 * (`PlayerRepository.updateTwoWithLock`, YALNIZCA iki `players` satırını
 * kilitler) atın sahiplik değişikliğinden ve ilanın `sold` durumuna
 * geçirilmesinden AYRI, kilitlenmemiş iki adımda yapıyordu — bu, iki farklı
 * alıcının TAM OLARAK aynı anda `buy` çağırmasında (teorik olarak) ikisinin
 * de parasının çekilebilmesine izin veren, docs/SECURITY.md §5'te BİLİNÇLİ
 * kabul edilmiş bir risk olarak belgelenmişti.
 *
 * YENİ tasarım: TÜM işlem (`market_listings` + `horses` + İKİ `players`
 * satırının kilitlenmesi, doğrulama, para transferi, mülkiyet devri, ilanı
 * `sold`'a geçirme, ledger kaydı) TEK bir Postgres transaction'ında,
 * `MarketPurchaseRepository.executePurchase` içinde yürütülür (bkz. o
 * port'un doc yorumu) — "ya hepsi ya hiçbiri" artık GERÇEKTEN garantidir,
 * eşzamanlı iki satın alma isteğinden yalnızca BİRİ başarılı olur, diğeri
 * `ListingNotActiveError` (409) alır (bkz. `market-purchase.repository.spec`
 * kapsamındaki eşzamanlılık testi, `market.e2e-spec.ts`).
 *
 * Domain hataları (`ListingNotFoundError`, `CannotBuyOwnListingError`,
 * `ListingNotActiveError`, `ListingExpiredError`, `InsufficientFundsError`,
 * `HorseNotFoundError`, `PlayerNotFoundError`) DEĞİŞMEDİ — yalnızca NEREDE
 * fırlatıldıkları değişti (artık Infrastructure katmanında, transaction
 * İÇİNDE); HTTP eşlemesi (`http-exception.filter.ts`) hiç DOKUNULMADI.
 */
@Injectable()
export class BuyMarketListingUseCase {
  constructor(@Inject(MARKET_PURCHASE_REPOSITORY) private readonly marketPurchaseRepository: MarketPurchaseRepository) {}

  async execute(listingId: string, buyerId: string, idempotencyKey: string | null = null): Promise<BuyMarketListingResult> {
    return this.marketPurchaseRepository.executePurchase({ listingId, buyerId, idempotencyKey });
  }
}
