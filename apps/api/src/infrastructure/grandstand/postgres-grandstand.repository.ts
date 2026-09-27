import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Player, RaceSurface, RaceTicketView } from '@at-sevdalisi/shared-types';
import type {
  GrandstandRepository,
  PurchaseTicketInput,
  PurchaseTicketResult,
  RaceWatchabilityFacts,
  WatchableRaceFacts,
} from '../../application/ports/grandstand.repository';
import { debit, type Currency } from '../../domain/economy/wallet';
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
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findWatchableRaces(viewerId: string, windowHours: number, limit: number): Promise<WatchableRaceFacts[]> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const result = await this.pool.query<WatchableRaceRow>(
      `SELECT r.id AS race_id, r.name AS race_name, r.distance_m, r.surface,
              r.entry_fee, r.prize_pool, r.created_at,
              (SELECT count(*)::int FROM race_entries re WHERE re.race_id = r.id) AS entrant_count,
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
      // `ticketPrice` BİLEREK YOK — bkz. port metodunun doc yorumu:
      // fiyat bir config değeridir, `ListWatchableRacesUseCase` ekler.
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
      `SELECT r.id AS race_id, r.name AS race_name, r.status, r.created_at,
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
    };
  }

  /**
   * **PARA YOLU** — bkz. `GrandstandRepository.purchaseTicket` port doc
   * yorumundaki tam gerekçe. `PostgresRaceRepository.savePracticeRaceWithStakes`
   * ile BİREBİR AYNI sıra:
   *
   *   1. `players` satırını `FOR UPDATE` ile kilitle (bu, AYNI oyuncunun
   *      TÜM para/stok işlemlerini serileştirir — `postgres-feed-inventory.
   *      repository.ts`'teki "her zaman önce players kilitle" notu).
   *   2. `debit` (saf domain) ile yeni bakiyeyi hesapla — yetersizse
   *      `InsufficientFundsError` fırlar ve HİÇBİR ŞEY yazılmaz.
   *   3. `players` satırını güncelle.
   *   4. `race_tickets` satırını ekle. `race_tickets_unique_per_player`
   *      kısıtı ihlal edilirse (eşzamanlı ikinci istek) 23505 fırlar ve
   *      TÜM transaction — bakiyeden düşülen para DAHİL — geri alınır.
   *   5. `economy_transactions` defter kaydını yaz (migration 0019).
   */
  async purchaseTicket(input: PurchaseTicketInput): Promise<PurchaseTicketResult | null> {
    return withTransaction(this.pool, async (client) => {
      const playerResult = await client.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [
        input.playerId,
      ]);
      const playerRow = playerResult.rows[0];
      if (!playerRow) {
        return null;
      }

      const player = rowToPlayer(playerRow);
      const balanceBefore = { money: player.money, gems: player.gems };
      const balanceAfter = debit(balanceBefore, input.price, input.currency);

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
        [input.raceId, input.playerId, input.price, input.currency],
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
          amount: -input.price,
          currency: input.currency,
          referenceType: 'race_ticket',
          referenceId: ticket.id,
          // Bakiye zinciri TEK para birimi üzerinden tutarlıdır
          // (`savePracticeRaceWithStakes`'teki AYNI kural) — diğer birimin
          // sütunu değişmediği için o birim için ledger satırı YAZILMAZ.
          balanceBefore: balanceBefore[input.currency],
          balanceAfter: balanceAfter[input.currency],
          idempotencyKey: input.idempotencyKey,
        },
      ]);

      return {
        ticketId: ticket.id,
        purchasedAt: ticket.created_at,
        money: balanceAfter.money,
        gems: balanceAfter.gems,
      };
    });
  }
}
