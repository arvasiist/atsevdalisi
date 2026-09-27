import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { FeedType, Player } from '@at-sevdalisi/shared-types';
import type { EconomyLedgerEntryInput } from '../../application/ports/economy-ledger';
import type {
  FeedContext,
  FeedGrant,
  FeedInventoryRepository,
  FeedMutationResult,
  FeedWindowUsage,
} from '../../application/ports/feed-inventory.repository';
import { PG_POOL, withTransaction } from '../database/database.module';
import { rowToHorse, writeHorseRow, type HorseRow } from '../horse/horse-row';
import { rowToPlayer, writeLedgerEntries, writePlayerRow, type PlayerRow } from '../player/player-row';

/** `player_feed_inventory` satır şekli (migration 0030). `quantity` INTEGER → doğrudan `number`. */
interface FeedInventoryRow {
  item_type: string;
  quantity: number;
}

/** `horse_feed_log` gruplu sayım satırı (migration 0030). */
interface FeedUsageRow {
  item_type: string;
  fed_in_window: number;
  oldest_in_window: Date | null;
}

/**
 * Yem envanteri + besleme kaydı (brief §12) — `player_feed_inventory` ve
 * `horse_feed_log` (migration 0030). Bu turda EKLENDİ.
 *
 * Kilit sırası ve transaction sözleşmesi için bkz. `FeedInventoryRepository`
 * port'unun doc yorumu. Özet: her iki yazma metodu da ÖNCE `players` satırını
 * kilitler — böylece aynı oyuncunun tüm para/stok işlemleri tek sıraya
 * dizilir ve iki eşzamanlı istek (çift tıklama) aynı stoğu iki kez
 * harcayamaz / günlük sınırı aşamaz.
 */
@Injectable()
export class PostgresFeedInventoryRepository implements FeedInventoryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findQuantities(playerId: string): Promise<Map<FeedType, number>> {
    // CHECK kısıtı (migration 0030) yalnızca geçerli beş değeri kabul eder;
    // `FeedType` union'ı ile migration arasındaki bağ BURADADIR.
    return this.readAllQuantities(this.pool, playerId);
  }

  async getWindowUsages(horseId: string, windowStart: Date): Promise<Map<FeedType, FeedWindowUsage>> {
    const result = await this.pool.query<FeedUsageRow>(
      `SELECT item_type, COUNT(*)::int AS fed_in_window, MIN(fed_at) AS oldest_in_window
       FROM horse_feed_log
       WHERE horse_id = $1 AND fed_at >= $2
       GROUP BY item_type`,
      [horseId, windowStart],
    );
    return new Map(
      result.rows.map((row) => [
        row.item_type as FeedType,
        { fedInWindow: row.fed_in_window, oldestInWindowAt: row.oldest_in_window },
      ]),
    );
  }

  /**
   * Satın alma: (1) `players` kilitle, (2) güncel stoğu oku, (3) `mutate`,
   * (4) oyuncuyu yaz, (5) stoğu yaz, (6) defter kaydını yaz.
   */
  async buyWithLock<T>(
    playerId: string,
    feedType: FeedType,
    _count: number,
    mutate: (
      player: Player,
      currentQuantity: number,
    ) => { player: Player; quantity: number; result: T; ledgerEntries?: EconomyLedgerEntryInput[] },
  ): Promise<T | null> {
    return withTransaction(this.pool, async (client) => {
      const playerResult = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      const playerRow = playerResult.rows[0];
      if (!playerRow) {
        return null;
      }

      // Stok satırı `FOR UPDATE` OLMADAN okunur: yukarıdaki oyuncu kilidi
      // bu oyuncunun tüm stok yazmalarını zaten serileştirdiği için ikinci
      // bir kilit gereksizdir (ve satır hiç yoksa `FOR UPDATE` zaten hiçbir
      // şey kilitlemez — yanıltıcı bir güvence olurdu). Bu, `satın alma`
      // ile `besleme`nin AYNI satırı farklı sıralarla kilitlemesini de
      // imkânsız kılar.
      const currentQuantity = await this.readQuantity(client, playerId, feedType);

      const { player: updatedPlayer, quantity, result, ledgerEntries } = mutate(
        rowToPlayer(playerRow),
        currentQuantity,
      );

      await writePlayerRow(client, updatedPlayer);
      await this.writeQuantity(client, playerId, feedType, quantity);
      await writeLedgerEntries(client, ledgerEntries);

      return result;
    });
  }

  /**
   * Günlük hediye: (1) `players` kilitle, (2) TÜM stok adetlerini oku,
   * (3) `mutate`, (4) oyuncuyu yaz, (5) verilen kalemleri yaz, (6) defter.
   *
   * `buyWithLock` ile aynı kilit ve aynı yazma sırası; tek fark stoğun
   * TEK kalem değil TÜM kalemler için okunması (hediye birden fazla kalem
   * verebilir — `config/care.config.json` `feedDailyGift`).
   */
  async grantWithLock<T>(
    playerId: string,
    mutate: (
      player: Player,
      quantities: Map<FeedType, number>,
    ) => {
      player: Player;
      grants: FeedGrant[];
      result: T;
      ledgerEntries?: EconomyLedgerEntryInput[];
    },
  ): Promise<T | null> {
    return withTransaction(this.pool, async (client) => {
      const playerResult = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      const playerRow = playerResult.rows[0];
      if (!playerRow) {
        return null;
      }

      const quantities = await this.readAllQuantities(client, playerId);
      const { player: updatedPlayer, grants, result, ledgerEntries } = mutate(rowToPlayer(playerRow), quantities);

      await writePlayerRow(client, updatedPlayer);
      for (const grant of grants) {
        await this.writeQuantity(client, playerId, grant.type, grant.quantity);
      }
      await writeLedgerEntries(client, ledgerEntries);

      return result;
    });
  }

  /**
   * Besleme: (1) `players` kilitle, (2) stok + pencere kullanımını oku,
   * (3) `horses` kilitle, (4) `mutate`, (5) atı yaz, (6) stoğu yaz,
   * (7) `horse_feed_log`'a satır ekle.
   *
   * Oyuncu YOKSA `mutate` hiç çağrılmaz ve `null` döner. At YOKSA da aynı
   * şekilde `null` döner — çağıran `HorseNotFoundError` fırlatır
   * (`HorseRepository.updateWithLock` ile AYNI sözleşme). Oyuncu ve atın
   * AYNI anda yok olması pratikte imkânsızdır (`horses.owner_id`, migration
   * 0002, `players(id)`'e FOREIGN KEY'dir) ama iki dal da ayrı ayrı ele
   * alınır — hangisinin eksik olduğu varsayılmaz.
   */
  async feedWithLock<T>(
    playerId: string,
    horseId: string,
    feedType: FeedType,
    windowStart: Date,
    mutate: (context: FeedContext) => FeedMutationResult<T>,
  ): Promise<T | null> {
    return withTransaction(this.pool, async (client) => {
      // (1) ÖNCE oyuncu — kilit sırası port'ta belgelenmiştir.
      const playerResult = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      const playerRow = playerResult.rows[0];
      if (!playerRow) {
        return null;
      }

      // (2) Stok + bu at/kalem için pencere kullanımı.
      const quantity = await this.readQuantity(client, playerId, feedType);
      const usage = await this.readWindowUsage(client, horseId, feedType, windowStart);

      // (3) At satırı — oyuncudan SONRA (kilit sırası).
      const horseResult = await client.query<HorseRow>('SELECT * FROM horses WHERE id = $1 FOR UPDATE', [horseId]);
      const horseRow = horseResult.rows[0];
      if (!horseRow) {
        return null;
      }

      // (4) Saf domain hesabı — kilitli/güncel değerlerle.
      const { horse: updatedHorse, quantity: newQuantity, result } = mutate({
        player: rowToPlayer(playerRow),
        horse: rowToHorse(horseRow),
        quantity,
        usage,
      });

      // (5) At, (6) stok, (7) kayıt — HEPSİ aynı transaction'da.
      await writeHorseRow(client, updatedHorse);
      if (newQuantity !== null) {
        await this.writeQuantity(client, playerId, feedType, newQuantity);
      }
      await client.query('INSERT INTO horse_feed_log (horse_id, player_id, item_type) VALUES ($1, $2, $3)', [
        horseId,
        playerId,
        feedType,
      ]);

      return result;
    });
  }

  /**
   * Oyuncunun TÜM stok adetleri. `findQuantities` (havuzdan) ve
   * `grantWithLock` (kilitli client'tan) aynı sorguyu PAYLAŞIR — iki kopya
   * sorgu, birinin sessizce eskimesi demekti (bkz. `player-row.ts` doc
   * yorumundaki aynı gerekçe).
   */
  private async readAllQuantities(executor: Pool | PoolClient, playerId: string): Promise<Map<FeedType, number>> {
    const result = await executor.query<FeedInventoryRow>(
      'SELECT item_type, quantity FROM player_feed_inventory WHERE player_id = $1',
      [playerId],
    );
    return new Map(result.rows.map((row) => [row.item_type as FeedType, row.quantity]));
  }

  /** Tek (oyuncu, kalem) çiftinin stoğu; satır yoksa `0`. */
  private async readQuantity(client: PoolClient, playerId: string, feedType: FeedType): Promise<number> {
    const result = await client.query<FeedInventoryRow>(
      'SELECT item_type, quantity FROM player_feed_inventory WHERE player_id = $1 AND item_type = $2',
      [playerId, feedType],
    );
    return result.rows[0]?.quantity ?? 0;
  }

  /** Stok satırını yazar (yoksa oluşturur). `quantity` 0 olsa BİLE satır kalır — geçmiş görünür. */
  private async writeQuantity(
    client: PoolClient,
    playerId: string,
    feedType: FeedType,
    quantity: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO player_feed_inventory (player_id, item_type, quantity, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (player_id, item_type)
       DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
      [playerId, feedType, quantity],
    );
  }

  /** Tek (at, kalem) çiftinin pencere kullanımı; kayıt yoksa sıfır. */
  private async readWindowUsage(
    client: PoolClient,
    horseId: string,
    feedType: FeedType,
    windowStart: Date,
  ): Promise<FeedWindowUsage> {
    const result = await client.query<FeedUsageRow>(
      `SELECT item_type, COUNT(*)::int AS fed_in_window, MIN(fed_at) AS oldest_in_window
       FROM horse_feed_log
       WHERE horse_id = $1 AND item_type = $2 AND fed_at >= $3
       GROUP BY item_type`,
      [horseId, feedType, windowStart],
    );
    const row = result.rows[0];
    return { fedInWindow: row?.fed_in_window ?? 0, oldestInWindowAt: row?.oldest_in_window ?? null };
  }
}
