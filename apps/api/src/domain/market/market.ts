/**
 * At Pazarı (Market) — brief §30, docs/ALGORITHMS.md §11 (MarketValue),
 * database/migrations/0007_create_market_listings.
 *
 * Fonksiyonlar saftır; DB/zaman erişimi yoktur. `id` (UUID) üretimi ve
 * benzersizlik kontrolü application/infrastructure katmanının
 * sorumluluğundadır (bkz. `domain/player/player.ts` ile aynı desen).
 */

import { transfer, type WalletBalance } from '../economy/wallet';
import type { EconomyConfig } from '@at-sevdalisi/game-config';
import type { ListingType, MarketListing } from '@at-sevdalisi/shared-types';
import {
  CannotBuyOwnListingError,
  InvalidListingExpiryError,
  InvalidListingPriceError,
  ListingExpiredError,
  ListingNotActiveError,
} from './errors';
import { MAX_LISTING_EXPIRY_HOURS, MIN_LISTING_EXPIRY_HOURS } from './validation';

/** Bir ilanın "değer puanı"nı (0-100 civarı) gerçek paraya çevirmeden önceki girdileri. */
export interface MarketValueInput {
  quality: number; // horse.quality, 0-100 (brief §8.1)
  potential: number; // horse.potential, 0-100 (brief §8.2)
  /** domain/horse/age-curve.ts `getGrowthFactor` sonucu (~0.5-1.0). */
  ageGrowthFactor: number;
  /**
   * Yarış geçmişi henüz yoksa (yeni/hiç yarışmamış at) `null` geçilir —
   * bu durumda nötr bir varsayılan puan kullanılır (brief'in "form" alanı
   * için de kullandığı, bu projede zaten yerleşik nötr-varsayılan deseni).
   */
  raceHistory: { racesRun: number; wins: number } | null;
  /**
   * Soy ağacındaki bilinen ebeveyn/atalar üzerinden türetilen bir kalite
   * puanı (0-100). Bilinmiyorsa (soy kaydı eksik/gizli) `null` — nötr
   * varsayılan kullanılır.
   */
  pedigreeQualityScore: number | null;
  health: number; // horse.health, 0-100
}

/** brief'te ayrıca tanımlanmamış alanlar için proje-içi nötr varsayılan (bkz. RaceEntrantSnapshot.form deseni). */
const NEUTRAL_SCORE = 50;

/**
 * MarketValue = Σ(bileşen × ağırlık) × baseMarketValueMultiplier × demandFactor.
 *
 * Not: brief'teki pseudocode bileşenleri "×" ile zincirler, ancak
 * `economy.config.json`'daki `marketValueWeights` toplamı tam 1.0'dır
 * (0.30+0.25+0.15+0.15+0.10+0.05) — bu, domain/race/base-ability.ts'teki
 * BaseAbility ile birebir aynı "ağırlıklı toplam" modelini işaret eder.
 * `DemandFactor`, ağırlıklar nesnesinde YOKTUR (brief §30 son cümle: gerçek
 * fiyat arz/talep ile ayrıca, dinamik olarak değişir) — bu yüzden statik
 * ağırlıklı puana values sonradan çarpılan ayrı bir parametre olarak
 * modellenmiştir; verilmezse etkisizdir (1.0).
 */
export function calculateMarketValue(
  input: MarketValueInput,
  economyConfig: EconomyConfig,
  demandFactor = 1,
): number {
  const weights = economyConfig.marketValueWeights;

  const ageFactorScore = clampScore(input.ageGrowthFactor * 100);
  const raceHistoryScore =
    input.raceHistory && input.raceHistory.racesRun > 0
      ? clampScore((input.raceHistory.wins / input.raceHistory.racesRun) * 100)
      : NEUTRAL_SCORE;
  const pedigreeScore = input.pedigreeQualityScore ?? NEUTRAL_SCORE;

  const baseScore =
    input.quality * weights.quality +
    input.potential * weights.potential +
    ageFactorScore * weights.ageFactor +
    raceHistoryScore * weights.raceHistory +
    pedigreeScore * weights.pedigreeValue +
    input.health * weights.health;

  return Math.round(baseScore * economyConfig.baseMarketValueMultiplier * demandFactor);
}

function clampScore(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

export interface CreateListingInput {
  id: string;
  sellerId: string;
  horseId: string;
  price: number;
  listingType: ListingType;
  now?: Date;
  /** Belirtilmezse ilan süresiz (`expiresAt: null`) olur. */
  expiresInHours?: number;
}

/** Yeni bir at pazarı ilanı oluşturur (brief §30). */
export function createListingDraft(input: CreateListingInput): MarketListing {
  if (!Number.isFinite(input.price) || input.price < 0 || !Number.isInteger(input.price)) {
    throw new InvalidListingPriceError(input.price);
  }
  if (
    input.expiresInHours !== undefined &&
    (!Number.isInteger(input.expiresInHours) ||
      input.expiresInHours < MIN_LISTING_EXPIRY_HOURS ||
      input.expiresInHours > MAX_LISTING_EXPIRY_HOURS)
  ) {
    throw new InvalidListingExpiryError(input.expiresInHours);
  }

  const now = input.now ?? new Date();
  const expiresAt =
    input.expiresInHours !== undefined
      ? new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1000).toISOString()
      : null;

  return {
    id: input.id,
    sellerId: input.sellerId,
    horseId: input.horseId,
    price: input.price,
    listingType: input.listingType,
    status: 'active',
    createdAt: now.toISOString(),
    expiresAt,
  };
}

/** İlanın süresinin dolup dolmadığını kontrol eder. */
export function isListingExpired(listing: MarketListing, now: Date = new Date()): boolean {
  if (listing.expiresAt === null) {
    return false;
  }
  return now.getTime() >= new Date(listing.expiresAt).getTime();
}

export interface PurchaseListingResult {
  listing: MarketListing;
  buyerBalance: WalletBalance;
  sellerBalance: WalletBalance;
}

/**
 * Bir ilanı satın alır: parayı alıcıdan düşer, satıcıya ekler (tek bir
 * `transfer` çağrısıyla, brief §31 "Ekonomi backend tarafından authoritative
 * tutulmalıdır") ve ilanı `sold` durumuna geçirir. Application katmanı bu
 * fonksiyonu tek bir DB transaction'ı içinde çalıştırmalı, ardından atın
 * `ownerId`'sini de güncellemelidir (o adım bu domain'in kapsamı dışındadır
 * — bkz. `domain/horse`).
 */
export function purchaseListing(
  listing: MarketListing,
  buyerId: string,
  buyerBalance: WalletBalance,
  sellerBalance: WalletBalance,
  now: Date = new Date(),
): PurchaseListingResult {
  if (listing.sellerId === buyerId) {
    throw new CannotBuyOwnListingError();
  }
  if (listing.status !== 'active') {
    throw new ListingNotActiveError(listing.id, listing.status);
  }
  if (isListingExpired(listing, now)) {
    throw new ListingExpiredError(listing.id);
  }

  const { from: updatedBuyerBalance, to: updatedSellerBalance } = transfer(
    buyerBalance,
    sellerBalance,
    listing.price,
    'money',
  );

  return {
    listing: { ...listing, status: 'sold' },
    buyerBalance: updatedBuyerBalance,
    sellerBalance: updatedSellerBalance,
  };
}

/** Satıcı ilanı geri çeker (brief §30 "Satışlarım" ekranı). */
export function cancelListing(listing: MarketListing): MarketListing {
  if (listing.status !== 'active') {
    throw new ListingNotActiveError(listing.id, listing.status);
  }
  return { ...listing, status: 'cancelled' };
}

/**
 * Süresi dolmuş ama hâlâ `active` görünen ilanları `expired`'a çevirir.
 *
 * FAZ 1 wiring, on üçüncü dilim (bu oturum) — bu SAF fonksiyon FAZ 0'dan
 * beri hazırdı, bu dilimde İLK KEZ gerçekten çağrılıyor:
 * `PostgresMarketListingRepository`'nin TEMBEL (lazy) süpürmesi tarafından
 * (bkz. o dosyanın `sweepExpiredListings` doc yorumu) — projede henüz
 * gerçek bir zamanlanmış görev (cron/scheduler) altyapısı YOK, bu yüzden
 * "her okumadan önce süpür" deseni tercih edildi (KARAR, bkz.
 * docs/ROADMAP.md).
 */
export function expireListingIfNeeded(listing: MarketListing, now: Date = new Date()): MarketListing {
  if (listing.status === 'active' && isListingExpired(listing, now)) {
    return { ...listing, status: 'expired' };
  }
  return listing;
}
