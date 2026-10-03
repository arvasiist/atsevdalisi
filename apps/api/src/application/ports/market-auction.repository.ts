import type { MarketListing } from '@at-sevdalisi/shared-types';

/**
 * MÜZAYEDE (02.10.2026) — PARA YOLU. Her işlem tek transaction'dır:
 * ilan `FOR UPDATE` → önde olan teklif → oyuncular (id sırasıyla) `FOR UPDATE`
 * → bakiye + `economy_transactions` satırları AYNI transaction'da.
 */
export interface MarketAuctionRepository {
  /**
   * Teklif verir: teklif verenin parası emanete alınır (`auction_bid_hold`),
   * geçilen önceki lider AYNI transaction'da iade alır (`auction_bid_refund`).
   * Kural (`assertBidAllowed`) KİLİT ALTINDA okunan değerlerle uygulanır.
   */
  placeBid(input: {
    listingId: string;
    bidderId: string;
    amount: number;
    now: Date;
  }): Promise<{ listingId: string; bidderMoney: number }>;

  /** Süresi dolmuş aktif müzayedelerin kimlikleri (en eski önce). */
  findDueAuctionIds(now: Date, limit: number): Promise<string[]>;

  /**
   * Bir müzayedeyi kapatır. Teklif yoksa `expired`. Teklif varsa at alıcıya,
   * emanet satıcıya geçer (`auction_sale_credit`) ve ilan `sold` olur. Satış
   * gerçekleşemiyorsa (at artık satıcının değil / alıcının ahırı dolu / at
   * açık bir yarışta) emanet İADE edilir ve ilan `expired` olur. Henüz
   * bitmemiş ya da zaten kapanmış ilanda hiçbir şey yapmaz (`null`).
   */
  settleAuction(listingId: string, now: Date): Promise<'sold' | 'expired' | null>;

  /** Teklifsiz müzayedeyi iptal eder; teklif varsa `AuctionHasBidsError`. */
  cancelAuction(listingId: string): Promise<MarketListing>;
}

export const MARKET_AUCTION_REPOSITORY = Symbol('MARKET_AUCTION_REPOSITORY');
