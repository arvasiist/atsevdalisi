import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ListingStatus, ListingType, MarketListing } from '@at-sevdalisi/shared-types';
import type {
  ExecuteMarketPurchaseInput,
  ExecuteMarketPurchaseResult,
  MarketPurchaseRepository,
} from '../../application/ports/market-purchase.repository';
import { purchaseListing } from '../../domain/market/market';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { ListingNotFoundError } from '../../domain/market/errors';
import { PG_POOL, withTransaction } from '../database/database.module';

/** `market_listings` satır şekli — `PostgresMarketListingRepository`'nin KENDİ (küçük, dosyaya-özel) mapper'ıyla AYNI desen. */
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

interface PlayerBalanceRow {
  id: string;
  money: string;
  gems: string;
}

/**
 * AUDIT_AND_HARDENING Öncelik 1 (EN KRİTİK, bu oturum) — bkz.
 * `MarketPurchaseRepository` port doc yorumundaki tam gerekçe. Kilit
 * SIRASI (deadlock'tan kaçınmak için, `PlayerRepository.updateTwoWithLock`
 * ile AYNI ilke — "her yerde AYNI global sıra"): önce `market_listings`
 * satırı (bu işlemin GİRİŞ noktası), sonra `horses` satırı (ilana bağlı,
 * TEK bir satır — çakışma riski YOK), sonra İKİ `players` satırı id'lerin
 * SÖZLÜKSEL sırasına göre (`updateTwoWithLock` ile BİREBİR AYNI mantık,
 * BURADA ayrıca uygulanır çünkü bu port `PlayerRepository`'yi KULLANMAZ —
 * kendi transaction'ını yönetir).
 */
@Injectable()
export class PostgresMarketPurchaseRepository implements MarketPurchaseRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async executePurchase(input: ExecuteMarketPurchaseInput): Promise<ExecuteMarketPurchaseResult> {
    return withTransaction(this.pool, async (client) => {
      const listingResult = await client.query<MarketListingRow>(
        'SELECT * FROM market_listings WHERE id = $1 FOR UPDATE',
        [input.listingId],
      );
      const listingRow = listingResult.rows[0];
      if (!listingRow) {
        throw new ListingNotFoundError(input.listingId);
      }
      const listing = rowToListing(listingRow);

      // Veri bütünlüğü varsayımı: `market_listings.horse_id` FK'i
      // `horses(id)` üzerinde `ON DELETE CASCADE`'dir (at silinirse ilan
      // da CASCADE ile silinir) — bu dala normal koşullarda ULAŞILMAZ
      // (eski `BuyMarketListingUseCase`'in AYNI notuyla BİREBİR aynı).
      const horseResult = await client.query<{ id: string }>('SELECT id FROM horses WHERE id = $1 FOR UPDATE', [
        listing.horseId,
      ]);
      if (!horseResult.rows[0]) {
        throw new HorseNotFoundError(listing.horseId);
      }

      const buyerId = input.buyerId;
      const sellerId = listing.sellerId;
      // `noUncheckedIndexedAccess` altında dizi indekslemeden kaçınmak
      // için `PostgresPlayerRepository.updateTwoWithLock` ile AYNI
      // doğrudan karşılaştırma deseni.
      const firstId = buyerId <= sellerId ? buyerId : sellerId;
      const secondId = buyerId <= sellerId ? sellerId : buyerId;
      const balancesById = new Map<string, { money: number; gems: number }>();

      const firstResult = await client.query<PlayerBalanceRow>(
        'SELECT id, money, gems FROM players WHERE id = $1 FOR UPDATE',
        [firstId],
      );
      if (firstResult.rows[0]) {
        balancesById.set(firstId, { money: Number(firstResult.rows[0].money), gems: Number(firstResult.rows[0].gems) });
      }
      if (secondId !== firstId) {
        const secondResult = await client.query<PlayerBalanceRow>(
          'SELECT id, money, gems FROM players WHERE id = $1 FOR UPDATE',
          [secondId],
        );
        if (secondResult.rows[0]) {
          balancesById.set(secondId, {
            money: Number(secondResult.rows[0].money),
            gems: Number(secondResult.rows[0].gems),
          });
        }
      }

      const buyerBalance = balancesById.get(buyerId);
      if (!buyerBalance) {
        throw new PlayerNotFoundError(buyerId);
      }
      const sellerBalance = balancesById.get(sellerId);
      if (!sellerBalance) {
        // `market_listings.seller_id` FK'i `players(id)` üzerinde `ON
        // DELETE CASCADE`'dir (satıcı silinirse ilanı da CASCADE ile
        // silinir) — bu dala normal koşullarda ULAŞILMAZ.
        throw new PlayerNotFoundError(sellerId);
      }

      // Domain doğrulaması + para hesaplaması — satırlar HÂLÂ kilitliyken,
      // EN GÜNCEL bakiyelerle (docs/SECURITY.md §5, `updateWithLock`'un
      // "hesaplama satır kilitliyken" kuralıyla AYNI). `CannotBuyOwnListingError`/
      // `ListingNotActiveError`/`ListingExpiredError`/`InsufficientFundsError`
      // burada fırlatılırsa `withTransaction` ROLLBACK yapar, HİÇBİR satır
      // yazılmaz.
      const purchase = purchaseListing(listing, buyerId, buyerBalance, sellerBalance);

      const now = new Date();
      await client.query('UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1', [
        buyerId,
        purchase.buyerBalance.money,
        purchase.buyerBalance.gems,
        now,
      ]);
      await client.query('UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1', [
        sellerId,
        purchase.sellerBalance.money,
        purchase.sellerBalance.gems,
        now,
      ]);
      await client.query('UPDATE horses SET owner_id = $2, updated_at = $3 WHERE id = $1', [
        listing.horseId,
        buyerId,
        now,
      ]);
      await client.query('UPDATE market_listings SET status = $2 WHERE id = $1', [listing.id, purchase.listing.status]);

      // AUDIT_AND_HARDENING Öncelik 2 — ledger, AYNI transaction'da (bkz.
      // `domain/market/market.ts` `purchaseListing`'in "fiyat sıfırsa
      // transfer hiç çağrılmaz" düzeltmesiyle AYNI gerekçe: sıfır fiyatlı
      // bir ilanın satın alınması PARA hareketi ÜRETMEZ, ledger'a hiçbir
      // satır eklenmez — migration 0019'daki `CHECK (amount <> 0)` bunu
      // veritabanı seviyesinde de zorunlu kılar).
      if (listing.price > 0) {
        await client.query(
          `INSERT INTO economy_transactions
             (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after, idempotency_key)
           VALUES ($1, 'market_purchase_debit', $2, 'money', 'market_listing', $3, $4, $5, $6)`,
          [buyerId, -listing.price, listing.id, buyerBalance.money, purchase.buyerBalance.money, input.idempotencyKey],
        );
        await client.query(
          `INSERT INTO economy_transactions
             (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after, idempotency_key)
           VALUES ($1, 'market_purchase_credit', $2, 'money', 'market_listing', $3, $4, $5, $6)`,
          [sellerId, listing.price, listing.id, sellerBalance.money, purchase.sellerBalance.money, input.idempotencyKey],
        );
      }

      return {
        listing: purchase.listing,
        buyerBalance: purchase.buyerBalance,
        sellerBalance: purchase.sellerBalance,
      };
    });
  }
}
