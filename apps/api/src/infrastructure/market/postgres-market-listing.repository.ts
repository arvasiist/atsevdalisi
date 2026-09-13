import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ListingStatus, ListingType, MarketListing } from '@at-sevdalisi/shared-types';
import type { MarketListingRepository } from '../../application/ports/market-listing.repository';
import { PG_POOL } from '../database/database.module';

/**
 * `market_listings` tablosunun satır şekli (snake_case, `database/migrations/
 * 0007_create_market_listings.up.sql`). `price` PostgreSQL'de BIGINT'tir —
 * `node-postgres` bunu (hassasiyet kaybını önlemek için) STRING döner
 * (bkz. `postgres-player.repository.ts` üstündeki AYNI not); `Number(...)`'a
 * çevrilir.
 */
interface MarketListingRow {
  id: string;
  seller_id: string;
  horse_id: string;
  price: string;
  listing_type: string;
  status: string;
  created_at: Date;
  expires_at: Date | null;
}

function rowToListing(row: MarketListingRow): MarketListing {
  return {
    id: row.id,
    sellerId: row.seller_id,
    horseId: row.horse_id,
    price: Number(row.price),
    listingType: row.listing_type as ListingType,
    status: row.status as ListingStatus,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
  };
}

@Injectable()
export class PostgresMarketListingRepository implements MarketListingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<MarketListing | null> {
    const result = await this.pool.query<MarketListingRow>('SELECT * FROM market_listings WHERE id = $1 LIMIT 1', [
      id,
    ]);
    return result.rows[0] ? rowToListing(result.rows[0]) : null;
  }

  async findActiveByHorseId(horseId: string): Promise<MarketListing | null> {
    const result = await this.pool.query<MarketListingRow>(
      "SELECT * FROM market_listings WHERE horse_id = $1 AND status = 'active' LIMIT 1",
      [horseId],
    );
    return result.rows[0] ? rowToListing(result.rows[0]) : null;
  }

  async save(listing: MarketListing): Promise<void> {
    await this.pool.query(
      `INSERT INTO market_listings (id, seller_id, horse_id, price, listing_type, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        listing.id,
        listing.sellerId,
        listing.horseId,
        listing.price,
        listing.listingType,
        listing.status,
        new Date(listing.createdAt),
        listing.expiresAt ? new Date(listing.expiresAt) : null,
      ],
    );
  }

  async update(listing: MarketListing): Promise<void> {
    await this.pool.query(
      `UPDATE market_listings
       SET seller_id = $2, horse_id = $3, price = $4, listing_type = $5, status = $6, expires_at = $7
       WHERE id = $1`,
      [
        listing.id,
        listing.sellerId,
        listing.horseId,
        listing.price,
        listing.listingType,
        listing.status,
        listing.expiresAt ? new Date(listing.expiresAt) : null,
      ],
    );
  }
}
