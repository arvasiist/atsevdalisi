import type { MarketListing } from '@at-sevdalisi/shared-types';

/**
 * At Pazarı ekran mantığı (02.10.2026) — saf. Sunucu otoritedir: buradaki
 * kararlar yalnızca düğme durumu/metin içindir; en düşük teklif sunucunun
 * döndürdüğü `auction.minimumNextBid`ten okunur, burada yeniden HESAPLANMAZ.
 */

/** Satış süresi seçenekleri (saat) — sunucu sınırı 1-720, burada alt küme. */
export const LISTING_DURATION_HOURS = [1, 6, 24, 72] as const;

export interface ListingActions {
  isMine: boolean;
  isAuction: boolean;
  canBuy: boolean;
  canBid: boolean;
  canCancel: boolean;
  isLeader: boolean;
  /** Teklif kutusunun varsayılanı (müzayedede en düşük geçerli teklif). */
  suggestedBid: number | null;
}

export function listingActions(
  listing: MarketListing,
  playerId: string | null,
  now: Date,
): ListingActions {
  const isMine = playerId !== null && listing.sellerId === playerId;
  const isAuction = listing.listingType === 'auction';
  const open =
    listing.status === 'active' &&
    (listing.expiresAt === null || new Date(listing.expiresAt).getTime() > now.getTime());
  const auction = listing.auction;
  return {
    isMine,
    isAuction,
    canBuy: open && !isAuction && !isMine && playerId !== null,
    canBid: open && isAuction && !isMine && playerId !== null,
    // Teklif almış müzayede iptal edilemez (sunucu 409 `AUCTION_HAS_BIDS`).
    canCancel:
      isMine && listing.status === 'active' && !(isAuction && (auction?.bidCount ?? 0) > 0),
    isLeader: playerId !== null && auction?.leaderId === playerId,
    suggestedBid: isAuction ? (auction?.minimumNextBid ?? listing.price) : null,
  };
}

/** "3 sa 12 dk kaldı" / "bitti" — süresiz ilanda `null`. */
export function formatTimeLeft(expiresAt: string | null, now: Date): string | null {
  if (expiresAt === null) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return 'süre doldu';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} dk kaldı`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} sa ${minutes % 60} dk kaldı`;
  return `${Math.floor(hours / 24)} gün kaldı`;
}

export interface SellForm {
  horseId: string;
  listingType: 'fixed_price' | 'auction';
  price: string;
  /** `''` = süresiz (yalnızca sabit fiyatta). */
  durationHours: string;
}

export type SellBody =
  | {
      ok: true;
      body: {
        horseId: string;
        price: number;
        listingType: 'fixed_price' | 'auction';
        expiresInHours?: number;
      };
    }
  | { ok: false; error: string };

export function buildSellBody(form: SellForm): SellBody {
  if (form.horseId === '') return { ok: false, error: 'Satılacak atı seç.' };
  const price = Number(form.price);
  if (form.price.trim() === '' || !Number.isSafeInteger(price) || price < 0) {
    return { ok: false, error: 'Fiyat sıfır ya da pozitif bir tam sayı olmalı.' };
  }
  if (form.listingType === 'auction' && price < 1) {
    return { ok: false, error: 'Müzayede başlangıç fiyatı en az 1 olmalı.' };
  }
  const hours = form.durationHours === '' ? undefined : Number(form.durationHours);
  if (form.listingType === 'auction' && hours === undefined) {
    return { ok: false, error: 'Müzayede için bitiş süresi seç.' };
  }
  return {
    ok: true,
    body: {
      horseId: form.horseId,
      price,
      listingType: form.listingType,
      ...(hours === undefined ? {} : { expiresInHours: hours }),
    },
  };
}
