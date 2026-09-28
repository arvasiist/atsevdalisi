import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { WalletTransaction, WalletView } from '@at-sevdalisi/shared-types';
import type { WalletRepository } from '../../application/ports/wallet.repository';
import { canonicalTypeOf } from '../../domain/economy/wallet-history';
import { PG_POOL } from '../database/database.module';

/**
 * Cüzdan OKUMA yolu (brief §20, §42 PHASE 4) — `players` + `economy_transactions`.
 *
 * **SALT OKUMA.** `withTransaction` ÇAĞRILMAZ, `FOR UPDATE` YOK, hiçbir
 * `INSERT`/`UPDATE`/`DELETE` yok. Bu dosyanın varlık sebebi bir ekran
 * beslemektir; bakiye değiştiren tek yol `PlayerRepository`'nin kilitli
 * mutasyonlarıdır (bkz. `ports/wallet.repository.ts` doc yorumu).
 *
 * ## Neden iki sorgu (JOIN değil)
 *
 * `players` tek satır döner, defter ise SAYFALANIR. İkisini `LEFT JOIN`
 * ile birleştirmek, `LIMIT`'i oyuncu satırına da uygulamak (yani 1 satır
 * yerine `limit` kopya) ve bakiyeyi istemcide tekilleştirmek demekti.
 * Bunun yerine ikisi AYRI okunur: birincisi "bu oyuncu var mı?" sorusunu
 * (yoksa `null` → 404) kesin olarak cevaplar, ikincisi sayfayı getirir.
 *
 * ## `LIMIT $2` neden `limit + 1`
 *
 * `hasMore` alanını doğru doldurmak için bir fazla satır okunur ve
 * fazlalık DÜŞÜLÜR. "Dönen satır sayısı == limit ise daha vardır" tahmini
 * tam bölünen sonuçlarda yanlıştır: sonuç kümesi tam olarak `limit` ise
 * istemci fazladan bir BOŞ istek atar. Fazladan bir satır okumanın
 * maliyeti ise ihmal edilebilir (aynı index, bir satır daha).
 */
@Injectable()
export class PostgresWalletRepository implements WalletRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findWallet(playerId: string, limit: number): Promise<WalletView | null> {
    // Bakiye — `money`/`gems` BIGINT'tir, `node-postgres` bunları
    // varsayılan olarak STRING döner (hassasiyet kaybı endişesi); oyunun
    // değerleri güvenli tamsayı sınırını aşmadığı için `Number(...)`'a
    // çevrilir (`player-row.ts`'teki AYNI gerekçe).
    const playerResult = await this.pool.query<{ money: string; gems: string }>(
      `SELECT money, gems FROM players WHERE id = $1`,
      [playerId],
    );
    const playerRow = playerResult.rows[0];
    if (!playerRow) {
      return null;
    }

    // Defter — `idx_economy_transactions_player_id (player_id, created_at DESC)`
    // (migration 0019) tam olarak bu sorgu için var. Sıralama `created_at
    // DESC, id DESC`: aynı transaction'da yazılan iki satır (ör. hediye:
    // gönderen debit + alan credit) AYNI `created_at` damgasını taşıyabilir
    // (`now()` bir transaction içinde sabittir) — ikincil anahtar olmadan
    // sıralama kararsız olurdu ve sayfalar arasında satır tekrarı/atlaması
    // görülebilirdi.
    const ledgerResult = await this.pool.query<LedgerRow>(
      `SELECT id, type, amount, currency, balance_before, balance_after,
              reference_type, reference_id, created_at
         FROM economy_transactions
        WHERE player_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [playerId, limit + 1],
    );

    const hasMore = ledgerResult.rows.length > limit;
    const page = hasMore ? ledgerResult.rows.slice(0, limit) : ledgerResult.rows;

    return {
      playerId,
      money: Number(playerRow.money),
      gems: Number(playerRow.gems),
      transactions: page.map(rowToWalletTransaction),
      hasMore,
    };
  }
}

/** `economy_transactions` satırı (migration 0019; `reference_id` 0031'den beri TEXT). */
interface LedgerRow {
  id: string;
  type: string;
  amount: string;
  currency: string;
  balance_before: string;
  balance_after: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: Date;
}

/**
 * Defter satırını API görünümüne çevirir.
 *
 * `type` kolonu veritabanında serbest METİNDİR (migration 0019'un bilinçli
 * kararı — yeni bir tür migration gerektirmesin). Bu yüzden buradaki
 * `as LedgerTransactionType` bir **iddia**dır, kanıt değil: veritabanına
 * elle yazılmış tanınmayan bir `type` değeri bu iddiayı yalanlar ve
 * `canonicalTypeOf` `undefined` döndürür. Bu, sessizce yanlış bir AİLE
 * göstermekten iyidir ama sessiz kalmamalıdır — `wallet-history.spec.ts`
 * kodun yazdığı değerleri, `wallet.e2e-spec.ts` ise GERÇEK yazılan
 * satırları (günlük ödül, yem alımı, pazar) uçtan uca sınar. Kalan risk
 * (elle SQL ile uydurulmuş bir tür) `economy_transactions`'ın yalnızca
 * EKLEME kabul etmesiyle (migration 0038) sınırlıdır.
 */
function rowToWalletTransaction(row: LedgerRow): WalletTransaction {
  const type = row.type as WalletTransaction['type'];
  return {
    id: row.id,
    type,
    canonicalType: canonicalTypeOf(type),
    amount: Number(row.amount),
    currency: row.currency as WalletTransaction['currency'],
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at.toISOString(),
  };
}
