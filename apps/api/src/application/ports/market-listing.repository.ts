import type { MarketListing } from '@at-sevdalisi/shared-types';

/**
 * `MarketListingRepository` — Application katmanının Infrastructure'a
 * bağlandığı PORT (interface), bkz. `application/ports/player.repository.ts`
 * ile AYNI desen (docs/ARCHITECTURE.md §4).
 *
 * FAZ 1 wiring, on birinci dilim — At Pazarı (brief §30). Domain katmanı
 * (`domain/market/market.ts`) zaten FAZ 0'dan beri TAMAMEN hazırdı
 * (`createListingDraft`/`purchaseListing`/`cancelListing`); bu port,
 * onu gerçek veritabanına bağlayan İLK parçadır.
 */
export interface MarketListingRepository {
  findById(id: string): Promise<MarketListing | null>;
  /**
   * Bir atın (varsa) `active` durumdaki ilanını döner — `null` ise at
   * şu anda satışta değildir. `CreateMarketListingUseCase`'in "bir atın
   * aynı anda yalnızca tek bir aktif ilanı olabilir" kuralını uygulamak
   * için kullanılır (bkz. `domain/market/errors.ts` `HorseAlreadyListedError`).
   */
  findActiveByHorseId(horseId: string): Promise<MarketListing | null>;
  /** Yeni bir ilan ekler. Var olan bir `id`'yi GÜNCELLEMEZ. */
  save(listing: MarketListing): Promise<void>;
  /**
   * Var olan bir ilanın DURUMUNU günceller (`active` → `sold`/`cancelled`/
   * `expired`) — `domain/market/market.ts`'teki `purchaseListing`/
   * `cancelListing`/`expireListingIfNeeded`'in DÖNDÜRDÜĞÜ güncellenmiş
   * `MarketListing` nesnesini olduğu gibi yazar (`price`/`sellerId`/
   * `horseId` gibi DEĞİŞMEYEN alanlar da dahil, `HorseRepository.update`
   * ile AYNI "tüm değişken alanları yaz" felsefesi).
   */
  update(listing: MarketListing): Promise<void>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const MARKET_LISTING_REPOSITORY = Symbol('MARKET_LISTING_REPOSITORY');
