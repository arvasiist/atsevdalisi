import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ListingStatus, ListingType, MarketListing, PaginatedResult } from '@at-sevdalisi/shared-types';
import type { MarketListingRepository, MarketListingSearchFilter } from '../../application/ports/market-listing.repository';
import { expireListingIfNeeded } from '../../domain/market/market';
import { HorseAlreadyListedError, ListingNotActiveError } from '../../domain/market/errors';
import { PG_POOL } from '../database/database.module';

const POSTGRES_UNIQUE_VIOLATION = '23505';
const ONE_ACTIVE_LISTING_PER_HORSE_INDEX = 'idx_market_listings_one_active_per_horse';

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

  private async sweepExpiredListings(): Promise<void> {
    const dueResult = await this.pool.query<MarketListingRow>(
      "SELECT * FROM market_listings WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()",
    );
    if (dueResult.rows.length === 0) {
      return;
    }
    const now = new Date();
    for (const row of dueResult.rows) {
      const listing = rowToListing(row);
      const expired = expireListingIfNeeded(listing, now);
      if (expired.status !== listing.status) {
        await this.update(expired);
      }
    }
  }

  async findById(id: string): Promise<MarketListing | null> {
    await this.sweepExpiredListings();
    const result = await this.pool.query<MarketListingRow>('SELECT * FROM market_listings WHERE id = $1 LIMIT 1', [
      id,
    ]);
    const row = result.rows[0];
    return row ? rowToListing(row) : null;
  }

  async findActiveByHorseId(horseId: string): Promise<MarketListing | null> {
    await this.sweepExpiredListings();
    const result = await this.pool.query<MarketListingRow>(
      "SELECT * FROM market_listings WHERE horse_id = $1 AND status = 'active' LIMIT 1",
      [horseId],
    );
    const row = result.rows[0];
    return row ? rowToListing(row) : null;
  }

  async save(listing: MarketListing): Promise<void> {
    try {
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
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION &&
        'constraint' in error &&
        (error as { constraint?: string }).constraint === ONE_ACTIVE_LISTING_PER_HORSE_INDEX
      ) {
        throw new HorseAlreadyListedError(listing.horseId);
      }
      throw error;
    }
  }

  /**
   * E2 DÜZELTMESİ:
   * İptal veya satış güncellemelerinde race condition'ı önler.
   * Eğer listing 'cancelled' yapılmak isteniyorsa, yalnızca durumu o anda 'active' olan satırı günceller.
   * Satır güncellenemezse (0 satır) ilanın güncel durumunu kontrol edip ListingNotActiveError fırlatır.
   */
  async update(listing: MarketListing): Promise<void> {
    if (listing.status === 'cancelled') {
      const result = await this.pool.query(
        `UPDATE market_listings
         SET seller_id = $2, horse_id = $3, price = $4, listing_type = $5, status = $6, expires_at = $7
         WHERE id = $1 AND status = 'active'`,
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

      if (result.rowCount === 0) {
        const current = await this.pool.query<MarketListingRow>(
          'SELECT status FROM market_listings WHERE id = $1 LIMIT 1',
          [listing.id],
        );
        const currentStatus = current.rows[0]?.status ?? 'unknown';
        throw new ListingNotActiveError(listing.id, currentStatus);
      }
      return;
    }

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

  async search(filter: MarketListingSearchFilter): Promise<PaginatedResult<MarketListing>> {
    await this.sweepExpiredListings();
    const conditions: string[] = ['status = $1'];
    const params: unknown[] = [filter.status];
    if (filter.minPrice !== undefined) {
      params.push(filter.minPrice);
      conditions.push(`price >= $${params.length}`);
    }
    if (filter.maxPrice !== undefined) {
      params.push(filter.maxPrice);
      conditions.push(`price <= $${params.length}`);
    }
    const whereClause = conditions.join(' AND ');

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM market_listings WHERE ${whereClause}`,
      params,
    );
    const totalItems = Number(countResult.rows[0]?.count ?? '0');

    const offset = (filter.page - 1) * filter.pageSize;
    const dataParams = [...params, filter.pageSize, offset];
    const dataResult = await this.pool.query<MarketListingRow>(
      `SELECT * FROM market_listings
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams,
    );

    return {
      items: dataResult.rows.map(rowToListing),
      meta: {
        page: filter.page,
        pageSize: filter.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / filter.pageSize),
      },
    };
  }

  async findBySellerId(sellerId: string, status?: ListingStatus): Promise<MarketListing[]> {
    await this.sweepExpiredListings();
    const result = status
      ? await this.pool.query<MarketListingRow>(
          'SELECT * FROM market_listings WHERE seller_id = $1 AND status = $2 ORDER BY created_at DESC',
          [sellerId, status],
        )
      : await this.pool.query<MarketListingRow>(
          'SELECT * FROM market_listings WHERE seller_id = $1 ORDER BY created_at DESC',
          [sellerId],
        );
    return result.rows.map(rowToListing);
  }
}