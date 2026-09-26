import type { ISODateTimeString, UUID } from './common';

/** brief §7 MarketListing, §30 */
export type ListingType = 'fixed_price' | 'auction';
export type ListingStatus = 'active' | 'sold' | 'expired' | 'cancelled';

export interface MarketListing {
  id: UUID;
  sellerId: UUID;
  horseId: UUID;
  price: number;
  listingType: ListingType;
  status: ListingStatus;
  createdAt: ISODateTimeString;
  expiresAt: ISODateTimeString | null;
}

/**
 * `GET /horses/:id/market-value` (bu turda EKLENDİ) — brief §30'un
 * `MarketValue` formülü (`domain/market/market.ts` `calculateMarketValue`,
 * ZATEN yazılmıştı ama HİÇBİR yerden ÇAĞRILMIYORDU — bkz.
 * `docs/AUDIT_REPORT.md`'nin "§25 Stable görsel yönetim ekranı" bulgusunun
 * "piyasa değeri tahmini ... ayrı dilim" notu) artık burada gerçek bir
 * uç noktaya bağlanır. Yalnızca TÜRETİLMİŞ tek bir sayı taşır — atın
 * gizli `potential` alanı (bkz. `PublicHorse.potentialEstimate`'in doc
 * yorumu) veya `quality` gibi ham girdiler BURADAN SIZDIRILMAZ.
 */
export interface HorseMarketValueView {
  horseId: UUID;
  estimatedValue: number;
}
