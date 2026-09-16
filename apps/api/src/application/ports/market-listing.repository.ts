import type { ListingStatus, MarketListing, PaginatedResult } from '@at-sevdalisi/shared-types';

/**
 * `GET /market/listings` (tarama/browse) için arama filtresi —
 * `MarketController`'da doğrulanır (bkz. `ListMarketListingsUseCase`
 * doc yorumu). `status` burada ZORUNLUDUR: controller, sorgu parametresi
 * verilmezse `'active'` varsayılanını UYGULAR (bkz. o dosyanın yorumu) —
 * bu yüzden port katmanına "varsayılan davranış" belirsizliği hiç sızmaz.
 */
export interface MarketListingSearchFilter {
  status: ListingStatus;
  /** Verilirse yalnızca `price >= minPrice` olan ilanlar döner. */
  minPrice?: number;
  /** Verilirse yalnızca `price <= maxPrice` olan ilanlar döner. */
  maxPrice?: number;
  /** 1-tabanlı sayfa numarası. */
  page: number;
  pageSize: number;
}

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
/**
 * SÖZLEŞME NOTU (FAZ 1 wiring, on üçüncü dilim, bu oturum): her okuma
 * metodu (`findById`/`findActiveByHorseId`/`search`/`findBySellerId`),
 * dönmeden ÖNCE süresi dolmuş `active` ilanları `expired`'a çevirmelidir
 * (bkz. `domain/market/market.ts` `expireListingIfNeeded`) — projede
 * henüz bir zamanlanmış görev (cron) altyapısı olmadığından, bu iş
 * her implementasyonun (şu an TEK implementasyon: `PostgresMarketListing
 * Repository`) kendi sorumluluğundadır. Bkz. o dosyanın `sweepExpiredListings`
 * doc yorumu.
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
  /**
   * FAZ 1 wiring, on ikinci dilim — At Pazarı'nın tarama (browse) ekranı.
   * docs/API.md §1.4'te FAZ 0'dan beri belgelenmiş ama HİÇBİR endpoint'te
   * kullanılmamış sayfalama zarfının (`PaginationMeta`/`PaginatedResult`,
   * `packages/shared-types/src/common.ts`) İLK gerçek kullanıcısı.
   * `createdAt DESC` sıralı döner (en yeni ilan önce).
   */
  search(filter: MarketListingSearchFilter): Promise<PaginatedResult<MarketListing>>;
  /**
   * Bir satıcının ilanlarını döner — "İlanlarım" ekranı. `status`
   * verilmezse TÜM durumlardaki ilanlar döner (aktif/satılmış/iptal/
   * süresi dolmuş); verilirse yalnızca o durumdakiler. `HorseRepository.
   * findByOwnerId` ile AYNI desen: sayfalama YOK — tek bir oyuncunun ilan
   * sayısı doğası gereği sınırlıdır, `search`'ün aksine dış dünyaya açık,
   * potansiyel olarak büyük bir koleksiyon değildir. `createdAt DESC`
   * sıralı döner.
   */
  findBySellerId(sellerId: string, status?: ListingStatus): Promise<MarketListing[]>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const MARKET_LISTING_REPOSITORY = Symbol('MARKET_LISTING_REPOSITORY');
