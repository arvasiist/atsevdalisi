import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  ListingStatus,
  ListingType,
  MarketListing,
  NotificationPayloadByType,
} from '@at-sevdalisi/shared-types';

type AuctionNotificationType =
  | 'auction_outbid'
  | 'auction_won'
  | 'auction_sold'
  | 'auction_unsold'
  | 'auction_refunded';
import type { MarketAuctionRepository } from '../../application/ports/market-auction.repository';
import { assertBidAllowed, minimumNextBid } from '../../domain/market/auction';
import {
  AuctionHasBidsError,
  ListingNotActiveError,
  ListingNotAuctionError,
  ListingNotFoundError,
} from '../../domain/market/errors';
import { isListingExpired } from '../../domain/market/market';
import { credit, debit } from '../../domain/economy/wallet';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { assertCanAddHorseToStable, getStableCapacity } from '../../domain/stable/stable';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';
import { isHorseInActiveRace } from '../horse/active-race-entry';

interface ListingRow {
  id: string;
  seller_id: string;
  horse_id: string;
  price: string;
  listing_type: string;
  status: string;
  created_at: Date;
  expires_at: Date | null;
}

interface BidRow {
  id: string;
  bidder_id: string;
  amount: string;
}

function rowToListing(row: ListingRow): MarketListing {
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

/**
 * MÜZAYEDE — PARA YOLU (02.10.2026). Kilit sırası HER işlemde aynıdır:
 * `market_listings` → `market_bids` (önde olan) → `horses` → `players`
 * (kimlik sırasıyla). Bakiye ve defter satırı AYNI transaction'dadır.
 */
@Injectable()
export class PostgresMarketAuctionRepository implements MarketAuctionRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async placeBid(input: {
    listingId: string;
    bidderId: string;
    amount: number;
    now: Date;
  }): Promise<{ listingId: string; bidderMoney: number }> {
    return withTransaction(this.pool, async (client) => {
      const listing = await this.lockListing(client, input.listingId);
      const leading = await this.lockLeadingBid(client, input.listingId);
      // Kural, kilit altında okunan teklifle uygulanır: iki eşzamanlı teklif
      // aynı "mevcut teklif"i göremez (ikincisi birincinin bitmesini bekler).
      assertBidAllowed({
        listing,
        bidderId: input.bidderId,
        amount: input.amount,
        currentBid: leading === null ? null : Number(leading.amount),
        now: input.now,
        config: this.config.economy.auction,
      });

      // Kazanırsa atı alabilecek mi — kapanışta da yeniden denetlenir.
      await this.assertStableRoom(client, input.bidderId);

      const balances = await this.lockPlayers(
        client,
        leading === null ? [input.bidderId] : [input.bidderId, leading.bidder_id],
      );

      // Önce önceki lider iade alır (kendi teklifini yükselten oyuncu dahil),
      // sonra yeni teklif emanete alınır — aynı oyuncuda net fark düşer.
      if (leading !== null) {
        const previous = balances.get(leading.bidder_id)!;
        const refunded = credit(
          { money: previous.money, gems: 0 },
          Number(leading.amount),
          'money',
        );
        await this.writeMoney(client, leading.bidder_id, refunded.money, input.now);
        await this.ledger(
          client,
          leading.bidder_id,
          'auction_bid_refund',
          Number(leading.amount),
          listing.id,
          previous.money,
          refunded.money,
        );
        balances.set(leading.bidder_id, { money: refunded.money });
        await client.query("UPDATE market_bids SET status = 'outbid' WHERE id = $1", [leading.id]);
        // Kendi teklifini yükselten oyuncuya "geçildin" denmez.
        if (leading.bidder_id !== input.bidderId) {
          await this.notify(client, leading.bidder_id, 'auction_outbid', {
            listingId: listing.id,
            horseName: await this.horseName(client, listing.horseId),
            amount: Number(leading.amount),
            minimumNextBid: minimumNextBid(listing.price, input.amount, this.config.economy.auction),
          });
        }
      }

      const bidder = balances.get(input.bidderId)!;
      const held = debit({ money: bidder.money, gems: 0 }, input.amount, 'money');
      await this.writeMoney(client, input.bidderId, held.money, input.now);
      await this.ledger(
        client,
        input.bidderId,
        'auction_bid_hold',
        -input.amount,
        listing.id,
        bidder.money,
        held.money,
      );
      await client.query(
        `INSERT INTO market_bids (listing_id, bidder_id, amount, status, created_at)
         VALUES ($1, $2, $3, 'leading', $4)`,
        [listing.id, input.bidderId, input.amount, input.now],
      );
      return { listingId: listing.id, bidderMoney: held.money };
    });
  }

  async findDueAuctionIds(now: Date, limit: number): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM market_listings
       WHERE status = 'active' AND listing_type = 'auction' AND expires_at <= $1
       ORDER BY expires_at
       LIMIT $2`,
      [now, limit],
    );
    return result.rows.map((row) => row.id);
  }

  async settleAuction(listingId: string, now: Date): Promise<'sold' | 'expired' | null> {
    return withTransaction(this.pool, async (client) => {
      const listing = await this.lockListing(client, listingId);
      // Zamanlayıcı ile başka bir kapanış yarışırsa ikincisi burada durur.
      if (
        listing.listingType !== 'auction' ||
        listing.status !== 'active' ||
        !isListingExpired(listing, now)
      ) {
        return null;
      }
      const leading = await this.lockLeadingBid(client, listingId);
      const horseName = await this.horseName(client, listing.horseId);
      if (leading === null) {
        await client.query("UPDATE market_listings SET status = 'expired' WHERE id = $1", [
          listingId,
        ]);
        await this.notify(client, listing.sellerId, 'auction_unsold', { listingId, horseName });
        return 'expired';
      }

      const amount = Number(leading.amount);
      const horse = await client.query<{ owner_id: string }>(
        'SELECT owner_id FROM horses WHERE id = $1 FOR UPDATE',
        [listing.horseId],
      );
      const stillSellers = horse.rows[0]?.owner_id === listing.sellerId;
      const inRace = stillSellers && (await isHorseInActiveRace(client, listing.horseId));
      const buyerHasRoom =
        stillSellers && !inRace && (await this.hasStableRoom(client, leading.bidder_id));

      const balances = await this.lockPlayers(client, [listing.sellerId, leading.bidder_id]);

      if (!stillSellers || inRace || !buyerHasRoom) {
        // Satış gerçekleşemez: emanet teklif verene AYNEN döner.
        const buyer = balances.get(leading.bidder_id)!;
        const refunded = credit({ money: buyer.money, gems: 0 }, amount, 'money');
        await this.writeMoney(client, leading.bidder_id, refunded.money, now);
        await this.ledger(
          client,
          leading.bidder_id,
          'auction_bid_refund',
          amount,
          listingId,
          buyer.money,
          refunded.money,
        );
        await client.query("UPDATE market_bids SET status = 'refunded' WHERE id = $1", [
          leading.id,
        ]);
        await client.query("UPDATE market_listings SET status = 'expired' WHERE id = $1", [
          listingId,
        ]);
        await this.notify(client, leading.bidder_id, 'auction_refunded', {
          listingId,
          horseName,
          amount,
        });
        await this.notify(client, listing.sellerId, 'auction_unsold', { listingId, horseName });
        return 'expired';
      }

      // Alıcının parası teklif anında düşmüştü; şimdi yalnızca satıcıya geçer.
      const seller = balances.get(listing.sellerId)!;
      const paid = credit({ money: seller.money, gems: 0 }, amount, 'money');
      await this.writeMoney(client, listing.sellerId, paid.money, now);
      await this.ledger(
        client,
        listing.sellerId,
        'auction_sale_credit',
        amount,
        listingId,
        seller.money,
        paid.money,
      );
      await client.query('UPDATE horses SET owner_id = $2, updated_at = $3 WHERE id = $1', [
        listing.horseId,
        leading.bidder_id,
        now,
      ]);
      await client.query("UPDATE market_bids SET status = 'won' WHERE id = $1", [leading.id]);
      await client.query("UPDATE market_listings SET status = 'sold' WHERE id = $1", [listingId]);
      await this.notify(client, leading.bidder_id, 'auction_won', {
        listingId,
        horseId: listing.horseId,
        horseName,
        amount,
      });
      await this.notify(client, listing.sellerId, 'auction_sold', { listingId, horseName, amount });
      return 'sold';
    });
  }

  async cancelAuction(listingId: string): Promise<MarketListing> {
    return withTransaction(this.pool, async (client) => {
      const listing = await this.lockListing(client, listingId);
      if (listing.listingType !== 'auction') {
        throw new ListingNotAuctionError(listingId);
      }
      if (listing.status !== 'active') {
        throw new ListingNotActiveError(listing.id, listing.status);
      }
      // Teklif almış müzayede iptal edilemez — teklif verenin emaneti ve
      // "en yüksek teklif kazanır" sözü korunur.
      if ((await this.lockLeadingBid(client, listingId)) !== null) {
        throw new AuctionHasBidsError(listingId);
      }
      await client.query("UPDATE market_listings SET status = 'cancelled' WHERE id = $1", [
        listingId,
      ]);
      return { ...listing, status: 'cancelled' };
    });
  }

  private async lockListing(client: PoolClient, listingId: string): Promise<MarketListing> {
    const result = await client.query<ListingRow>(
      'SELECT * FROM market_listings WHERE id = $1 FOR UPDATE',
      [listingId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ListingNotFoundError(listingId);
    }
    return rowToListing(row);
  }

  private async lockLeadingBid(client: PoolClient, listingId: string): Promise<BidRow | null> {
    const result = await client.query<BidRow>(
      `SELECT id, bidder_id, amount FROM market_bids
       WHERE listing_id = $1 AND status = 'leading'
       FOR UPDATE`,
      [listingId],
    );
    return result.rows[0] ?? null;
  }

  /** Oyuncuları kimlik sırasıyla kilitler (kilitlenme önleme). */
  private async lockPlayers(
    client: PoolClient,
    playerIds: string[],
  ): Promise<Map<string, { money: number }>> {
    const unique = [...new Set(playerIds)].sort();
    const balances = new Map<string, { money: number }>();
    for (const id of unique) {
      const result = await client.query<{ money: string }>(
        'SELECT money FROM players WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!result.rows[0]) {
        throw new PlayerNotFoundError(id);
      }
      balances.set(id, { money: Number(result.rows[0].money) });
    }
    return balances;
  }

  private async hasStableRoom(client: PoolClient, playerId: string): Promise<boolean> {
    try {
      await this.assertStableRoom(client, playerId);
      return true;
    } catch {
      return false;
    }
  }

  private async assertStableRoom(client: PoolClient, playerId: string): Promise<void> {
    const player = await client.query<{ stable_level: number }>(
      'SELECT stable_level FROM players WHERE id = $1',
      [playerId],
    );
    if (!player.rows[0]) {
      throw new PlayerNotFoundError(playerId);
    }
    const count = await client.query<{ count: string }>(
      'SELECT COUNT(*) FROM horses WHERE owner_id = $1',
      [playerId],
    );
    assertCanAddHorseToStable(
      Number(count.rows[0]?.count ?? '0'),
      getStableCapacity(player.rows[0].stable_level, this.config.stable),
    );
  }

  private async writeMoney(
    client: PoolClient,
    playerId: string,
    after: number,
    now: Date,
  ): Promise<void> {
    await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
      playerId,
      after,
      now,
    ]);
  }

  /**
   * Bildirim, yazıldığı para hareketiyle AYNI transaction'dadır: geri alınan
   * bir teklifin "geçildin" haberi alıcıda kalamaz.
   */
  private async notify<K extends AuctionNotificationType>(
    client: PoolClient,
    playerId: string,
    type: K,
    payload: NotificationPayloadByType[K],
  ): Promise<void> {
    await client.query(
      'INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)',
      [playerId, type, JSON.stringify(payload)],
    );
  }

  private async horseName(client: PoolClient, horseId: string): Promise<string> {
    const result = await client.query<{ name: string }>('SELECT name FROM horses WHERE id = $1', [
      horseId,
    ]);
    return result.rows[0]?.name ?? 'At';
  }

  private async ledger(
    client: PoolClient,
    playerId: string,
    type: 'auction_bid_hold' | 'auction_bid_refund' | 'auction_sale_credit',
    amount: number,
    listingId: string,
    before: number,
    after: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO economy_transactions
         (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
       VALUES ($1, $2, $3, 'money', 'market_listing', $4, $5, $6)`,
      [playerId, type, amount, listingId, before, after],
    );
  }
}
