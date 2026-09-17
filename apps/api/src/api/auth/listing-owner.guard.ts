import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  MARKET_LISTING_REPOSITORY,
  type MarketListingRepository,
} from '../../application/ports/market-listing.repository';
import { ForbiddenError } from '../../domain/auth/errors';
import { ListingNotFoundError } from '../../domain/market/errors';
import type { AuthenticatedRequest } from './current-player.decorator';

/**
 * AUDIT_REPORT.md Bulgu S4 hardening (bu oturum) — yalnızca
 * `DELETE /market/listings/:id` (ilan iptali) tarafından kullanılır.
 * `HorseOwnerGuard` ile AYNI gerekçe, ama tek bir sabit kullanım şekli
 * (her zaman route param `:id`) olduğundan `HorseOwnerGuard`'ın AKSİNE
 * parametrik bir `mixin()` GEREKMEZ.
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: bağımlılık açık `@Inject()`
 * ile enjekte edilir.
 *
 * NOT — `HorseOwnerGuard`'daki (bkz. o dosyanın doc yorumu) AYNI kök
 * nedenli format-doğrulama açığı burada da vardı: eksik/hatalı biçimli
 * bir `listingId` bu guard'ın KENDİ `isUUID()` kontrolü OLMADAN doğrudan
 * `marketListingRepository.findById(...)`'e ulaşıp ham bir Postgres tip
 * hatasıyla 500'e dönüşürdü — aynı düzeltme burada da uygulanır.
 */
@Injectable()
export class ListingOwnerGuard implements CanActivate {
  constructor(
    @Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const listingId = (request.params as Record<string, string>).id;
    if (typeof listingId !== 'string' || listingId.length === 0 || !isUUID(listingId)) {
      return true;
    }

    const listing = await this.marketListingRepository.findById(listingId);
    if (!listing) {
      throw new ListingNotFoundError(listingId);
    }
    if (!request.player || listing.sellerId !== request.player.id) {
      throw new ForbiddenError('Bu ilan size ait değil.');
    }
    return true;
  }
}
