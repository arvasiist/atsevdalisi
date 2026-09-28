import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  PvpMatch,
  Race,
  RaceEntry,
  RaceJockeyDecision,
  RaceLobbyView,
  RaceSegmentSnapshot,
  RaceStatus,
  RaceSurface,
  RaceTimelineEntrantView,
  RaceTimelineView,
  RaceWeather,
  RecentRaceResultView,
} from '@at-sevdalisi/shared-types';
import type {
  CreateLobbyRaceInput,
  CreateLobbyRaceResult,
  JoinLobbyRaceInput,
  LeaveLobbyRaceInput,
  ListLobbyRacesInput,
  RaceRepository,
  SavePracticeRaceWithStakesInput,
  SavePracticeRaceWithStakesResult,
  SavePvpMatchWithRatingsInput,
  SavePvpMatchWithRatingsResult,
  SetEntryReadyInput,
} from '../../application/ports/race.repository';
import type { EconomyLedgerEntryInput } from '../../application/ports/economy-ledger';
import { applyPracticeRaceStakes } from '../../domain/race/prize';
import {
  describeRacePrizeEconomics,
  resolvePrizeDistribution,
} from '../../domain/race/prize-distribution';
import { AppConfigService } from '../config/config.service';
import { checkEntryReadyable, checkRaceJoinable, checkRaceLeavable, nextGatePosition } from '../../domain/race/lobby';
import {
  AlreadyJoinedRaceError,
  HorseNotOwnedError,
  RaceEntryCancelledError,
  RaceEntryNotFoundError,
  RaceEntryNotLeavableError,
  RaceEntryNotReadyableError,
  RaceFullError,
  RaceNotJoinableError,
  RaceNotFoundError,
} from '../../domain/race/errors';
import { HorseNotFoundError, HorseInjuredError } from '../../domain/horse/errors';
import { credit, debit } from '../../domain/economy/wallet';
import { applyEloUpdate } from '../../domain/online/elo';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PG_POOL, withTransaction } from '../database/database.module';

/** Postgres `unique_violation` hata kodu (bkz. PostgreSQL "Error Codes" §22.6 sınıf 23). */
const POSTGRES_UNIQUE_VIOLATION = '23505';
/** migration 0037'deki kısmi UNIQUE index — "bir oyuncu bir yarışa bir atla". */
const ONE_ENTRY_PER_PLAYER_INDEX = 'race_entries_race_player_uq';

/**
 * Bir Postgres hatasının BELİRLİ bir tekil indeks ihlali olup olmadığı.
 * `postgres-market-listing.repository.ts`'teki AYNI desen (o dosya da bu
 * kontrolü satır içi yapar); ortak bir yardımcıya çıkarmak iki
 * infrastructure dosyası arasında yeni bir bağımlılık yaratırdı ve
 * `Infrastructure` katmanı içinde paylaşılan bir "pg hata" modülü
 * henüz yok.
 */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION &&
    'constraint' in error &&
    (error as { constraint?: string }).constraint === constraint
  );
}

/**
 * `findRecentResultsByOwnerId`'nin JOIN sonucu satır şekli (snake_case).
 * `performance_score` NUMERIC(6,2) olduğundan `pg` bunu string döner
 * (bkz. `postgres-horse.repository.ts`'teki AYNI not) — `Number(...)`'a
 * çevrilir. `distance_m`/`final_time_ms`/`finish_position` INTEGER'dır,
 * `pg` bunları zaten JS number olarak döner.
 */
interface RecentRaceRow {
  race_id: string;
  race_name: string;
  distance_m: number;
  surface: string;
  horse_id: string;
  horse_name: string;
  final_time_ms: number;
  finish_position: number;
  performance_score: string;
  created_at: Date;
}

function rowToRecentRaceResult(row: RecentRaceRow): RecentRaceResultView {
  return {
    raceId: row.race_id,
    raceName: row.race_name,
    horseId: row.horse_id,
    horseName: row.horse_name,
    distanceMeters: row.distance_m,
    surface: row.surface as RaceSurface,
    finishPosition: row.finish_position,
    finalTimeMs: row.final_time_ms,
    performanceScore: Number(row.performance_score),
    finishedAt: row.created_at.toISOString(),
  };
}

/**
 * `createLobbyRace`'in `RETURNING` satır şekli (snake_case).
 *
 * **NEDEN AYRI BİR ŞEKİL:** mevcut `insertRaceRow` bir `Race` (simülasyon
 * çıktısı) yazar ve hiçbir şey döndürmez; bu metot ise lobi görünümü
 * (`RaceLobbyView`) döndürmek zorundadır. `Race` şeklini yeniden
 * kullanmak, simülasyona özgü alanları (`simulationSeed`, motor
 * versiyonları) yanıtta sızdırırdı — bunlar istemcinin işine yaramaz,
 * üstelik seed'in istemciye verilmesi ileride "seed'i bilen sonucu
 * önceden hesaplar" tartışmasını doğurur. Bu yüzden `RETURNING` listesi
 * bilinçli olarak DARDIR: yalnızca lobinin gösterdiği alanlar.
 *
 * `entry_fee`/`prize_pool`/`tribune_fee` BIGINT'tir ve `pg` bunları
 * JS number değil **string** döner (2^53 güvenliği için) — bkz.
 * `RecentRaceRow.performance_score` üstündeki AYNI not. Bu yüzden
 * dönüştürücüde `Number(...)` şarttır; unutulursa istemci `"500"` görür.
 */
interface LobbyRaceRow {
  id: string;
  name: string;
  participant_limit: number;
  max_players: number;
  entry_fee: string;
  prize_pool: string;
  start_time: Date;
  status: string;
  race_type: string;
  surface: string;
  weather: string;
  distance_m: number;
  tribune_fee: string;
  spectator_capacity: number;
  created_by: string | null;
  created_at: Date;
}

/**
 * `LobbyRaceRow` → `RaceLobbyView`. `joinedPlayers` PARAMETRE olarak
 * alınır, satırdan okunmaz: `races` tablosunda böyle bir sütun YOKTUR ve
 * olmamalıdır da — katılımcı sayısı `race_entries`'ten TÜRETİLİR (tek
 * doğruluk kaynağı), denormalize bir sayaç ise iki kaynağın ayrışması
 * demek olurdu. Bu metot yalnızca `races` satırını gördüğü için sayıyı
 * çağırandan alır.
 */
function rowToLobbyRaceView(config: AppConfigService, row: LobbyRaceRow, joinedPlayers: number): RaceLobbyView {
  // §42 PHASE 5 — ÖDÜL EKONOMİSİ (brief §3/§4). Havuz `races.prize_pool`
  // sütunudur (katılımda büyür, ayrılmada küçülür); çarpan ve kazanan
  // ödülü ONDAN türetilir. `null` çarpan = "bu yarışta gösterilecek çarpan
  // yok" (ücretsiz yarış ya da henüz katılım yok) — istemci bu durumda
  // çarpanı hiç göstermez, `0.00x` göstermez.
  const shares = resolvePrizeDistribution(config.economy, config.raceLobby.prizeDistributionId)?.shares ?? [];
  const economics = describeRacePrizeEconomics({
    entryFee: Number(row.entry_fee),
    participantCount: joinedPlayers,
    pool: Number(row.prize_pool),
    shares,
  });

  return {
    id: row.id,
    name: row.name,
    fieldSize: row.participant_limit,
    maxPlayers: row.max_players,
    joinedPlayers,
    entryFee: Number(row.entry_fee),
    prizePool: Number(row.prize_pool),
    startTime: row.start_time.toISOString(),
    status: row.status as RaceStatus,
    raceType: row.race_type as 'free' | 'paid',
    surface: row.surface as RaceSurface,
    weather: row.weather as RaceWeather,
    distanceMeters: row.distance_m,
    tribuneFee: Number(row.tribune_fee),
    spectatorCapacity: row.spectator_capacity,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    prizeMultiplier: economics.multiplier,
    topPrize: economics.topPrize,
  };
}

/**
 * `races`/`race_entries`/`race_entry_segments` tablolarına yazan
 * repository (`database/migrations/0006_create_races_and_entries.up.sql`,
 * `0014_add_race_segment_faz5_fields.up.sql`). FAZ 1 wiring, sekizinci
 * dilim — Pratik Yarış: bkz. `application/ports/race.repository.ts`
 * üstündeki not (transaction burada "ya hepsi ya hiçbiri" için, satır
 * kilitleme İÇİN DEĞİL — `PostgresPlayerRepository.updateWithLock` ile
 * KARIŞTIRILMASIN).
 *
 * FAZ 1 wiring, dokuzuncu dilim — `entry_fee`/`prize_pool` artık
 * `race.entryFee`/`race.prizePool`'dan gelen GERÇEK değerlerdir (önceden
 * her zaman sabit `0` yazılıyordu).
 *
 * FAZ 1 wiring, on dördüncü dilim — `savePvpMatch` eklendi (PvP
 * Eşleştirme, brief §41); `races`/`race_entries` ekleme sorguları artık
 * `insertRaceRow`/`insertEntryWithSegments` yardımcılarına çıkarıldı
 * (DRY) — `savePracticeRace` de bunları KULLANIR, davranışı DEĞİŞMEDİ.
 * `pvp_matches` tablosuna da yazar (`database/migrations/
 * 0018_add_pvp_matchmaking.up.sql`).
 */
@Injectable()
export class PostgresRaceRepository implements RaceRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    // §42 PHASE 5 — lobi görünümü artık ödül ekonomisini (havuz, çarpan,
    // kazanan ödülü) da taşıyor. `AppConfigModule` `@Global()` olduğu için
    // ek modül importu GEREKMEZ (`postgres-breeding.repository.ts` ile AYNI
    // desen). Config BURADA okunmaz: dağıtımın çözülmesi ve matematiği saf
    // domain fonksiyonlarındadır (`domain/race/prize-distribution.ts`),
    // bu sınıf yalnızca onları çağırır.
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async savePracticeRace(race: Race, entry: RaceEntry, segments: RaceSegmentSnapshot[]): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await this.insertRaceRow(client, race);
      await this.insertEntryWithSegments(client, entry, segments);
    });
  }

  /**
   * AUDIT_REPORT.md Bulgu E1 (High, bu oturum) — bkz. `RaceRepository.
   * savePracticeRaceWithStakes` port doc yorumundaki tam gerekçe.
   * `PostgresMarketPurchaseRepository.executePurchase` ile AYNI desen: bu
   * metot `PlayerRepository`'yi HİÇ KULLANMAZ, kendi transaction'ını
   * yönetir — oyuncunun `players` satırını KİLİTLER, `applyPracticeRaceStakes`
   * (saf domain fonksiyonu, `InsufficientFundsError` fırlatabilir) ile
   * bakiyeyi hesaplar, güncellenmiş satırı + ledger girişlerini yazar, SONRA
   * (satırlar hâlâ AYNI transaction/client içindeyken) `races`/
   * `race_entries`/`race_entry_segments` satırlarını ekler. Herhangi bir
   * adım (özellikle SON adım — yarış kaydı) başarısız olursa `withTransaction`
   * TÜMÜNÜ (para dahil) ROLLBACK eder.
   */
  async savePracticeRaceWithStakes(input: SavePracticeRaceWithStakesInput): Promise<SavePracticeRaceWithStakesResult> {
    return withTransaction(this.pool, async (client) => {
      const playerResult = await client.query<{ money: string; gems: string }>(
        'SELECT money, gems FROM players WHERE id = $1 FOR UPDATE',
        [input.playerId],
      );
      const playerRow = playerResult.rows[0];
      if (!playerRow) {
        throw new PlayerNotFoundError(input.playerId);
      }

      const balanceBefore = { money: Number(playerRow.money), gems: Number(playerRow.gems) };
      const balanceAfter = applyPracticeRaceStakes(balanceBefore, input.entryFee, input.prizeWon);

      await client.query('UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1', [
        input.playerId,
        balanceAfter.money,
        balanceAfter.gems,
        new Date(),
      ]);

      const ledgerEntries: EconomyLedgerEntryInput[] = [];
      if (input.entryFee > 0) {
        ledgerEntries.push({
          playerId: input.playerId,
          type: 'practice_race_entry_fee',
          amount: -input.entryFee,
          currency: 'money',
          referenceType: 'race',
          referenceId: input.race.id,
          balanceBefore: balanceBefore.money,
          balanceAfter: balanceBefore.money - input.entryFee,
          idempotencyKey: null,
        });
      }
      if (input.prizeWon > 0) {
        ledgerEntries.push({
          playerId: input.playerId,
          type: 'practice_race_prize',
          amount: input.prizeWon,
          currency: 'money',
          referenceType: 'race',
          referenceId: input.race.id,
          balanceBefore: balanceBefore.money - input.entryFee,
          balanceAfter: balanceAfter.money,
          idempotencyKey: null,
        });
      }
      await this.writeLedgerEntries(client, ledgerEntries);

      await this.insertRaceRow(client, input.race);
      // AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `input.entry`/
      // `input.segments` (tekil) yerine `input.entries` (oyuncu + TÜM bot
      // rakipler) — bkz. port doc yorumu, `savePvpMatch`'teki AYNI
      // "her katılımcı için bir kez insertEntryWithSegments" deseni.
      for (const entry of input.entries) {
        const entrySegments = input.segments.filter((segment) => segment.raceEntryId === entry.id);
        await this.insertEntryWithSegments(client, entry, entrySegments);
      }

      return balanceAfter;
    });
  }

  /** `savePracticeRaceWithStakes`'in yazdığı `economy_transactions` satırları — `PostgresPlayerRepository.writeLedgerEntries` ile AYNI desen (bu port `PlayerRepository`'yi kullanmadığından kendi kopyasını taşır). */
  private async writeLedgerEntries(client: PoolClient, entries: EconomyLedgerEntryInput[]): Promise<void> {
    for (const entry of entries) {
      await client.query(
        `INSERT INTO economy_transactions
           (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          entry.playerId,
          entry.type,
          entry.amount,
          entry.currency,
          entry.referenceType,
          entry.referenceId,
          entry.balanceBefore,
          entry.balanceAfter,
          entry.idempotencyKey,
        ],
      );
    }
  }

  /**
   * FAZ 1 wiring, on dördüncü dilim (bu oturum) — bkz. `RaceRepository.savePvpMatch`
   * doc yorumu. `savePracticeRace` ile PAYLAŞILAN `insertRaceRow`/
   * `insertEntryWithSegments` yardımcılarını İKİ kez (her katılımcı için
   * bir kez) çağırır, ayrıca `pvp_matches` satırını ekler.
   */
  async savePvpMatch(
    race: Race,
    entries: [RaceEntry, RaceEntry],
    segments: RaceSegmentSnapshot[],
    match: PvpMatch,
  ): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await this.insertRaceRow(client, race);

      const [playerAId, playerBId] = match.playerIds;
      for (const entry of entries) {
        const entrySegments = segments.filter((segment) => segment.raceEntryId === entry.id);
        await this.insertEntryWithSegments(client, entry, entrySegments);
      }

      await client.query(
        `INSERT INTO pvp_matches (id, race_id, player_a_id, player_b_id, winner_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [match.id, race.id, playerAId, playerBId, match.winnerId, match.status, new Date(match.createdAt)],
      );
    });
  }

  /**
   * AUDIT_REPORT.md Bulgu E1'in PvP analogu (bu oturum) — bkz.
   * `RaceRepository.savePvpMatchWithRatings` port doc yorumundaki tam
   * gerekçe. `savePracticeRaceWithStakes` ile AYNI desen (`PlayerRepository`
   * KULLANILMAZ, satırlar doğrudan burada kilitlenir); tek fark burada İKİ
   * `players` satırı kilitlenir — `PlayerRepository.updateTwoWithLock` ile
   * AYNI deadlock-önleme sırası (id'lerin SÖZLÜKSEL sırası, ARGÜMAN/`A`-`B`
   * sırasından BAĞIMSIZ).
   */
  async savePvpMatchWithRatings(input: SavePvpMatchWithRatingsInput): Promise<SavePvpMatchWithRatingsResult> {
    return withTransaction(this.pool, async (client) => {
      const [playerAId, playerBId] = input.match.playerIds;

      const firstId = playerAId <= playerBId ? playerAId : playerBId;
      const secondId = playerAId <= playerBId ? playerBId : playerAId;
      const ratingById = new Map<string, number>();

      const firstResult = await client.query<{ id: string; rating: number }>(
        'SELECT id, rating FROM players WHERE id = $1 FOR UPDATE',
        [firstId],
      );
      if (firstResult.rows[0]) {
        ratingById.set(firstId, firstResult.rows[0].rating);
      }
      // `playerAId === playerBId` pratikte imkansızdır (`findBestMatch`
      // kendi kendine eşleşmeyi engeller, `PlayerRepository.updateTwoWithLock`
      // doc yorumundaki AYNI "kendi kendini bloklamaz" mantığı burada da
      // geçerli olurdu) — yine de `secondId !== firstId` koruması AYNI
      // desenle taşınır.
      if (secondId !== firstId) {
        const secondResult = await client.query<{ id: string; rating: number }>(
          'SELECT id, rating FROM players WHERE id = $1 FOR UPDATE',
          [secondId],
        );
        if (secondResult.rows[0]) {
          ratingById.set(secondId, secondResult.rows[0].rating);
        }
      }

      const ratingABefore = ratingById.get(playerAId);
      if (ratingABefore === undefined) {
        throw new PlayerNotFoundError(playerAId);
      }
      const ratingBBefore = ratingById.get(playerBId);
      if (ratingBBefore === undefined) {
        throw new PlayerNotFoundError(playerBId);
      }

      const eloResult = applyEloUpdate(ratingABefore, ratingBBefore, input.scoreA, input.onlineConfig);
      const updatedAt = new Date();
      await client.query('UPDATE players SET rating = $2, updated_at = $3 WHERE id = $1', [
        playerAId,
        eloResult.ratingA,
        updatedAt,
      ]);
      await client.query('UPDATE players SET rating = $2, updated_at = $3 WHERE id = $1', [
        playerBId,
        eloResult.ratingB,
        updatedAt,
      ]);

      await this.insertRaceRow(client, input.race);
      for (const entry of input.entries) {
        const entrySegments = input.segments.filter((segment) => segment.raceEntryId === entry.id);
        await this.insertEntryWithSegments(client, entry, entrySegments);
      }

      await client.query(
        `INSERT INTO pvp_matches (id, race_id, player_a_id, player_b_id, winner_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.match.id,
          input.race.id,
          playerAId,
          playerBId,
          input.match.winnerId,
          input.match.status,
          new Date(input.match.createdAt),
        ],
      );

      return {
        ratingABefore,
        ratingAAfter: eloResult.ratingA,
        ratingBBefore,
        ratingBAfter: eloResult.ratingB,
      };
    });
  }

  /**
   * Faz 2 (görsel kalite planı) — bkz. `RaceRepository.
   * findRecentResultsByOwnerId` doc yorumu. Salt okunur, hiçbir yazma
   * içermez (diğer metodların AKSİNE `withTransaction` GEREKMEZ).
   */
  async findRecentResultsByOwnerId(ownerId: string, limit: number): Promise<RecentRaceResultView[]> {
    const result = await this.pool.query<RecentRaceRow>(
      `SELECT r.id AS race_id, r.name AS race_name, r.distance_m, r.surface, r.created_at,
              re.horse_id, h.name AS horse_name, re.final_time_ms, re.finish_position, re.performance_score
       FROM race_entries re
       JOIN races r ON r.id = re.race_id
       JOIN horses h ON h.id = re.horse_id
       WHERE h.owner_id = $1 AND re.finish_position IS NOT NULL
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [ownerId, limit],
    );
    return result.rows.map(rowToRecentRaceResult);
  }

  /**
   * AUDIT_REPORT.md Bulgu R3 (Low, bu oturum) — bkz. `RaceRepository.
   * findRecentResultsByHorseId` port doc yorumu. `findRecentResultsByOwnerId`
   * ile AYNI sorgu şekli, yalnızca `WHERE` koşulu `h.owner_id` yerine
   * `re.horse_id`. `RecentRaceRow`/`rowToRecentRaceResult`'ı PAYLAŞIR.
   */
  async findRecentResultsByHorseId(horseId: string, limit: number): Promise<RecentRaceResultView[]> {
    const result = await this.pool.query<RecentRaceRow>(
      `SELECT r.id AS race_id, r.name AS race_name, r.distance_m, r.surface, r.created_at,
              re.horse_id, h.name AS horse_name, re.final_time_ms, re.finish_position, re.performance_score
       FROM race_entries re
       JOIN races r ON r.id = re.race_id
       JOIN horses h ON h.id = re.horse_id
       WHERE re.horse_id = $1 AND re.finish_position IS NOT NULL
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [horseId, limit],
    );
    return result.rows.map(rowToRecentRaceResult);
  }

  /**
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — bkz. `RaceRepository.
   * findTimelineByRaceId` port doc yorumu. ÜÇ ayrı sorgu (races satırı,
   * TÜM race_entries, TÜM race_entry_segments) BİLEREK tek bir dev JOIN
   * yerine ayrı tutuldu — segment satırları katılımcı başına 8 (brief §19
   * segment sayısı) olduğundan bir JOIN, race_entries sütunlarını
   * gereksiz yere N kat tekrar eder; burada N küçük (≤12 katılımcı) olsa
   * da `findRecentResultsByOwnerId`'nin AKSİNE (tek satır/katılımcı) bu
   * sorgu segment-seviyesinde çalıştığından ayrım daha nettir. Salt okunur,
   * `withTransaction` GEREKMEZ.
   */
  async findTimelineByRaceId(raceId: string): Promise<RaceTimelineView | null> {
    const raceResult = await this.pool.query<{
      distance_m: number;
      surface: string;
      weather: string;
      simulation_seed: string | null;
    }>('SELECT distance_m, surface, weather, simulation_seed FROM races WHERE id = $1', [raceId]);
    const raceRow = raceResult.rows[0];
    if (!raceRow) {
      return null;
    }

    const entryResult = await this.pool.query<{
      entry_id: string;
      horse_id: string | null;
      bot_label: string | null;
      horse_name: string | null;
      tactical_style: string | null;
      risk_level: string | null;
      // AUDIT_REPORT.md Bulgu R3 (bu oturum) — bkz. `gate-assignment.ts`
      // doc yorumu: bu sütun artık gerçekten doldurulur, bu yüzden SEÇİLİP
      // aşağıda `RaceTimelineEntrantView.gatePosition`'a eşlenir (öncesinde
      // hiç SELECT edilmiyordu — sütun DB'de olsa bile hiçbir yanıt onu
      // hiç göstermiyordu).
      gate_position: number | null;
      final_time_ms: number | null;
      finish_position: number | null;
      performance_score: string | null;
    }>(
      `SELECT re.id AS entry_id, re.horse_id, re.bot_label, h.name AS horse_name,
              re.tactical_style, re.risk_level, re.gate_position, re.final_time_ms, re.finish_position, re.performance_score
       FROM race_entries re
       LEFT JOIN horses h ON h.id = re.horse_id
       WHERE re.race_id = $1
       ORDER BY (re.finish_position IS NULL), re.finish_position, re.created_at`,
      [raceId],
    );

    const entryIds = entryResult.rows.map((row) => row.entry_id);
    const segmentsByEntryId = new Map<string, RaceSegmentSnapshot[]>();
    if (entryIds.length > 0) {
      const segmentResult = await this.pool.query<{
        race_entry_id: string;
        segment_distance_m: number;
        timestamp_ms: number;
        position_m: string;
        speed: string | null;
        stamina: string | null;
        fatigue: string | null;
        fatigue_level: string | null;
        pace_score: string | null;
        lane: number | null;
        tactical_state: string | null;
        current_rank: number | null;
        blocked: boolean;
        jockey_decision: string | null;
      }>(
        `SELECT race_entry_id, segment_distance_m, timestamp_ms, position_m, speed, stamina, fatigue, fatigue_level, pace_score, lane, tactical_state, current_rank, blocked, jockey_decision
         FROM race_entry_segments
         WHERE race_entry_id = ANY($1::uuid[])
         ORDER BY race_entry_id, timestamp_ms`,
        [entryIds],
      );

      for (const row of segmentResult.rows) {
        const segment: RaceSegmentSnapshot = {
          raceEntryId: row.race_entry_id,
          segmentDistanceMeters: row.segment_distance_m,
          timestampMs: row.timestamp_ms,
          positionMeters: Number(row.position_m),
          speed: row.speed === null ? 0 : Number(row.speed),
          stamina: row.stamina === null ? 0 : Number(row.stamina),
          fatigue: row.fatigue === null ? 0 : Number(row.fatigue),
          // NULL → `undefined` (0 DEĞİL): bu alanlar `RaceSegmentSnapshot`'ta
          // opsiyoneldir ve tüketiciler "bu kayıt bu alan eklenmeden önce
          // yazılmış" durumunu `fatigueLevel ?? fatigue` ile ayırt eder
          // (bkz. `apps/web/.../timeline-playback.ts`). `0` yazmak, gerçek
          // bir "yorgunluk sıfır" ölçümü ile "ölçüm yok"u AYIRT EDİLEMEZ
          // hale getirirdi.
          fatigueLevel: row.fatigue_level === null ? undefined : Number(row.fatigue_level),
          paceScore: row.pace_score === null ? undefined : Number(row.pace_score),
          lane: row.lane ?? 0,
          tacticalState: row.tactical_state ?? '',
          currentRank: row.current_rank ?? 0,
          blocked: row.blocked,
          decision: (row.jockey_decision ?? 'hold') as RaceJockeyDecision,
        };
        const existing = segmentsByEntryId.get(row.race_entry_id) ?? [];
        existing.push(segment);
        segmentsByEntryId.set(row.race_entry_id, existing);
      }
    }

    const entrants: RaceTimelineEntrantView[] = entryResult.rows.map((row) => ({
      entryId: row.entry_id,
      isBot: row.horse_id === null,
      horseId: row.horse_id,
      horseName: row.horse_name,
      botLabel: row.bot_label,
      tacticalStyle: row.tactical_style as RaceTimelineEntrantView['tacticalStyle'],
      riskLevel: row.risk_level as RaceTimelineEntrantView['riskLevel'],
      gatePosition: row.gate_position,
      finalTimeMs: row.final_time_ms,
      finishPosition: row.finish_position,
      performanceScore: row.performance_score === null ? null : Number(row.performance_score),
      segments: segmentsByEntryId.get(row.entry_id) ?? [],
    }));

    return {
      raceId,
      distanceMeters: raceRow.distance_m,
      surface: raceRow.surface as RaceSurface,
      weather: raceRow.weather as RaceWeather,
      simulationSeed: raceRow.simulation_seed,
      entrants,
    };
  }

  /**
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — bkz. `RaceRepository.
   * isPlayerParticipant` port doc yorumu. `INNER JOIN horses` botları
   * OTOMATİK dışarıda bırakır (`horse_id IS NULL` bir bot satırı hiçbir
   * `horses` satırıyla eşleşemez) — bu yüzden yalnızca GERÇEK at
   * katılımcıları sayılır, tam olarak istenen davranış.
   */
  async isPlayerParticipant(raceId: string, playerId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1
       FROM race_entries re
       JOIN horses h ON h.id = re.horse_id
       WHERE re.race_id = $1 AND h.owner_id = $2
       LIMIT 1`,
      [raceId, playerId],
    );
    return result.rows.length > 0;
  }

  /**
   * Oyuncunun oluşturduğu ücretli yarışı yazar (brief §1-§7, §42 PHASE 1).
   *
   * **PARA HAREKETİ YOK** — giriş ücreti yarışa KATILIRKEN alınır (PHASE
   * 1b). Bu yüzden burada `economy_transactions` yazımı, bakiye kilidi
   * veya `applyPracticeRaceStakes` çağrısı YOKTUR; CLAUDE.md kural 7
   * ("PARA/MUTASYON YOLU") bu metoda UYGULANMAZ, çünkü ortada taşınan bir
   * para yoktur.
   *
   * **YİNE DE TRANSACTION ŞARTTIR, İKİ SEBEPTEN:**
   *  1. `maxOpenRacesPerPlayer` tavanı ile `INSERT` arasında boşluk
   *     olmamalı. Sayım tek başına yapılıp sonra yazılsaydı, aynı oyuncunun
   *     eşzamanlı iki isteği ikisi de "2 açık yarışım var" görüp ikisi de
   *     yazardı (tavan 3 iken 4 açık yarış) — `SELECT ... FOR UPDATE`
   *     oyuncunun `players` satırını kilitler ve bu iki isteği SIRAYA
   *     sokar. `PlayerRepository.updateWithLock`'un kullandığı ilkenin
   *     AYNISI, ama burada korunan şey bakiye değil bir SAYI.
   *  2. `SELECT ... FOR UPDATE` aynı zamanda "bu oyuncu gerçekten var mı"
   *     sorusunu da cevaplar: satır yoksa `PlayerNotFoundError` fırlatılır
   *     (`postgres-breeding.repository.ts`'teki AYNI desen). Bu kontrol
   *     olmasaydı `created_by` yabancı anahtarı ham bir Postgres hatası
   *     (`23503 foreign key violation`) verir ve istemci 404/400 yerine
   *     500 görürdü.
   */
  async createLobbyRace(input: CreateLobbyRaceInput): Promise<CreateLobbyRaceResult> {
    return withTransaction(this.pool, async (client) => {
      const owner = await client.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [input.createdBy]);
      if (owner.rows.length === 0) {
        throw new PlayerNotFoundError(input.createdBy);
      }

      // `status = 'scheduled'` = "açık yarış". `in_progress` bir yarış artık
      // koşuyor, `finished`/`cancelled` ise kapanmıştır — hiçbiri tavanı
      // işgal ETMEZ (oyuncu yarışı iptal ederek ya da yarışı koşturarak
      // hakkını geri kazanır; bu, tavanı bir çıkmaz sokak olmaktan çıkarır).
      const open = await client.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM races WHERE created_by = $1 AND status = 'scheduled'",
        [input.createdBy],
      );
      // `COUNT(*)` HER ZAMAN tek satır döndürür (gruplama yok, satır
      // olmasa bile `0` gelir), bu yüzden `rows[0]` garantidir — `?.` ve
      // `?? '0'` yalnızca `noUncheckedIndexedAccess` için, davranışı
      // değiştirmez.
      const openRaces = Number(open.rows[0]?.count ?? '0');
      if (openRaces >= input.maxOpenRaces) {
        return { ok: false, reason: 'RACE_LIMIT_REACHED', openRaces };
      }

      const inserted = await client.query<LobbyRaceRow>(
        `INSERT INTO races (
           id, created_by, name, distance_m, surface, weather,
           participant_limit, max_players, entry_fee, prize_pool, race_type,
           tribune_fee, spectator_capacity, start_time, status, simulation_seed,
           engine_version, ruleset_version, config_version, weather_config_version
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'scheduled', $15, $16, $17, $18, $19)
         RETURNING id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
                   race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at`,
        [
          input.id,
          input.createdBy,
          input.name,
          input.distanceMeters,
          input.surface,
          input.weather,
          input.fieldSize,
          input.maxPlayers,
          input.entryFee,
          input.prizePool,
          input.raceType,
          input.tribuneFee,
          input.spectatorCapacity,
          input.startTime,
          input.simulationSeed,
          input.engineVersion,
          input.rulesetVersion,
          input.configVersion,
          input.weatherConfigVersion,
        ],
      );

      // `INSERT … VALUES (…) RETURNING` ya TAM OLARAK BİR satır döndürür
      // ya da sorgu hata fırlatır; `rows[0]` bu yüzden garantidir. Yine de
      // açıkça kontrol edilir: bu kontrol olmadan, ileride sorguya bir
      // `ON CONFLICT DO NOTHING` eklenirse `rows` boş kalır ve hata
      // sessizce `undefined` bir yarış gövdesine dönüşürdü.
      const insertedRow = inserted.rows[0];
      if (insertedRow === undefined) {
        throw new Error('Yarış INSERT edildi ama RETURNING satırı dönmedi.');
      }

      // `joinedPlayers` BURADA 0'dır ve bu DOĞRUDUR, bir yer tutucu değil:
      // yarış OLUŞTURMAK ile yarışa KATILMAK ayrı işlemlerdir (brief §5
      // lobisinde [JOIN RACE] ayrı bir düğmedir) ve katılmak para hareketi
      // üretir (PHASE 1b). Yarışı açan kişi otomatik olarak katılmış
      // SAYILMAZ — saysaydı, ücretsiz bir "önce katıl sonra ödemeyi
      // düşün" yolu doğardı.
      return { ok: true, race: rowToLobbyRaceView(this.config, insertedRow, 0) };
    });
  }

  /**
   * Oyuncuyu bir lobi yarışına KATAR (brief §2/§3/§6, §42 PHASE 1b) —
   * `RaceRepository.joinLobbyRace` port doc yorumu okunmalıdır.
   *
   * **PARA YOLU (CLAUDE.md kural 7).** Ücret alınıyorsa `players` satırı
   * `FOR UPDATE` ile kilitlenir, bakiye düşülür ve AYNI transaction'da
   * `economy_transactions` defter kaydı yazılır. Üçü birlikte değilse
   * bakiye ile defter ayrışır — denetlenemez hâle gelir.
   *
   * **KİLİT SIRASI: önce `races`, sonra `players`.** Bu sıra SABİTTİR.
   * Aynı yarışa eşzamanlı katılımlar yarış satırında sıraya girer, bu da
   * hem kontenjan kontrolünü hem "zaten katıldı mı" kontrolünü yarışsız
   * kılar; ayrıca iki farklı yarışa katılan aynı oyuncunun istekleri
   * çapraz kilitlenme (deadlock) üretmez.
   *
   * **KONTENJAN `max_players`'DIR, `participant_limit` DEĞİL** (brief §6:
   * "at sayısı ile oyuncu sayısını birbirinden ayır"): 12 atlık bir yarışa
   * 8 gerçek oyuncu + 4 yapay zekâ atı girebilir. `participant_limit`
   * kontrolü `races_max_players_within_field` kısıtı (migration 0036)
   * sayesinde ZATEN gereksizdir — `max_players <= participant_limit`
   * olduğundan oyuncu tavanı dolduğunda at tavanı da dolmuş olur.
   */
  async joinLobbyRace(input: JoinLobbyRaceInput): Promise<RaceLobbyView> {
    return withTransaction(this.pool, async (client) => {
      // 1) Yarış satırını kilitle. Kilit alındıktan SONRA okunan hiçbir şey
      //    yarışın eşzamanlı bir katılımla değişmesinden etkilenmez.
      const raceResult = await client.query<LobbyRaceRow>(
        `SELECT id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at
         FROM races
         WHERE id = $1
         FOR UPDATE`,
        [input.raceId],
      );
      const raceRow = raceResult.rows[0];
      if (raceRow === undefined) {
        throw new RaceNotFoundError(input.raceId);
      }

      // 2) GERÇEK oyuncu sayısı — `player_id` dolu satırlar. Botlar
      //    (`player_id IS NULL`) sayılmaz; brief §6 at/oyuncu ayrımı.
      //    İPTAL EDİLMİŞ katılımlar da sayılmaz (PHASE 4c): ayrılan oyuncu
      //    ücretini geri almıştır, dolayısıyla havuzda payı yoktur ve
      //    koltuğu BOŞTUR. Sayılsaydı lobi "3/8" gösterirken havuz yalnızca
      //    iki kişilik olurdu — gösterilen sayı ile gerçek para ayrışırdı.
      const joinedResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'cancelled') AS count
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL`,
        [input.raceId],
      );
      const joinedPlayers = Number(joinedResult.rows[0]?.count ?? '0');

      // 3) Durum denetimi — SAF fonksiyon (`domain/race/lobby.ts`).
      const rejection = checkRaceJoinable(
        {
          status: raceRow.status,
          startTime: raceRow.start_time,
          maxPlayers: raceRow.max_players,
          joinedPlayers,
        },
        input.now,
      );
      if (rejection === 'FULL') {
        throw new RaceFullError(raceRow.max_players);
      }
      if (rejection !== null) {
        throw new RaceNotJoinableError(rejection);
      }

      // 4) At: var mı, bu oyuncunun mu, sağlıklı mı. ÜÇÜ TEK SORGUDA —
      //    ayrı sorgular arasında atın satılması gibi bir yarış olmaz ve
      //    `horses` satırı burada KİLİTLENMEZ (kilit yalnızca para ve
      //    kontenjan içindir; atın satılması katılımı geçersiz kılmaz,
      //    çünkü `player_id` katılım anında DONAR).
      const horseResult = await client.query<{ owner_id: string; status: string }>(
        'SELECT owner_id, status FROM horses WHERE id = $1',
        [input.horseId],
      );
      const horse = horseResult.rows[0];
      if (horse === undefined) {
        throw new HorseNotFoundError(input.horseId);
      }
      if (horse.owner_id !== input.playerId) {
        throw new HorseNotOwnedError(input.horseId);
      }
      // `horses.status` METİNDİR, boolean bir `injured` sütunu YOKTUR —
      // `join-matchmaking-queue.use-case.ts` ile AYNI kontrol.
      if (horse.status === 'injured') {
        throw new HorseInjuredError(input.horseId);
      }

      // 5) Aynı oyuncu aynı yarışa iki kez giremez (brief §2 — ücret kişi
      //    başına). Kuralın ASIL garantisi `race_entries_race_player_uq`
      //    kısmi tekil indeksidir (migration 0037); bu ön kontrol yalnızca
      //    kullanıcıya 500 yerine anlamlı bir 409 vermek içindir.
      const duplicate = await client.query<{ status: string | null }>(
        'SELECT status FROM race_entries WHERE race_id = $1 AND player_id = $2 LIMIT 1',
        [input.raceId, input.playerId],
      );
      const existingEntry = duplicate.rows[0];
      if (existingEntry !== undefined) {
        // PHASE 4c — AYRILMIŞ oyuncu ile AKTİF katılımcı AYNI hatayı hak
        // etmez: biri "zaten katıldınız" değildir. Gerekçenin tamamı
        // `RaceEntryCancelledError` doc yorumunda.
        if (existingEntry.status === 'cancelled') {
          throw new RaceEntryCancelledError(input.raceId);
        }
        throw new AlreadyJoinedRaceError(input.raceId);
      }

      // 6) Kulvar (brief §7): kullanılmış kulvarların EN KÜÇÜĞÜ boş olanı.
      const gatesResult = await client.query<{ gate_position: number | null }>(
        'SELECT gate_position FROM race_entries WHERE race_id = $1',
        [input.raceId],
      );
      const usedGates = gatesResult.rows
        .map((row) => row.gate_position)
        .filter((gate): gate is number => gate !== null);
      const gatePosition = nextGatePosition(usedGates);

      // 7) ÜCRET — yalnızca ücretli yarışta ve yalnızca sıfırdan büyükse.
      //    `economy_transactions.amount <> 0` kısıtı sıfır tutarlı bir
      //    defter satırını reddeder; bu yüzden ücretsiz yarışta `players`
      //    satırına HİÇ dokunulmaz (gereksiz kilit de alınmaz).
      const entryFee = Number(raceRow.entry_fee);
      let balanceBefore = 0;
      let balanceAfter = 0;
      if (entryFee > 0) {
        const balanceResult = await client.query<{ money: string; gems: string }>(
          'SELECT money, gems FROM players WHERE id = $1 FOR UPDATE',
          [input.playerId],
        );
        const balanceRow = balanceResult.rows[0];
        if (balanceRow === undefined) {
          throw new PlayerNotFoundError(input.playerId);
        }
        balanceBefore = Number(balanceRow.money);
        // `debit` yetersiz bakiyede `InsufficientFundsError` fırlatır —
        // brief §2: "Oyuncu yeterli bakiyeye sahip değilse yarışa katılamaz."
        const wallet = debit({ money: balanceBefore, gems: Number(balanceRow.gems) }, entryFee, 'money');
        balanceAfter = wallet.money;

        await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
          input.playerId,
          balanceAfter,
          input.now,
        ]);

        // brief §3 — havuz `entryFee × katılımcı sayısı` mantığıyla BÜYÜR.
        // Havuzu katılım anında artırmak, yarış açılırken hesaplanan bir
        // "beklenen havuz"dan DAHA dürüsttür: oyuncu lobide gördüğü sayıyı
        // gerçekten kazanır.
        await client.query('UPDATE races SET prize_pool = prize_pool + $2, updated_at = $3 WHERE id = $1', [
          input.raceId,
          entryFee,
          input.now,
        ]);
      }

      // 8) Katılım satırı. `status = 'waiting'` (brief §6): oyuncu READY
      //    düğmesine basana kadar bekler. `player_id` BURADA DONDURULUR.
      //    `horse_snapshot`/segmentler YAZILMAZ — snapshot yarış KOŞARKEN
      //    alınır, katılım anında değil (aynı gerekçe: erken snapshot
      //    donmuş formu dondurur ve oyuncu yarışa kadar antrenman yapamaz).
      try {
        await client.query(
          `INSERT INTO race_entries
             (id, race_id, horse_id, bot_label, jockey_id, player_id, gate_position, tactical_style, risk_level, status, created_at)
           VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, $7, 'waiting', $8)`,
          [
            input.entryId,
            input.raceId,
            input.horseId,
            input.playerId,
            gatePosition,
            input.tacticalStyle,
            input.riskLevel,
            input.now,
          ],
        );
      } catch (err) {
        // Kısmi tekil indeks (`race_entries_race_player_uq`) ihlali: ön
        // kontrolü geçen ama indekse takılan bir durum. Ham Postgres
        // hatasını 500 olarak sızdırmak yerine anlamlı bir 409'a çevrilir.
        if (isUniqueViolation(err, ONE_ENTRY_PER_PLAYER_INDEX)) {
          throw new AlreadyJoinedRaceError(input.raceId);
        }
        throw err;
      }

      // 9) Defter kaydı — bakiye güncellemesiyle AYNI transaction'da.
      if (entryFee > 0) {
        await this.writeLedgerEntries(client, [
          {
            playerId: input.playerId,
            // `savePracticeRaceWithStakes`'in `practice_race_entry_fee`
            // değeriyle AYNI ailede; tip serbest metindir (bkz.
            // `economy-ledger.ts`) ve yeni bir değer migration GEREKTİRMEZ.
            type: 'lobby_race_entry_fee',
            amount: -entryFee,
            currency: 'money',
            referenceType: 'race',
            referenceId: input.raceId,
            balanceBefore,
            balanceAfter,
            idempotencyKey: input.idempotencyKey,
          },
        ]);
      }

      // 10) Güncel görünüm — havuz ve doluluk bu transaction'ın içinde
      //     yeniden okunur (yukarıdaki `raceRow` ücret artışından ÖNCE
      //     okunmuştu; istemciye BAYAT bir havuz dönmemelidir).
      const finalResult = await client.query<LobbyRaceRow>(
        `SELECT id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at
         FROM races
         WHERE id = $1`,
        [input.raceId],
      );
      const finalRow = finalResult.rows[0];
      if (finalRow === undefined) {
        throw new Error('Yarış satırı katılım transaction\'ı içinde okunamadı.');
      }

      return rowToLobbyRaceView(this.config, finalRow, joinedPlayers + 1);
    });
  }

  /**
   * Katılınabilir lobi yarışlarını listeler (brief §5, §42 PHASE 3) —
   * `RaceRepository.listLobbyRaces` port doc yorumu okunmalıdır.
   *
   * **TEK SORGU, `GROUP BY` İLE DOLULUK.** Doluluk `race_entries`'ten
   * TÜRETİLİR (tek doğruluk kaynağı; `races`'te denormalize bir sayaç
   * yoktur — bkz. `rowToLobbyRaceView` doc yorumu). N+1 sorgudan
   * kaçınmak için `LEFT JOIN ... GROUP BY` kullanılır: 20 yarışlık bir
   * liste 20 ayrı `COUNT` sorgusu yerine TEK sorgudur (brief §18).
   *
   * `COUNT(e.player_id)` — `COUNT(*)` DEĞİL. Fark kritiktir: `COUNT(*)`
   * bot satırlarını da sayardı ve lobi "8/8 dolu" gösterirken gerçek
   * oyuncu sayısı 2 olurdu (brief §6: at sayısı ≠ oyuncu sayısı).
   * `LEFT JOIN`'in `ON` koşulundaki `player_id IS NOT NULL` ise bot
   * satırlarını JOIN'e hiç sokmaz — koşul `WHERE`'a yazılsaydı hiç
   * katılımcısı olmayan yarışlar listeden DÜŞERDİ.
   *
   * `FILTER (WHERE e.status IS DISTINCT FROM 'cancelled')` — PHASE 4c.
   * İPTAL EDİLMİŞ katılımı olan oyuncu ücretini geri almıştır ve koltuğu
   * BOŞTUR; sayılsaydı lobi listesi ile `prize_pool` birbirini yalanlardı.
   * `IS DISTINCT FROM` (yalnızca `<> 'cancelled'` DEĞİL) ŞARTTIR: pratik/
   * PvP satırlarında `status` NULL'dur (migration 0037) ve `NULL <> 'x'`
   * sonucu NULL'dur, yani FILTER onları SESSİZCE dışarıda bırakırdı.
   * `FILTER`'ı `ON` koşuluna taşımak ise yanlış olurdu — iptal edilmiş
   * satır JOIN'den düşer ama `LEFT JOIN` sayesinde yarış listede kalır;
   * yine de koşulu tek yerde tutmak (sayım) okunabilirliği artırır.
   *
   * **TRANSACTION YOK** — bilinçlidir: bu yol hiçbir şey yazmaz ve
   * listeyi kilit altına almak, her lobi yenilemesini yarışa katılanların
   * arkasında sıraya sokardı. Görüntünün ANLIK olması yeterlidir.
   */
  async listLobbyRaces(input: ListLobbyRacesInput): Promise<RaceLobbyView[]> {
    const result = await this.pool.query<LobbyRaceRow & { joined_players: string }>(
      `SELECT r.id, r.name, r.participant_limit, r.max_players, r.entry_fee, r.prize_pool,
              r.start_time, r.status, r.race_type, r.surface, r.weather, r.distance_m,
              r.tribune_fee, r.spectator_capacity, r.created_by, r.created_at,
              COUNT(e.player_id) FILTER (WHERE e.status IS DISTINCT FROM 'cancelled') AS joined_players
       FROM races r
       LEFT JOIN race_entries e ON e.race_id = r.id AND e.player_id IS NOT NULL
       WHERE r.status = $1
       GROUP BY r.id
       ORDER BY r.start_time ASC
       LIMIT $2`,
      [input.status, input.limit],
    );

    return result.rows.map((row) => rowToLobbyRaceView(this.config, row, Number(row.joined_players)));
  }

  /**
   * Oyuncunun kendi katılım satırının durumunu değiştirir (brief §6, §42
   * PHASE 3) — `RaceRepository.setEntryReady` port doc yorumu okunmalıdır.
   *
   * **PARA YOLU DEĞİL:** bakiye, `prize_pool` ve deftere dokunulmaz.
   * Transaction yine de ŞARTTIR, ama başka bir sebeple: "yarış hâlâ
   * `scheduled` mı" kontrolü ile yazma arasında yarış başlayabilir ve
   * koşmuş bir yarışa `ready` yazılırdı. Yarış satırı bu yüzden
   * `FOR UPDATE` ile kilitlenir.
   *
   * **KİLİT SIRASI: `races` → `race_entries`.** İlk kilit `joinLobbyRace`
   * ile AYNIdır; bu, aynı yarışa eşzamanlı katılım + READY isteklerinin
   * çapraz kilitlenme (deadlock) üretmemesini sağlar.
   */
  async setEntryReady(input: SetEntryReadyInput): Promise<RaceLobbyView> {
    return withTransaction(this.pool, async (client) => {
      // 1) Yarış satırını kilitle — kilit alındıktan sonra okunan durum
      //    bu transaction boyunca değişmez.
      const raceResult = await client.query<LobbyRaceRow>(
        `SELECT id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at
         FROM races
         WHERE id = $1
         FOR UPDATE`,
        [input.raceId],
      );
      const raceRow = raceResult.rows[0];
      if (raceRow === undefined) {
        throw new RaceNotFoundError(input.raceId);
      }

      // 2) Oyuncunun KENDİ katılım satırı. `player_id` ile filtrelenir:
      //    başkasının satırını değiştirmenin bir yolu YOKTUR, çünkü
      //    `playerId` gövdeden değil `CurrentPlayer()`'dan gelir.
      const entryResult = await client.query<{ status: string | null }>(
        'SELECT status FROM race_entries WHERE race_id = $1 AND player_id = $2 FOR UPDATE',
        [input.raceId, input.playerId],
      );
      const entry = entryResult.rows[0];
      if (entry === undefined) {
        throw new RaceEntryNotFoundError(input.raceId, input.playerId);
      }

      // 3) Durum denetimi — SAF fonksiyon (`domain/race/lobby.ts`).
      const rejection = checkEntryReadyable(
        { status: raceRow.status, startTime: raceRow.start_time },
        { status: entry.status },
        input.now,
      );
      if (rejection !== null) {
        throw new RaceEntryNotReadyableError(rejection);
      }

      // 4) Yaz. Zaten aynı değerdeyse de yazılır — gereksiz bir UPDATE
      //    zararsızdır ve "okuyup karşılaştırma" dalı, `checkEntryReadyable`
      //    ile çakışan İKİNCİ bir kural kaynağı yaratırdı.
      await client.query('UPDATE race_entries SET status = $3 WHERE race_id = $1 AND player_id = $2', [
        input.raceId,
        input.playerId,
        input.status,
      ]);

      // 5) Doluluk. Bu transaction `races` satırını değiştirmediği için
      //    (kilitli `raceRow`) YENİDEN OKUMAYA GEREK YOKTUR — `joinLobbyRace`
      //    havuzu büyüttüğü için orada okumak zorundaydı, burada değil.
      //    İPTAL EDİLMİŞ katılımlar sayılmaz — gerekçe `joinLobbyRace`
      //    adım 2'deki AYNI not (PHASE 4c).
      const joinedResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'cancelled') AS count
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL`,
        [input.raceId],
      );
      const joinedPlayers = Number(joinedResult.rows[0]?.count ?? '0');

      return rowToLobbyRaceView(this.config, raceRow, joinedPlayers);
    });
  }

  /**
   * Oyuncuyu katıldığı lobi yarışından ÇIKARIR ve giriş ücretini İADE eder
   * (brief §20 `REFUND`, §42 PHASE 4c) — `RaceRepository.leaveLobbyRace`
   * port doc yorumu okunmalıdır.
   *
   * **PARA YOLU (CLAUDE.md kural 7) — `joinLobbyRace`'in TAM TERSİ.**
   * Ücret alınırken `prize_pool` BÜYÜTÜLMÜŞTÜ; burada aynı tutar kadar
   * KÜÇÜLTÜLÜR. İkisi simetrik olduğu sürece "havuz = ödenmiş giriş
   * ücretlerinin toplamı" değişmezi korunur — ve bu değişmez, ödül
   * dağıtımının (PHASE 5) dayandığı tek zemindir.
   *
   * **KİLİT SIRASI: `races` → `race_entries` → `players`.** İlk iki adım
   * `setEntryReady` ile, ilk adım `joinLobbyRace` ile AYNIdır; ortak ilk
   * kilit `races` olduğundan bu üç yol arasında çapraz kilitlenme
   * (deadlock) oluşamaz.
   *
   * **İADE TUTARI DEFTERDEN OKUNUR, `races.entry_fee`'DEN DEĞİL.**
   * `entry_fee` bugün değiştirilemez olduğu için ikisi aynı sonucu verirdi;
   * ama "o an geçerli ücret" üzerinden iade hesaplamak, ücret bir gün
   * güncellenebilir hâle geldiğinde sessizce YANLIŞ tutar iade ederdi.
   * Defter zaten "bu oyuncu bu yarışa ne ödedi" sorusunun tek doğruluk
   * kaynağıdır. Ücretsiz yarışta hiç satır yoktur → `refund = 0` → para
   * yoluna HİÇ girilmez (ne kilit, ne defter satırı).
   */
  async leaveLobbyRace(input: LeaveLobbyRaceInput): Promise<RaceLobbyView> {
    return withTransaction(this.pool, async (client) => {
      // 1) Yarış satırını kilitle — kilit alındıktan sonra okunan durum bu
      //    transaction boyunca değişmez (`setEntryReady` ile AYNI gerekçe).
      const raceResult = await client.query<LobbyRaceRow>(
        `SELECT id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at
         FROM races
         WHERE id = $1
         FOR UPDATE`,
        [input.raceId],
      );
      const raceRow = raceResult.rows[0];
      if (raceRow === undefined) {
        throw new RaceNotFoundError(input.raceId);
      }

      // 2) Oyuncunun KENDİ katılım satırı — `player_id` ile filtrelenir, yani
      //    başkasının katılımını iptal etmenin bir yolu YOKTUR (`playerId`
      //    gövdeden değil `CurrentPlayer()`'dan gelir).
      const entryResult = await client.query<{ status: string | null }>(
        'SELECT status FROM race_entries WHERE race_id = $1 AND player_id = $2 FOR UPDATE',
        [input.raceId, input.playerId],
      );
      const entry = entryResult.rows[0];
      if (entry === undefined) {
        throw new RaceEntryNotFoundError(input.raceId, input.playerId);
      }

      // 3) Durum denetimi — SAF fonksiyon (`domain/race/lobby.ts`).
      const rejection = checkRaceLeavable(
        { status: raceRow.status, startTime: raceRow.start_time },
        { status: entry.status },
        input.now,
      );
      if (rejection !== null) {
        throw new RaceEntryNotLeavableError(rejection);
      }

      // 4) Bu oyuncunun bu yarış için GERÇEKTEN ödediği tutar. `amount`
      //    defterde İMZALIDIR (ödeme negatiftir), bu yüzden işaret çevrilir.
      //    `Math.max(0, ...)` bir güvenlik kemeridir: iade ASLA negatif
      //    olamaz — bozuk bir satır iadeyi "geri alma"ya çevirmemelidir.
      const paidResult = await client.query<{ amount: string }>(
        `SELECT amount
         FROM economy_transactions
         WHERE player_id = $1
           AND type = 'lobby_race_entry_fee'
           AND reference_type = 'race'
           AND reference_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [input.playerId, input.raceId],
      );
      const paidRow = paidResult.rows[0];
      const refund = paidRow === undefined ? 0 : Math.max(0, -Number(paidRow.amount));

      let balanceBefore = 0;
      let balanceAfter = 0;

      // 5) İADE — yalnızca gerçekten ödenmiş bir tutar varsa. Ücretsiz
      //    yarışta `players` satırına HİÇ dokunulmaz (gereksiz kilit de
      //    alınmaz), `joinLobbyRace` adım 7 ile AYNI desen.
      if (refund > 0) {
        const balanceResult = await client.query<{ money: string; gems: string }>(
          'SELECT money, gems FROM players WHERE id = $1 FOR UPDATE',
          [input.playerId],
        );
        const balanceRow = balanceResult.rows[0];
        if (balanceRow === undefined) {
          throw new PlayerNotFoundError(input.playerId);
        }
        balanceBefore = Number(balanceRow.money);
        const wallet = credit({ money: balanceBefore, gems: Number(balanceRow.gems) }, refund, 'money');
        balanceAfter = wallet.money;

        await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
          input.playerId,
          balanceAfter,
          input.now,
        ]);

        // Havuzu KÜÇÜLT. `prize_pool >= 0` CHECK'i (migration 0006) burada
        // bir TRIPWIRE'dır, bir iş kuralı değil: iade tam olarak katılımda
        // eklenen tutardır, dolayısıyla negatife düşmesi İMKÂNSIZDIR.
        // Düşerse gerçek bir muhasebe bozulması vardır ve bu sessizce
        // yutulmamalıdır — 500 doğru cevaptır, `GREATEST(..., 0)` yanlış
        // olurdu (havuzu gerçek paradan bağımsız gösterirdi).
        await client.query('UPDATE races SET prize_pool = prize_pool - $2, updated_at = $3 WHERE id = $1', [
          input.raceId,
          refund,
          input.now,
        ]);
      }

      // 6) Katılımı İPTAL et. Satır SİLİNMEZ — `race_entries_race_player_uq`
      //    (migration 0037) `status`'tan bağımsız olarak `player_id` dolu her
      //    satırı kapsar, yani silmek yeniden katılmayı AÇARDI. Bu bilinçli
      //    olarak İSTENMEZ: bkz. `RaceEntryCancelledError` doc yorumu.
      await client.query('UPDATE race_entries SET status = $3 WHERE race_id = $1 AND player_id = $2', [
        input.raceId,
        input.playerId,
        'cancelled',
      ]);

      // 7) Defter kaydı — bakiye güncellemesiyle AYNI transaction'da.
      if (refund > 0) {
        await this.writeLedgerEntries(client, [
          {
            playerId: input.playerId,
            // `REFUND` ailesinin bu projedeki İLK üreticisi (bkz. use-case
            // doc yorumu). Tip serbest metindir (`economy-ledger.ts`), yeni
            // bir değer migration GEREKTİRMEZ.
            type: 'race_entry_refund',
            amount: refund,
            currency: 'money',
            referenceType: 'race',
            referenceId: input.raceId,
            balanceBefore,
            balanceAfter,
            idempotencyKey: input.idempotencyKey,
          },
        ]);
      }

      // 8) Güncel görünüm. `raceRow` havuz düşümünden ÖNCE okunmuştu;
      //    istemciye BAYAT bir havuz dönmemelidir (`joinLobbyRace` adım 10
      //    ile AYNI gerekçe).
      const finalResult = await client.query<LobbyRaceRow>(
        `SELECT id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at
         FROM races
         WHERE id = $1`,
        [input.raceId],
      );
      const finalRow = finalResult.rows[0];
      if (finalRow === undefined) {
        throw new Error('Yarış satırı ayrılma transaction\'ı içinde okunamadı.');
      }

      // Doluluk İPTAL EDİLMİŞ satırları SAYMAZ: ayrılan oyuncunun koltuğu
      // boşalmıştır (gerekçe `joinLobbyRace` adım 2'deki not).
      const joinedResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'cancelled') AS count
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL`,
        [input.raceId],
      );

      return rowToLobbyRaceView(this.config, finalRow, Number(joinedResult.rows[0]?.count ?? '0'));
    });
  }

  /**
   * `savePracticeRace`/`savePvpMatch`'in PAYLAŞTIĞI `races` satırı ekleme
   * sorgusu (DRY).
   *
   * AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — `engine_version`/
   * `ruleset_version`/`config_version` (migration 0021) burada YAZILIR.
   * Bu üç değer `race` nesnesinin KENDİSİNDEN gelir (çağıran use-case'ler
   * `RACE_ENGINE_VERSION`/`RACE_RULESET_VERSION`/`raceConfig.version`'ı
   * `Race` nesnesini oluştururken doldurur) — bu repository'nin KENDİSİ
   * hiçbir versiyon sabiti BİLMEZ/İMPORT ETMEZ, sadece kendisine verileni
   * yazar (Infrastructure katmanının Domain sabitlerine değil, yalnızca
   * Application'ın ürettiği DEĞERE bağımlı olması — docs/ARCHITECTURE.md §4).
   *
   * AUDIT_REPORT.md R1 (bu oturum) — `weather_config_version` (migration
   * 0024) da AYNI desenle burada yazılır: `race.weatherConfigVersion`,
   * çağıran use-case'in `this.config.weather.version`'ı `Race` nesnesini
   * oluştururken doldurmasından gelir.
   */
  private async insertRaceRow(client: PoolClient, race: Race): Promise<void> {
    await client.query(
      // Migration 0036 (brief §42 PHASE 1) — `max_players` ve `race_type`
      // BU SORGUYA EKLENDİ ve ikisi de ZORUNLUDUR, isteğe bağlı değil:
      //
      //  - `max_players`: 0036 sütunu önce NULL ekleyip mevcut satırları
      //    `participant_limit` ile DOLDURDU, sonra `SET NOT NULL` yaptı ve
      //    bilinçli olarak `DEFAULT` VERMEDİ. Yani bu satır eklenmeseydi
      //    pratik yarış/PvP INSERT'i `23502 not-null violation` ile
      //    düşerdi — üstelik yalnızca ÜRETİMDE, çünkü testler eski şemada
      //    geçmiş olurdu. Değer `participant_limit`'in AYNISIDIR ve bu
      //    DOĞRUDUR: sunucu üretimi bir yarışta "oyuncu tavanı" diye ayrı
      //    bir kavram yoktur, tüm koltuklar at içindir (brief §6'nın
      //    `max_players < participant_limit` durumu yalnızca OYUNCUNUN
      //    açtığı yarışlarda anlamlıdır — kalan koltuklar AI ile dolar).
      //
      //  - `race_type`: sütunun `DEFAULT 'free'` değeri VAR ama bu değere
      //    GÜVENİLEMEZ. `races_race_type_matches_fee` kısıtı
      //    `(race_type = 'paid') = (entry_fee > 0)` der; pratik yarışların
      //    giriş ücreti 100/250/500/1000/2000'dir, yani varsayılana
      //    bırakılsaydı `free` + `entry_fee > 0` çelişkisi kısıtı ihlal
      //    eder ve HER pratik yarış düşerdi. Bu yüzden tip, ücretten
      //    TÜRETİLİR — migration 0036'nın backfill'inde kullanılan
      //    `CASE`in BİREBİR AYNISI (tek doğruluk kaynağı: `entry_fee`).
      //
      // `tribune_fee`/`spectator_capacity` BİLİNÇLİ olarak yazılmaz:
      // varsayılanları (0 ve 500) sunucu üretimi yarışlar için doğrudur —
      // böyle bir yarışın tribünü ücretsizdir ve config'teki en küçük
      // kapasiteyi alır.
      `INSERT INTO races (id, track_id, name, distance_m, surface, weather, temperature_c, wind_kmh, humidity_pct, participant_limit, max_players, race_type, entry_fee, prize_pool, start_time, status, simulation_seed, engine_version, ruleset_version, config_version, weather_config_version, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL, NULL, $7, $7, CASE WHEN $8::bigint > 0 THEN 'paid' ELSE 'free' END, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)`,
      [
        race.id,
        race.name,
        race.distanceMeters,
        race.surface,
        race.weather,
        race.temperatureC,
        race.participantLimit,
        race.entryFee,
        race.prizePool,
        new Date(race.startTime),
        race.status,
        race.simulationSeed,
        race.engineVersion,
        race.rulesetVersion,
        race.configVersion,
        race.weatherConfigVersion,
        new Date(race.createdAt),
      ],
    );
  }

  /**
   * `savePracticeRace`/`savePracticeRaceWithStakes`/`savePvpMatch`'in
   * PAYLAŞTIĞI `race_entries` + `race_entry_segments` ekleme sorguları (DRY).
   *
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `bot_label` sütunu
   * eklendi (migration 0025): `entry.horseId` null İSE bu bir bot
   * girişidir, `entry.botLabel` yazılır; aksi halde (gerçek at) `bot_label`
   * NULL kalır. Veritabanının kendi CHECK kısıtı (`race_entries_horse_xor_
   * bot_chk`) ikisinin BİRDEN dolu/boş olmasını zaten engeller — burada
   * `entry.horseId`/`entry.botLabel`'in KENDİSİ olduğu gibi yazılır.
   */
  private async insertEntryWithSegments(client: PoolClient, entry: RaceEntry, segments: RaceSegmentSnapshot[]): Promise<void> {
    await client.query(
      // AUDIT_REPORT.md Bulgu R3 (bu oturum) — bu INSERT'te DAHA ÖNCE
      // `gate_position` sütunu `jockey_id` ile AYNI satırda hardcoded
      // `NULL` yazıyordu (gerçek jokey sistemi henüz yokken kopyalanmış
      // eski bir yer tutucu) — yani `entry.gatePosition` (bkz.
      // `gate-assignment.ts`, `run-practice-race`/`join-matchmaking-queue`
      // use-case'leri) DOĞRU hesaplanıyordu ama BURADA hiç parametre
      // olarak geçilmediğinden DB'ye HER ZAMAN null yazılıyordu — bu,
      // CI #129'un `race-timeline.e2e-spec.ts`'te GERÇEKTEN yakaladığı
      // hataydı (`gatePositions.every(gp => gp !== null)` false döndü).
      // `jockey_id` gerçek bir jokey sistemi olmadığından hâlâ BİLİNÇLİ
      // olarak hardcoded `NULL` kalıyor — yalnızca `gate_position` artık
      // gerçek bir parametre (`$5`).
      `INSERT INTO race_entries (id, race_id, horse_id, bot_label, jockey_id, gate_position, tactical_style, risk_level, horse_snapshot, final_time_ms, finish_position, performance_score, created_at)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        entry.id,
        entry.raceId,
        entry.horseId,
        entry.botLabel,
        entry.gatePosition,
        entry.tacticalStyle,
        entry.riskLevel,
        JSON.stringify(entry.horseSnapshot),
        entry.finalTimeMs,
        entry.finishPosition,
        entry.performanceScore,
        new Date(entry.createdAt),
      ],
    );

    if (segments.length === 0) {
      return;
    }

    // AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — botlar da artık
    // segment yazdığından (önceden yalnızca 1 katılımcı × ~8 segment,
    // şimdi TÜM katılımcılar × ~8 segment), segment BAŞINA ayrı bir
    // `client.query()` round-trip'i (`race.e2e-spec.ts`'in n=100
    // eşzamanlılık testlerinin CI #93-109'da onlarca turda stabilize
    // edildiği, GERÇEK zamanlama hassasiyeti olan bir ortam) katılımcı
    // sayısıyla ORANTILI olarak ÇOĞALIRDI. Bunun yerine TEK bir çoklu-satır
    // INSERT — round-trip sayısı katılımcı/segment sayısından BAĞIMSIZ
    // olarak sabit kalır (entry başına 1 sorgu).
    const values: unknown[] = [];
    const rowPlaceholders = segments.map((segment, index) => {
      // 14 sütun (migration 0029 iki tane daha ekledi) — `base` çarpanı ve
      // aşağıdaki `values.push` sırası ile `$${base + n}` numaralandırması
      // ÜÇÜ BİRLİKTE değişmelidir; biri güncellenip diğeri unutulursa
      // Postgres ya "bind message supplies N parameters" ya da SESSİZCE
      // KAYMIŞ değerler döndürür.
      const base = index * 14;
      values.push(
        entry.id,
        segment.segmentDistanceMeters,
        segment.timestampMs,
        segment.positionMeters,
        segment.speed,
        segment.stamina,
        segment.fatigue,
        // `?? null` — bu iki alan `RaceSegmentSnapshot`'ta opsiyoneldir
        // (bkz. o arayüzün doc yorumu). `undefined` Postgres sürücüsüne
        // gönderilirse sütun NULL yerine hata verebilir; açıkça NULL'a
        // çevrilir.
        segment.fatigueLevel ?? null,
        segment.paceScore ?? null,
        segment.lane,
        segment.tacticalState,
        segment.currentRank,
        segment.blocked,
        segment.decision,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14})`;
    });

    await client.query(
      `INSERT INTO race_entry_segments (race_entry_id, segment_distance_m, timestamp_ms, position_m, speed, stamina, fatigue, fatigue_level, pace_score, lane, tactical_state, current_rank, blocked, jockey_decision)
       VALUES ${rowPlaceholders.join(', ')}`,
      values,
    );
  }
}
