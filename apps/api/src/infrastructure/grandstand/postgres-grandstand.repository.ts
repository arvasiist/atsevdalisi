import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Player, RaceSurface, RaceTicketView, WatchableRaceView } from '@at-sevdalisi/shared-types';
import type {
  GrandstandRepository,
  PurchaseTicketInput,
  PurchaseTicketResult,
  RaceWatchabilityFacts,
  RefundTicketInput,
  RefundTicketResult,
  TribuneAccessFacts,
} from '../../application/ports/grandstand.repository';
import { assertTribuneHasRoom } from '../../domain/grandstand/ticket';
import { credit, debit, type Currency } from '../../domain/economy/wallet';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';
import { PlayerRow, rowToPlayer, writeLedgerEntries, writePlayerRow } from '../player/player-row';

/** `findWatchableRaces` JOIN sonucu satır şekli (snake_case). */
interface WatchableRaceRow {
  race_id: string;
  race_name: string;
  distance_m: number;
  surface: string;
  entry_fee: string;
  prize_pool: string;
  created_at: Date;
  /** `count(*)::int` ile döner — `pg` INTEGER'ı zaten JS number yapar (bkz. `::int` cast'inin gerekçesi). */
  entrant_count: number;
  has_ticket: boolean;
  /** `races.tribune_fee` — BIGINT, bu yüzden `pg` METİN döner (`Number(...)` şart). */
  tribune_fee: string;
  spectator_capacity: number;
  /** `count(*)::int` — satılan bilet sayısı (PHASE 7.1). */
  tickets_sold: number;
}

/** `getTribuneAccess` satır şekli (snake_case). */
interface TribuneAccessRow {
  tribune_fee: string;
  has_ticket: boolean;
}

/** `purchaseTicket` içindeki yarış kilidi satır şekli (snake_case). */
interface RaceLockRow {
  tribune_fee: string;
  spectator_capacity: number;
  tickets_sold: number;
}

/** `refundTicket` içindeki `DELETE ... RETURNING` satır şekli (snake_case). */
interface DeletedTicketRow {
  id: string;
  price: string;
  currency: string;
}

/** `findTicketsByPlayerId` JOIN sonucu satır şekli (snake_case). */
interface RaceTicketRow {
  ticket_id: string;
  race_id: string;
  race_name: string;
  price: string;
  currency: string;
  created_at: Date;
  finished_at: Date;
}

/** `findRaceWatchability` satır şekli (snake_case). */
interface RaceWatchabilityRow {
  race_id: string;
  race_name: string;
  status: string;
  created_at: Date;
  is_own_race: boolean;
  /** `races.tribune_fee` — BIGINT, `pg` METİN döner. */
  tribune_fee: string;
}

/**
 * Tribün (grandstand) repository'si — proje sahibinin açık talebi
 * (27.09.2026). Bilet satın alma DIŞINDAKİ tüm metotlar salt okunurdur.
 *
 * **Sorgulardaki İKİ ORTAK DESEN:**
 *   1. `LEFT JOIN race_tickets t ON ... AND t.player_id = $1` — "bu
 *      oyuncunun bileti var mı" bilgisi AYRI bir sorgu yerine AYNI satırda
 *      gelir (`WatchableRaceView.hasTicket`).
 *   2. `NOT EXISTS (... JOIN horses h ... h.owner_id = $1)` — "kendi
 *      yarışım" filtresi. `JOIN horses` BİLİNÇLİDİR: bot satırlarında
 *      `race_entries.horse_id` NULL'dur ve bir INNER JOIN'de asla
 *      eşleşmez, yani botlar bu filtreden OTOMATİK olarak etkilenmez —
 *      `PostgresRaceRepository.isPlayerParticipant` ile AYNI desen.
 */
@Injectable()
export class PostgresGrandstandRepository implements GrandstandRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    // Tribünün PARA BİRİMİ tek kaynaktan gelir (PHASE 7.1): `races`
    // tablosunda yarış başına bir para birimi sütunu YOKTUR ve olsaydı da
    // tribün ücreti (BIGINT) ile ayrışabilirdi. `AppConfigService`
    // `@Global()`tir (bkz. `postgres-race.repository.ts` — aynı enjeksiyon).
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findWatchableRaces(viewerId: string, windowHours: number, limit: number): Promise<WatchableRaceView[]> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const result = await this.pool.query<WatchableRaceRow>(
      `SELECT r.id AS race_id, r.name AS race_name, r.distance_m, r.surface,
              r.entry_fee, r.prize_pool, r.created_at,
              r.tribune_fee, r.spectator_capacity,
              (SELECT count(*)::int FROM race_entries re WHERE re.race_id = r.id) AS entrant_count,
              (SELECT count(*)::int FROM race_tickets rt WHERE rt.race_id = r.id) AS tickets_sold,
              (t.id IS NOT NULL) AS has_ticket
       FROM races r
       LEFT JOIN race_tickets t ON t.race_id = r.id AND t.player_id = $1
       WHERE r.status = 'finished'
         AND r.created_at >= $2
         AND NOT EXISTS (
           SELECT 1 FROM race_entries re
           JOIN horses h ON h.id = re.horse_id
           WHERE re.race_id = r.id AND h.owner_id = $1
         )
       ORDER BY r.created_at DESC
       LIMIT $3`,
      [viewerId, since, limit],
    );

    return result.rows.map((row) => ({
      raceId: row.race_id,
      raceName: row.race_name,
      distanceMeters: row.distance_m,
      surface: row.surface as RaceSurface,
      entrantCount: row.entrant_count,
      entryFee: Number(row.entry_fee),
      prizePool: Number(row.prize_pool),
      finishedAt: row.created_at.toISOString(),
      hasTicket: row.has_ticket,
      // TUTAR satırdan okunur (PHASE 7.1) — config'ten DEĞİL. Yalnızca
      // PARA BİRİMİ config'ten gelir: `races` tablosunda yarış başına bir
      // tribün para birimi sütunu YOKTUR (`race_tickets.currency` yalnızca
      // satın alma anında yazılır). `defaultTribuneFee.currency` bu yüzden
      // "varsayılan" değil, tribün diliminin TEK para birimidir.
      ticketPrice: { currency: this.config.grandstand.defaultTribuneFee.currency, amount: Number(row.tribune_fee) },
      spectatorCapacity: row.spectator_capacity,
      ticketsSold: row.tickets_sold,
    }));
  }

  async findTicketsByPlayerId(playerId: string, limit: number): Promise<RaceTicketView[]> {
    const result = await this.pool.query<RaceTicketRow>(
      `SELECT t.id AS ticket_id, t.race_id, r.name AS race_name,
              t.price, t.currency, t.created_at, r.created_at AS finished_at
       FROM race_tickets t
       JOIN races r ON r.id = t.race_id
       WHERE t.player_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2`,
      [playerId, limit],
    );

    return result.rows.map((row) => ({
      ticketId: row.ticket_id,
      raceId: row.race_id,
      raceName: row.race_name,
      price: Number(row.price),
      currency: row.currency as Currency,
      purchasedAt: row.created_at.toISOString(),
      finishedAt: row.finished_at.toISOString(),
    }));
  }

  async hasTicket(raceId: string, playerId: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM race_tickets WHERE race_id = $1 AND player_id = $2 LIMIT 1',
      [raceId, playerId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async findRaceWatchability(raceId: string, viewerId: string): Promise<RaceWatchabilityFacts | null> {
    const result = await this.pool.query<RaceWatchabilityRow>(
      `SELECT r.id AS race_id, r.name AS race_name, r.status, r.created_at, r.tribune_fee,
              EXISTS (
                SELECT 1 FROM race_entries re
                JOIN horses h ON h.id = re.horse_id
                WHERE re.race_id = r.id AND h.owner_id = $2
              ) AS is_own_race
       FROM races r
       WHERE r.id = $1`,
      [raceId, viewerId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      raceId: row.race_id,
      raceName: row.race_name,
      isFinished: row.status === 'finished',
      // Yarış sunucuda ANINDA tamamlanır (`race.gateway.ts`'in "gerçek
      // zamanlı simülasyon DEĞİL" doc yorumu) — `races.created_at` hem
      // "oluşturuldu" hem "bitti" anıdır, ayrı bir `finished_at` sütunu
      // YOKTUR (ve icat edilmedi).
      finishedAtMs: row.created_at.getTime(),
      isOwnRace: row.is_own_race,
      // PHASE 7.1: satın alma fiyatının TEK kaynağı. Use-case onu buradan
      // alıp `purchaseTicket`'a geçirir — config'ten DEĞİL.
      tribuneFee: Number(row.tribune_fee),
    };
  }

  async getTribuneAccess(raceId: string, viewerId: string): Promise<TribuneAccessFacts | null> {
    const result = await this.pool.query<TribuneAccessRow>(
      `SELECT r.tribune_fee,
              EXISTS (
                SELECT 1 FROM race_tickets t
                WHERE t.race_id = r.id AND t.player_id = $2
              ) AS has_ticket
       FROM races r
       WHERE r.id = $1`,
      [raceId, viewerId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return { tribuneFee: Number(row.tribune_fee), hasTicket: row.has_ticket };
  }

  /**
   * **PARA YOLU** — bkz. `GrandstandRepository.purchaseTicket` port doc
   * yorumundaki tam gerekçe.
   *
   * **KİLİT SIRASI `races` → `players`** (PHASE 7.1, 29.09.2026). Adım 1
   * 27.09.2026'da yalnızca `players`'tı; kapasite kontrolü eklenince
   * yarış satırı da kilitlenmek ZORUNDA kaldı, çünkü "kaç bilet satıldı"
   * ile "bilet ekle" arasında bir TOCTOU penceresi kalırsa eşzamanlı
   * istekler kontenjanı AŞAR ve bu **hiçbir yerde hata üretmez**
   * (`TribuneFullError` doc yorumu). Sıra İCAT EDİLMEDİ:
   * `PostgresRaceRepository.lockLobbyRace`/`settleLobbyRace` de aynı
   * sırayla kilitler — ters sıra, eşzamanlı bir kesinleştirmeyle kilit
   * döngüsü (deadlock, 40P01) doğururdu ve hata KARARSIZ olurdu.
   *
   *   1. `races` satırını `FOR UPDATE` ile kilitle, `tribune_fee` +
   *      `spectator_capacity` + satılan bilet sayısını AYNI okumada al ve
   *      `assertTribuneHasRoom` ile kontenjanı doğrula.
   *   2. `players` satırını `FOR UPDATE` ile kilitle (bu, AYNI oyuncunun
   *      TÜM para/stok işlemlerini serileştirir — `postgres-feed-inventory.
   *      repository.ts`'teki "her zaman önce players kilitle" notu).
   *   3. `debit` (saf domain) ile yeni bakiyeyi hesapla — yetersizse
   *      `InsufficientFundsError` fırlar ve HİÇBİR ŞEY yazılmaz.
   *   4. `players` satırını güncelle.
   *   5. `race_tickets` satırını ekle. `race_tickets_unique_per_player`
   *      kısıtı ihlal edilirse (eşzamanlı ikinci istek) 23505 fırlar ve
   *      TÜM transaction — bakiyeden düşülen para DAHİL — geri alınır.
   *   6. `economy_transactions` defter kaydını yaz (migration 0019).
   */
  async purchaseTicket(input: PurchaseTicketInput): Promise<PurchaseTicketResult | null> {
    return withTransaction(this.pool, async (client) => {
      // 1) YARIŞ KİLİDİ. `FOR UPDATE` + alt sorgu BİRLİKTE: kilit altında
      // okunan sayım, kilidi bekleyen ikinci isteğin göremeyeceği bir
      // "hayalet koltuk" bırakmaz.
      const raceResult = await client.query<RaceLockRow>(
        `SELECT r.tribune_fee, r.spectator_capacity,
                (SELECT count(*)::int FROM race_tickets rt WHERE rt.race_id = r.id) AS tickets_sold
         FROM races r
         WHERE r.id = $1
         FOR UPDATE`,
        [input.raceId],
      );
      const raceRow = raceResult.rows[0];
      if (!raceRow) {
        // Yarış satırı YOK. Buraya düşmek beklenmedik bir durumdur:
        // `PurchaseRaceTicketUseCase` yarışın varlığını zaten
        // `findRaceWatchability` ile doğrulamıştır ve yarışlar SİLİNMEZ.
        // `null` dönmek YANLIŞ olurdu — port sözleşmesinde `null` "oyuncu
        // yok" anlamına gelir ve çağıran onu `PlayerNotFoundError`a
        // çevirir; burada ise hata oyuncuda değil yarıştadır.
        throw new Error(`Bilet satılacak yarış bulunamadı (race_id: ${input.raceId}).`);
      }
      assertTribuneHasRoom(raceRow.tickets_sold, raceRow.spectator_capacity, input.raceId);

      // TUTAR kilitli satırdan, PARA BİRİMİ config'ten (bkz.
      // `PurchaseTicketInput` doc yorumu: çağıranın geçirdiği bir tutar ile
      // gerçekte tahsil edilen ayrışmasın diye tek kaynak burasıdır).
      const price = Number(raceRow.tribune_fee);
      const currency = this.config.grandstand.defaultTribuneFee.currency;

      // 2) OYUNCU KİLİDİ (races → players sırası korunur).
      const playerResult = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [
        input.playerId,
      ]);
      const playerRow = playerResult.rows[0];
      if (!playerRow) {
        return null;
      }

      const player = rowToPlayer(playerRow);
      const balanceBefore = { money: player.money, gems: player.gems };
      const balanceAfter = debit(balanceBefore, price, currency);

      const updatedPlayer: Player = {
        ...player,
        money: balanceAfter.money,
        gems: balanceAfter.gems,
        updatedAt: new Date().toISOString(),
      };
      await writePlayerRow(client, updatedPlayer);

      const ticketResult = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO race_tickets (race_id, player_id, price, currency)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [input.raceId, input.playerId, price, currency],
      );
      const ticket = ticketResult.rows[0];
      if (!ticket) {
        // `INSERT ... RETURNING` her zaman bir satır döner — buraya düşmek
        // şema/bağlantı seviyesinde beklenmedik bir durumdur. Sessizce
        // `undefined` ile devam etmek yerine AÇIKÇA fırlatılır; aksi halde
        // defter satırı `reference_id` olmadan (ya da bozuk) yazılırdı.
        throw new Error(`Tribün bileti yazılamadı (race_id: ${input.raceId}, player_id: ${input.playerId}).`);
      }

      await writeLedgerEntries(client, [
        {
          playerId: input.playerId,
          // `type` serbest metindir (bkz. migration 0019) — yeni bir tür
          // eklemek migration GEREKTİRMEZ.
          type: 'grandstand_ticket',
          // İMZALI: bilet bir HARCAMADIR (sink), bu yüzden negatif.
          amount: -price,
          currency,
          referenceType: 'race_ticket',
          referenceId: ticket.id,
          // Bakiye zinciri TEK para birimi üzerinden tutarlıdır
          // (`savePracticeRaceWithStakes`'teki AYNI kural) — diğer birimin
          // sütunu değişmediği için o birim için ledger satırı YAZILMAZ.
          balanceBefore: balanceBefore[currency],
          balanceAfter: balanceAfter[currency],
          idempotencyKey: input.idempotencyKey,
        },
      ]);

      return {
        ticketId: ticket.id,
        purchasedAt: ticket.created_at,
        price,
        currency,
        money: balanceAfter.money,
        gems: balanceAfter.gems,
      };
    });
  }

  /**
   * **PARA YOLU (ters yön)** — bkz. `GrandstandRepository.refundTicket`
   * port doc yorumundaki tam gerekçe. Sıra:
   *
   *   1. `players` satırını `FOR UPDATE` ile kilitle (para yolu kuralı).
   *   2. `race_tickets` satırını `DELETE ... RETURNING` ile SİL ve tutarı
   *      SATIRIN KENDİSİNDEN oku. 0 satır dönerse `null` → çağıran
   *      `RaceTicketNotFoundError` (404) fırlatır; **çift iadeyi engelleyen
   *      şey tam olarak budur** — ayrı bir `refunded_at` sütunu icat
   *      edilmedi.
   *   3. `credit` (saf domain) ile bakiyeyi artır ve `players` satırını
   *      güncelle.
   *   4. `economy_transactions`'a POZİTİF `grandstand_ticket_refund`
   *      satırını yaz — satın almanın negatif `grandstand_ticket` satırının
   *      AYNASI, aynı `reference_type`/`reference_id` ile.
   *
   * **Kilit sırası `players` → `race_tickets`**: `purchaseTicket`ın
   * `races` → `players` sırasıyla çakışmaz (refund `races` satırına hiç
   * dokunmaz), yani kilit döngüsü kurulamaz.
   */
  async refundTicket(input: RefundTicketInput): Promise<RefundTicketResult | null> {
    return withTransaction(this.pool, async (client) => {
      const playerResult = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [
        input.playerId,
      ]);
      const playerRow = playerResult.rows[0];
      if (!playerRow) {
        // Use-case oyuncunun varlığını zaten doğruladı — buraya düşmek
        // beklenmedik bir durumdur. `null` dönmek YANLIŞ olurdu: `null`
        // bu metotta "bilet yok" (404) anlamına gelir ve var olan bir
        // oyuncuya "biletin yok" demek yanlış teşhis olurdu.
        throw new Error(`İade yapılacak oyuncu bulunamadı (player_id: ${input.playerId}).`);
      }

      const deleted = await client.query<DeletedTicketRow>(
        `DELETE FROM race_tickets
         WHERE race_id = $1 AND player_id = $2
         RETURNING id, price, currency`,
        [input.raceId, input.playerId],
      );
      const ticket = deleted.rows[0];
      if (!ticket) {
        // Bilet YOK (ya da başka bir eşzamanlı iade onu yeni sildi —
        // `DELETE ... RETURNING` iki çağrıdan yalnızca BİRİNE satır verir,
        // çift iadeyi engelleyen şey tam olarak budur).
        // `null` → `RaceTicketNotFoundError` (404).
        return null;
      }

      // Tutar BİLET SATIRINDAN okunur (`races.tribune_fee`den DEĞİL):
      // yarışın ücreti sonradan değişse bile geçmiş bir satın alma kendi
      // tutarını korur — yarış iptalindeki "iade tutarı defterden okunur"
      // kuralının AYNISI (`PROJE_DURUMU.md` §13.19).
      const refundedAmount = Number(ticket.price);
      const currency = ticket.currency as Currency;

      const player = rowToPlayer(playerRow);
      const balanceBefore = { money: player.money, gems: player.gems };
      const balanceAfter = credit(balanceBefore, refundedAmount, currency);

      const updatedPlayer: Player = {
        ...player,
        money: balanceAfter.money,
        gems: balanceAfter.gems,
        updatedAt: new Date().toISOString(),
      };
      await writePlayerRow(client, updatedPlayer);

      await writeLedgerEntries(client, [
        {
          playerId: input.playerId,
          type: 'grandstand_ticket_refund',
          // İMZALI: iade bir GİRİŞTİR, bu yüzden POZİTİF — satın almanın
          // `-price` satırının tam aynası.
          amount: refundedAmount,
          currency,
          referenceType: 'race_ticket',
          referenceId: ticket.id,
          balanceBefore: balanceBefore[currency],
          balanceAfter: balanceAfter[currency],
          idempotencyKey: input.idempotencyKey,
        },
      ]);

      return {
        ticketId: ticket.id,
        refundedAmount,
        currency,
        money: balanceAfter.money,
        gems: balanceAfter.gems,
      };
    });
  }
}
