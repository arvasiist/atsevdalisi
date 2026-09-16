import { Inject, Injectable } from '@nestjs/common';
import type { MarketListing } from '@at-sevdalisi/shared-types';
import { cancelListing } from '../../domain/market/market';
import { ListingNotFoundError } from '../../domain/market/errors';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';

/**
 * `DELETE /market/listings/{id}` (docs/API.md §5, brief §30 "Satışlarım").
 *
 * FAZ 1 wiring, on birinci dilim — `domain/market/market.ts`'teki
 * `cancelListing` (FAZ 0'dan beri hazır, saf) burada İLK KEZ gerçekten
 * çağrılır. `ListingNotActiveError` fırlatırsa (zaten satılmış/süresi
 * dolmuş/iptal edilmiş) `http-exception.filter.ts` bunu `409`'a eşler.
 *
 * BİLİNÇLİ SINIRLAMA (bu dilim): yetkilendirme (yalnızca ilanın SAHİBİ
 * kendi ilanını iptal edebilmeli) YOK — bu projede HENÜZ hiçbir uç
 * noktada gerçek bir kimlik doğrulama/oturum sistemi yok (bkz.
 * docs/ROADMAP.md "Açık kararlar" madde 1 — Google/Apple Sign-In
 * KARARI verildi ama canlıya alınana kadar UYGULANMADI); bu, projenin
 * TÜMÜNDE zaten var olan bir boşluktur, bu dilime ÖZGÜ değildir — burada
 * ayrıca bir kısmi/geçici yetkilendirme icat EDİLMEDİ.
 */
@Injectable()
export class CancelMarketListingUseCase {
  constructor(@Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository) {}

  async execute(listingId: string): Promise<MarketListing> {
    const listing = await this.marketListingRepository.findById(listingId);
    if (listing === null) {
      throw new ListingNotFoundError(listingId);
    }

    const cancelled = cancelListing(listing);
    await this.marketListingRepository.update(cancelled);

    return cancelled;
  }
}
