import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ListingStatus, ListingType, MarketListing } from '@at-sevdalisi/shared-types';
import type {
  ExecuteMarketPurchaseInput,
  ExecuteMarketPurchaseResult,
  MarketPurchaseRepository,
} from '../../application/ports/market-purchase.repository';
import { expireListingIfNeeded, purchaseListing } from '../../domain/market/market';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { ListingNotFoundError, ListingStaleOwnerError } from '../../domain/market/errors';
import { assertCanAddHorseToStable, getStableCapacity } from '../../domain/stable/stable';
import { AppConfigService } from '../config/config.service';
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
  // AUDIT_REPORT.md Bulgu C1 (bu oturum) — alıcının ahır kapasitesini
  // KENDİ satırı ZATEN `FOR UPDATE` ile kilitliyken (aşağıdaki sorgu)
  // tek bir ek sütun olarak okuyoruz; ayrı bir round-trip GEREKMEZ.
  stable_level: number;
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
 *
 * AUDIT_REPORT.md remediation (bu oturum) — bu metoda iki ek savunma
 * eklendi: D2 (at satır kilitliyken `owner_id`'nin ilanın `sellerId`'siyle
 * hâlâ eşleştiğini doğrulama — bkz. `ListingStaleOwnerError`) ve C1
 * (alıcının ahır kapasitesi doluyken devri engelleme — bkz.
 * `StableCapacityExceededError`, `domain/stable/stable.ts`). İkisi de
 * ZATEN kilitli satırlar üzerinde ek sorgu ile yapılır, yeni bir kilit
 * SIRASI eklemez.
 */
@Injectable()
export class PostgresMarketPurchaseRepository implements MarketPurchaseRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

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
      const fetchedListing = rowToListing(listingRow);

      // CI DÜZELTMESİ (bu oturum) — `PostgresMarketListingRepository`nin
      // `findById`/`findActiveByHorseId`'in HER okumadan önce çalıştırdığı
      // "süresi dolmuş ilanları süpür" (`sweepExpiredListings`) davranışı,
      // eski `BuyMarketListingUseCase`'in o repository'yi ÇAĞIRMASI
      // sayesinde satın alma akışına da DOLAYLI olarak uygulanıyordu — on
      // üçüncü dilimin belgelediği/test ettiği sözleşme TAM OLARAK budur:
      // süresi dolmuş bir ilan satın alınmaya çalışıldığında `409
      // LISTING_EXPIRED` DEĞİL `409 LISTING_NOT_ACTIVE` döner (bkz.
      // `market.e2e-spec.ts` "süresi dolmuş bir ilanı satın almaya
      // çalışırsa" testi). Bu port `PostgresMarketListingRepository`'yi
      // HİÇ KULLANMADIĞINDAN (AUDIT_AND_HARDENING Öncelik 1'in kendi
      // gerekçesi — bağımsız, dedike bir transaction), bu süpürme
      // davranışı BURADA YENİDEN uygulanmazsa sessizce KAYBOLUR — CI bunu
      // GERÇEKTEN yakaladı (regresyon: `purchaseListing` doğrudan
      // `ListingExpiredError` fırlatıyordu). Satır zaten `FOR UPDATE` ile
      // kilitli olduğundan süpürme burada GÜVENLE ve AYNI transaction
      // içinde atomik olarak persist edilebilir — eski koddaki AYRI,
      // global sorguya bile gerek YOK.
      const listing = expireListingIfNeeded(fetchedListing);
      if (listing.status !== fetchedListing.status) {
        await client.query('UPDATE market_listings SET status = $2 WHERE id = $1', [listing.id, listing.status]);
      }

      // Veri bütünlüğü varsayımı: `market_listings.horse_id` FK'i
      // `horses(id)` üzerinde `ON DELETE CASCADE`'dir (at silinirse ilan
      // da CASCADE ile silinir) — bu dala normal koşullarda ULAŞILMAZ
      // (eski `BuyMarketListingUseCase`'in AYNI notuyla BİREBİR aynı).
      const horseResult = await client.query<{ id: string; owner_id: string }>(
        'SELECT id, owner_id FROM horses WHERE id = $1 FOR UPDATE',
        [listing.horseId],
      );
      const horseRow = horseResult.rows[0];
      if (!horseRow) {
        throw new HorseNotFoundError(listing.horseId);
      }

      // AUDIT_REPORT.md Bulgu D2 (High) — at satır KİLİTLİYKEN, atın
      // GERÇEK `owner_id`'sinin hâlâ ilanın `sellerId`'siyle eşleştiğini
      // doğrula. Bkz. `domain/market/errors.ts` `ListingStaleOwnerError`
      // doc yorumundaki tam gerekçe — D1'in düzeltmesi (migration 0023)
      // YENİ bir ikinci aktif ilanın oluşmasını engeller ama D1'DEN ÖNCE
      // (veya ondan bağımsız bir veri tutarsızlığıyla) zaten var olabilecek
      // "stale" bir ilanın satın alınmasını AYRI olarak bu kontrol engeller.
      //
      // CI REGRESYONU (bu oturum, ilk deneme) — bu kontrol İLK yazıldığında
      // `listing.status`'a HİÇ bakmıyordu. Ama zaten `sold`/`cancelled`
      // olmuş bir ilan için `owner_id !== sellerId` durumu GAYET NORMAL ve
      // BEKLENEN bir durumdur (at meşru şekilde el değiştirdiği için) —
      // "stale/tahrif edilmiş" bir durum DEĞİLDİR. Yalnızca `status`
      // hâlâ `'active'` GÖRÜNÜRKEN sahiplik uyuşmazlığı VARSA gerçekten
      // şüphelidir (D2'nin hedeflediği asıl senaryo). Bu yüzden kontrol
      // `status === 'active'` ile SINIRLANDIRILDI — aksi halde zaten
      // satılmış bir ilanı tekrar satın almaya çalışmak, aşağıdaki
      // `purchaseListing()`'in doğru/beklenen `ListingNotActiveError`'ı
      // (409 `LISTING_NOT_ACTIVE`) yerine yanlışlıkla `ListingStaleOwnerError`
      // (409 `LISTING_STALE_OWNER`) fırlatıyordu — CI bunu GERÇEKTEN
      // yakaladı (`market.e2e-spec.ts`'teki "zaten satılmış" ve "eşzamanlı
      // satın alma" testleri).
      if (listing.status === 'active' && horseRow.owner_id !== listing.sellerId) {
        throw new ListingStaleOwnerError(listing.id, listing.horseId);
      }

      const buyerId = input.buyerId;
      const sellerId = listing.sellerId;
      // `noUncheckedIndexedAccess` altında dizi indekslemeden kaçınmak
      // için `PostgresPlayerRepository.updateTwoWithLock` ile AYNI
      // doğrudan karşılaştırma deseni.
      const firstId = buyerId <= sellerId ? buyerId : sellerId;
      const secondId = buyerId <= sellerId ? sellerId : buyerId;
      const balancesById = new Map<string, { money: number; gems: number; stableLevel: number }>();

      const firstResult = await client.query<PlayerBalanceRow>(
        'SELECT id, money, gems, stable_level FROM players WHERE id = $1 FOR UPDATE',
        [firstId],
      );
      if (firstResult.rows[0]) {
        balancesById.set(firstId, {
          money: Number(firstResult.rows[0].money),
          gems: Number(firstResult.rows[0].gems),
          stableLevel: firstResult.rows[0].stable_level,
        });
      }
      if (secondId !== firstId) {
        const secondResult = await client.query<PlayerBalanceRow>(
          'SELECT id, money, gems, stable_level FROM players WHERE id = $1 FOR UPDATE',
          [secondId],
        );
        if (secondResult.rows[0]) {
          balancesById.set(secondId, {
            money: Number(secondResult.rows[0].money),
            gems: Number(secondResult.rows[0].gems),
            stableLevel: secondResult.rows[0].stable_level,
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

      // AUDIT_REPORT.md Bulgu C1 (High) — `StableCapacityExceededError`
      // FAZ 1'den beri domain katmanında hazırdı ama alım-satım akışında
      // HİÇ fırlatılmıyordu (alıcı ahırı doluyken bile at satın
      // alabiliyordu). Alıcının `players` satırı YUKARIDA zaten `FOR
      // UPDATE` ile kilitli olduğundan — ve at devrini yapan TEK yol bu
      // metottur, o da HER ZAMAN önce alıcının players satırını kilitler —
      // aynı alıcı için eşzamanlı iki satın alma bu kilit üzerinden
      // SERİLEŞİR; aşağıdaki sayım bu nedenle güvenle tutarlıdır (ekstra
      // bir "ahır" satırı kilitlemeye gerek yoktur).
      const buyerHorseCountResult = await client.query<{ count: string }>(
        'SELECT COUNT(*) FROM horses WHERE owner_id = $1',
        [buyerId],
      );
      const buyerHorseCount = Number(buyerHorseCountResult.rows[0]?.count ?? '0');
      const buyerCapacity = getStableCapacity(buyerBalance.stableLevel, this.config.stable);
      assertCanAddHorseToStable(buyerHorseCount, buyerCapacity);

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
