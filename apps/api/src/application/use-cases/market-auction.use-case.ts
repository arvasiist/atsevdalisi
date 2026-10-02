import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PlaceBidResult } from '@at-sevdalisi/shared-types';
import { ListingNotFoundError } from '../../domain/market/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import {
  MARKET_AUCTION_REPOSITORY,
  type MarketAuctionRepository,
} from '../ports/market-auction.repository';
import {
  MARKET_LISTING_REPOSITORY,
  type MarketListingRepository,
} from '../ports/market-listing.repository';

export interface SettleDueAuctionsResult {
  sold: number;
  expired: number;
}

/**
 * MÜZAYEDE (02.10.2026) — teklif verme ve süresi dolanları kapatma.
 *
 * Tekrar koruması `Idempotency-Key` DEĞİL, kuralın kendisidir: aynı teklifin
 * ikinci gönderimi artık kendi teklifinin altında kalır ve `BID_TOO_LOW` ile
 * düşer — ikinci bir emanet ALINAMAZ.
 */
@Injectable()
export class MarketAuctionUseCase {
  constructor(
    @Inject(MARKET_AUCTION_REPOSITORY) private readonly auctions: MarketAuctionRepository,
    @Inject(MARKET_LISTING_REPOSITORY) private readonly listings: MarketListingRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async placeBid(
    listingId: string,
    bidderId: string,
    rawAmount: unknown,
    now = new Date(),
  ): Promise<PlaceBidResult> {
    if (typeof rawAmount !== 'number' || !Number.isSafeInteger(rawAmount) || rawAmount <= 0) {
      throw new BadRequestException('amount pozitif bir tam sayı olmalıdır.');
    }
    const { bidderMoney } = await this.auctions.placeBid({
      listingId,
      bidderId,
      amount: rawAmount,
      now,
    });
    const listing = await this.listings.findById(listingId);
    if (listing === null) {
      throw new ListingNotFoundError(listingId);
    }
    return { listing, bidderMoney };
  }

  async settleDue(now = new Date()): Promise<SettleDueAuctionsResult> {
    const ids = await this.auctions.findDueAuctionIds(
      now,
      this.config.economy.auction.settleScheduler.batchSize,
    );
    const result: SettleDueAuctionsResult = { sold: 0, expired: 0 };
    for (const id of ids) {
      const outcome = await this.auctions.settleAuction(id, now);
      if (outcome !== null) result[outcome] += 1;
    }
    return result;
  }
}
