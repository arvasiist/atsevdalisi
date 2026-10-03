import { computeRaceXp } from '../../domain/progression/progression';
import { awardXpInTransaction } from '../progression/award-xp';
import { addClubPointsInTransaction } from '../club/postgres-club.repository';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  HorseStatus,
  PracticeRaceResult,
  PvpMatch,
  Race,
  RaceEntrantSnapshot,
  RaceEntry,
  RaceJockeyDecision,
  RaceEntryStatus,
  RaceLobbyListItem,
  RaceLobbyView,
  RaceSegmentSnapshot,
  RaceSettlementPlace,
  RaceSettlementResult,
  RaceStatus,
  RaceSurface,
  RaceTimelineEntrantView,
  RaceTimelineView,
  RaceWeather,
  RecentRaceResultView,
  RacingStyle,
  RiskLevel,
} from '@at-sevdalisi/shared-types';
import type {
  CreateLobbyRaceInput,
  CreateLobbyRaceResult,
  CreateCalendarRaceInput,
  CreateTournamentRaceInput,
  DropUnreadyLobbyEntriesResult,
  InteractiveRaceRecord,
  StartInteractiveRaceInput,
  JoinLobbyRaceInput,
  LeaveLobbyRaceInput,
  ListLobbyRacesInput,
  LockLobbyRaceInput,
  LobbySettlementContext,
  LobbySettlementEntrant,
  RaceRepository,
  SavePracticeRaceWithStakesInput,
  TournamentInfo,
  SavePracticeRaceWithStakesResult,
  SavePvpMatchWithRatingsInput,
  SavePvpMatchWithRatingsResult,
  SetEntryReadyInput,
  SettleLobbyRaceInput,
} from '../../application/ports/race.repository';
import type { EconomyLedgerEntryInput } from '../../application/ports/economy-ledger';
import { applyPracticeRaceStakes } from '../../domain/race/prize';
import { pickStartingStats } from '../../domain/race/entrant-snapshot';
// PHASE 7.1 — config'ten gelen tribün değerlerinin çalışma zamanı doğrulaması
// (`insertRaceRow`), `assertTicketPriceIsValid` doc yorumundaki gerekçe.
import {
  assertSpectatorCapacityIsValid,
  assertTicketPriceIsValid,
} from '../../domain/grandstand/ticket';
import {
  describeRacePrizeEconomics,
  resolvePrizeDistribution,
} from '../../domain/race/prize-distribution';
import { AppConfigService } from '../config/config.service';
import {
  checkEntryReadyable,
  checkRaceJoinable,
  checkRaceLeavable,
  checkRaceLockable,
  checkRaceSettleable,
  nextGatePosition,
} from '../../domain/race/lobby';
import {
  AlreadyJoinedRaceError,
  HorseNotOwnedError,
  HorseNotReadyToRaceError,
  RaceEntryCancelledError,
  RaceEntryNotFoundError,
  RaceEntryNotLeavableError,
  RaceEntryNotReadyableError,
  RaceFullError,
  RaceNotJoinableError,
  RaceNotFoundError,
  RaceNotSettleableError,
} from '../../domain/race/errors';
import {
  HorseInActiveRaceError,
  HorseInjuredError,
  HorseListedInMarketError,
  HorseNotFoundError,
} from '../../domain/horse/errors';
import { credit, debit } from '../../domain/economy/wallet';
import {
  buildPrizeWonPayload,
  buildRaceFinishedPayload,
  buildRaceStartingPayload,
} from '../../domain/social/notification';
import { applyEloUpdate } from '../../domain/online/elo';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PG_POOL, withTransaction } from '../database/database.module';
import { isHorseInActiveRace } from '../horse/active-race-entry';
import type { PlayerCommandLog } from '../../domain/race/interactive-race';
import { PlayerLevelTooLowError } from '../../domain/tournament/errors';
import { checkRaceReadiness } from '../../domain/race/readiness';

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
 * Bir BOT katılım satırının snapshot'ını döndürür; yoksa PATLAR
 * (§42 PHASE 2).
 *
 * **NEDEN `?? null` İLE GEÇİŞTİRİLMEDİ:** `RaceEntry.horseSnapshot`
 * NULLABLE bir alandır (gerçek atlar için kilit anında yazılır, eski
 * satırlarda hiç yoktur). Botlar için ise snapshot **her zaman** vardır —
 * `generateBotEntrants` onu simülasyon için ÜRETİR ve `settle-race.use-case`
 * doğrudan o nesneyi geçirir. `null` gelmesi bir bütünlük hatasıdır ve
 * sıfırlarla bir `startingStats` uydurmak, sonuç yanıtına **yanlış**
 * sayılar koymak olurdu (hiçbir yerde hata çıkmadan).
 */
function assertBotSnapshot(entry: RaceEntry): RaceEntrantSnapshot {
  if (entry.horseSnapshot === null) {
    throw new Error(
      `Bot katılım satırının (${entry.id}) snapshot'ı yok — simülasyon girdisi eksik.`,
    );
  }
  return entry.horseSnapshot;
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
  player_control: boolean;
}

/**
 * Kesinleşme (`findLobbySettlementContext`/`settleLobbyRace`) için `races`
 * satır şekli (§42 PHASE 13.14).
 *
 * `entry_fee`/`prize_pool` BIGINT'tir → `pg` bunları STRING döner
 * (`LobbyRaceRow` ile AYNI not). `temperature_c`/`wind_kmh`/`humidity_pct`
 * NUMERIC'tir → onlar da STRING'dir ve `Number(...)`'a çevrilir; üçü de
 * NULLABLE olduğundan önce `null` kontrolü yapılır (`Number(null)` 0
 * verirdi ve "sıcaklık 0 °C" gibi YANLIŞ bir simülasyon girdisi doğardı).
 */
interface SettlementRaceRow {
  id: string;
  name: string;
  participant_limit: number;
  max_players: number;
  entry_fee: string;
  prize_pool: string;
  start_time: Date;
  status: string;
  surface: string;
  weather: string;
  distance_m: number;
  temperature_c: string | null;
  wind_kmh: string | null;
  humidity_pct: string | null;
  created_by: string | null;
  created_at: Date;
  /**
   * PHASE 1 (migration 0042) — kilitlenme anında dondurulan seed. `null`
   * ise seed henüz üretilmemiştir (zamanlayıcı çalışmadı) ve kesinleşme
   * kendi seed'ini üretir.
   */
  simulation_seed: string | null;
  /** 01.10.2026 (migration 0054). Kilit sorgusu bu iki sütunu seçmez → opsiyonel. */
  player_control?: boolean;
  live_starts_at?: Date | null;
}

/** `findLobbySettlementContext`'in `race_entries` satır şekli. */
interface SettlementEntryRow {
  id: string;
  horse_name: string | null;
  player_id: string | null;
  horse_id: string | null;
  tactical_style: string | null;
  risk_level: string | null;
  gate_position: number | null;
  /** PHASE 6.2 — kilit anında yazılır (`lockLobbyRace`). */
  jockey_id: string | null;
  /** 01.10.2026 (migration 0054) — oyuncunun segment komutları. */
  player_commands: PlayerCommandLog;
  /**
   * PHASE 1 (migration 0042) — `startTime` anında dondurulmuş hâl.
   * `null` ise kilit hiç çalışmamıştır.
   *
   * TİP `unknown`: JSONB sütunu teorik olarak her şeyi içerebilir.
   * Doğrudan `RaceEntrantSnapshot` diye tip vermek, veritabanındaki bozuk
   * bir değeri sessizce sözleşmeye sokardı. Çağıran (`settle-race.
   * use-case.ts`) `null` olmayanı `as RaceEntrantSnapshot` ile geçirir —
   * bu kabul edilebilir çünkü değeri YALNIZCA bu repository'nin kendisi
   * yazar (`lockLobbyRace`) ve `JSON.stringify(buildHorseEntrantSnapshot(...))`
   * ile yazar.
   */
  horse_snapshot: unknown;
}

/**
 * `LobbyRaceRow` → `RaceLobbyView`. `joinedPlayers` PARAMETRE olarak
 * alınır, satırdan okunmaz: `races` tablosunda böyle bir sütun YOKTUR ve
 * olmamalıdır da — katılımcı sayısı `race_entries`'ten TÜRETİLİR (tek
 * doğruluk kaynağı), denormalize bir sayaç ise iki kaynağın ayrışması
 * demek olurdu. Bu metot yalnızca `races` satırını gördüğü için sayıyı
 * çağırandan alır.
 */
function rowToLobbyRaceView(
  config: AppConfigService,
  row: LobbyRaceRow,
  joinedPlayers: number,
): RaceLobbyView {
  // §42 PHASE 5 — ÖDÜL EKONOMİSİ (brief §3/§4). Havuz `races.prize_pool`
  // sütunudur (katılımda büyür, ayrılmada küçülür); çarpan ve kazanan
  // ödülü ONDAN türetilir. `null` çarpan = "bu yarışta gösterilecek çarpan
  // yok" (ücretsiz yarış ya da henüz katılım yok) — istemci bu durumda
  // çarpanı hiç göstermez, `0.00x` göstermez.
  const shares =
    resolvePrizeDistribution(config.economy, config.raceLobby.prizeDistributionId)?.shares ?? [];
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
    playerControl: row.player_control,
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
interface InteractiveRaceRow {
  id: string;
  player_id: string;
  horse_id: string;
  tier_id: string;
  simulation_seed: string;
  tactic: InteractiveRaceRecord['tactic'];
  entrants: InteractiveRaceRecord['entrants'];
  jockey_id: string | null;
  entry_fee: string;
  distance_m: number;
  surface: string;
  weather: string;
  commands: PlayerCommandLog;
  starts_at: Date;
  status: 'running' | 'finished';
  finished_at: Date | null;
  result: PracticeRaceResult | null;
}

function rowToInteractiveRace(row: InteractiveRaceRow): InteractiveRaceRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    horseId: row.horse_id,
    tierId: row.tier_id,
    simulationSeed: row.simulation_seed,
    tactic: row.tactic,
    entrants: row.entrants,
    jockeyId: row.jockey_id,
    // `pg` BIGINT'i metin döner (CLAUDE.md).
    entryFee: Number(row.entry_fee),
    distanceMeters: row.distance_m,
    surface: row.surface,
    weather: row.weather,
    commands: row.commands,
    startsAt: row.starts_at,
    status: row.status,
    finishedAt: row.finished_at,
    result: row.result,
  };
}

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

  async savePracticeRace(
    race: Race,
    entry: RaceEntry,
    segments: RaceSegmentSnapshot[],
  ): Promise<void> {
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
  async savePracticeRaceWithStakes(
    input: SavePracticeRaceWithStakesInput,
  ): Promise<SavePracticeRaceWithStakesResult> {
    return withTransaction(this.pool, (client) =>
      this.savePracticeRaceInTransaction(client, input),
    );
  }

  /**
   * 01.10.2026 — `savePracticeRaceWithStakes`in gövdesi, çağıranın
   * transaction'ında. Oyuncu kontrollü yarışın kesinleşmesi de bunu kullanır
   * (oturum satırı kilitliyken) — iki ayrı kayıt yolu ayrışamaz.
   */
  private async savePracticeRaceInTransaction(
    client: PoolClient,
    input: SavePracticeRaceWithStakesInput,
  ): Promise<SavePracticeRaceWithStakesResult> {
    {
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

      await client.query(
        'UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1',
        [input.playerId, balanceAfter.money, balanceAfter.gems, new Date()],
      );

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

      // 01.10.2026 — XP: oyuncu ve atı, para ile AYNI transaction'da (bkz.
      // `awardXpInTransaction`). İlk giriş oyuncunun kendi atıdır (port sözleşmesi).
      const ownEntry = input.entries[0];
      const progression = this.config.progression;
      await awardXpInTransaction(
        client,
        'players',
        input.playerId,
        computeRaceXp(ownEntry?.finishPosition ?? null, progression.xpRewards.player),
        progression,
      );
      // Kulüp katkısı: oyuncunun yarış XP'si kulüp puanına da yazılır (aynı transaction).
      await addClubPointsInTransaction(
        client,
        input.playerId,
        computeRaceXp(ownEntry?.finishPosition ?? null, progression.xpRewards.player),
        this.config.online,
      );
      if (ownEntry?.horseId) {
        await awardXpInTransaction(
          client,
          'horses',
          ownEntry.horseId,
          computeRaceXp(ownEntry.finishPosition ?? null, progression.xpRewards.horse),
          progression,
        );
      }

      // AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `input.entry`/
      // `input.segments` (tekil) yerine `input.entries` (oyuncu + TÜM bot
      // rakipler) — bkz. port doc yorumu, `savePvpMatch`'teki AYNI
      // "her katılımcı için bir kez insertEntryWithSegments" deseni.
      for (const entry of input.entries) {
        const entrySegments = input.segments.filter((segment) => segment.raceEntryId === entry.id);
        await this.insertEntryWithSegments(client, entry, entrySegments);
      }

      return balanceAfter;
    }
  }

  /** `savePracticeRaceWithStakes`'in yazdığı `economy_transactions` satırları — `PostgresPlayerRepository.writeLedgerEntries` ile AYNI desen (bu port `PlayerRepository`'yi kullanmadığından kendi kopyasını taşır). */
  private async writeLedgerEntries(
    client: PoolClient,
    entries: EconomyLedgerEntryInput[],
  ): Promise<void> {
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
        [
          match.id,
          race.id,
          playerAId,
          playerBId,
          match.winnerId,
          match.status,
          new Date(match.createdAt),
        ],
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
  async savePvpMatchWithRatings(
    input: SavePvpMatchWithRatingsInput,
  ): Promise<SavePvpMatchWithRatingsResult> {
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

      const eloResult = applyEloUpdate(
        ratingABefore,
        ratingBBefore,
        input.scoreA,
        input.onlineConfig,
      );
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
  async findRecentResultsByOwnerId(
    ownerId: string,
    limit: number,
  ): Promise<RecentRaceResultView[]> {
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
  async findRecentResultsByHorseId(
    horseId: string,
    limit: number,
  ): Promise<RecentRaceResultView[]> {
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
  async findJockeyPairAveragePerformance(horseId: string, jockeyId: string): Promise<number | null> {
    // `performance_score` NUMERIC → metin döner; `Number(...)` şart.
    const result = await this.pool.query<{ average: string | null }>(
      `SELECT AVG(performance_score) AS average
       FROM race_entries
       WHERE horse_id = $1::uuid AND jockey_id = $2::uuid AND performance_score IS NOT NULL`,
      [horseId, jockeyId],
    );
    const average = result.rows[0]?.average;
    return average == null ? null : Number(average);
  }

  async findRaceStatus(raceId: string): Promise<RaceStatus | null> {
    const result = await this.pool.query<{ status: RaceStatus }>(
      'SELECT status FROM races WHERE id = $1::uuid',
      [raceId],
    );
    return result.rows[0]?.status ?? null;
  }

  async findTimelineByRaceId(raceId: string): Promise<RaceTimelineView | null> {
    const raceResult = await this.pool.query<{
      distance_m: number;
      surface: string;
      weather: string;
      simulation_seed: string | null;
    }>(
      // 01.10.2026 — tohum YALNIZCA bitmiş yarışta döner. Kilitli (`locking`)
      // yarışın tohumu kilit anında doğar; kesinleşmeden önce görünseydi
      // katılımcı sonucu (ve oyuncu kontrollü yarışta en iyi komutları)
      // önceden hesaplayabilirdi.
      `SELECT distance_m, surface, weather,
              CASE WHEN status = 'finished' THEN simulation_seed ELSE NULL END AS simulation_seed
       FROM races WHERE id = $1`,
      [raceId],
    );
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
      const owner = await client.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [
        input.createdBy,
      ]);
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
           engine_version, ruleset_version, config_version, weather_config_version, player_control
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'scheduled', $15, $16, $17, $18, $19, $20)
         RETURNING id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
                   race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at, player_control`,
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
          input.playerControl,
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
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at, player_control
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

      // 3b) TURNUVA SEVİYE ŞARTI (30.09.2026, migration 0045). Yarış bir
      //     turnuva finaliyse oyuncunun seviyesi kademenin şartını
      //     karşılamalıdır (`domain/tournament` → `PlayerLevelTooLowError`).
      //     Para hareketinden ÖNCE — reddedilen katılımda Çip oynamaz.
      const tournamentGate = await client.query<{ min_player_level: number; level: number }>(
        `SELECT t.min_player_level, p.level
         FROM tournaments t, players p
         WHERE t.race_id = $1 AND p.id = $2`,
        [input.raceId, input.playerId],
      );
      const gate = tournamentGate.rows[0];
      if (gate !== undefined && Number(gate.level) < gate.min_player_level) {
        throw new PlayerLevelTooLowError(Number(gate.level), gate.min_player_level);
      }

      // 4) At: var mı, bu oyuncunun mu, sağlıklı mı — satır KİLİTLİ.
      //    30.09.2026 DÜZELTMESİ: bu adım eskiden `horses` satırını
      //    KİLİTLEMİYORDU ve "atın satılması katılımı geçersiz kılmaz,
      //    `player_id` donar" diyordu. Sonucu: katılımdan sonra satılan at
      //    ESKİ sahibi adına koşuyor ve ödülü SATICI alıyordu; ayrıca aynı
      //    at aynı anda birden çok açık yarışa yazılabiliyordu. Artık:
      //    (a) satır `FOR UPDATE` ile kilitlenir — pazar satın alması
      //        (`PostgresMarketPurchaseRepository`) AYNI satırı kilitlediği
      //        için "aynı anda katıl + sat" sıraya girer;
      //    (b) pazarda aktif ilanı olan at katılamaz (pratik yarış ve
      //        antrenmanla AYNI kural, `HorseListedInMarketError`);
      //    (c) başka bir açık (`scheduled`/`locking`) yarışa kayıtlı at
      //        katılamaz (`isHorseInActiveRace` — tek tanım).
      //    KİLİT SIRASI: `races` → `horses` → `players`. Pazar yolu
      //    `market_listings` → `horses` → `players`; ikisi de `horses`u
      //    `players`tan önce kilitler, çapraz kilitlenme doğmaz.
      const horseResult = await client.query<{
        owner_id: string;
        status: string;
        health: number;
        fitness: number;
        fatigue: number;
        energy: number;
        morale: number;
      }>(
        'SELECT owner_id, status, health, fitness, fatigue, energy, morale FROM horses WHERE id = $1 FOR UPDATE',
        [input.horseId],
      );
      const horse = horseResult.rows[0];
      if (horse === undefined) {
        throw new HorseNotFoundError(input.horseId);
      }
      if (horse.owner_id !== input.playerId) {
        throw new HorseNotOwnedError(input.horseId);
      }
      if (horse.status === 'injured') {
        throw new HorseInjuredError(input.horseId);
      }
      // HAZIRLIK KAPISI (30.09.2026, `FINAL_PROJECT_AUDIT.md` #8) —
      // `domain/race/readiness.ts` kendini "yarışa girebilir mi"nin TEK
      // karar noktası diye tanımlar ama bu yol onu çağırmıyordu: enerjisi
      // bitmiş ya da aşırı yorgun bir at pratik yarışa giremediği hâlde
      // PARA ÖDENEN yarışa girebiliyordu. Kontrol para hareketinden ÖNCE ve
      // at satırı kilitliyken koşar; `HORSE_INJURED` sözleşmesi korunur.
      const readiness = checkRaceReadiness(
        horse.status as HorseStatus,
        {
          health: Number(horse.health),
          fitness: Number(horse.fitness),
          fatigue: Number(horse.fatigue),
          energy: Number(horse.energy),
          morale: Number(horse.morale),
        },
        this.config.race.readiness,
      );
      if (!readiness.ready && readiness.reason !== null) {
        throw new HorseNotReadyToRaceError(readiness.reason);
      }
      const listedResult = await client.query(
        "SELECT 1 FROM market_listings WHERE horse_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > $2) LIMIT 1",
        [input.horseId, input.now],
      );
      if (listedResult.rows.length > 0) {
        throw new HorseListedInMarketError(input.horseId);
      }
      if (await isHorseInActiveRace(client, input.horseId, input.raceId)) {
        throw new HorseInActiveRaceError(input.horseId);
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
        const wallet = debit(
          { money: balanceBefore, gems: Number(balanceRow.gems) },
          entryFee,
          'money',
        );
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
        await client.query(
          'UPDATE races SET prize_pool = prize_pool + $2, updated_at = $3 WHERE id = $1',
          [input.raceId, entryFee, input.now],
        );
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
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at, player_control
         FROM races
         WHERE id = $1`,
        [input.raceId],
      );
      const finalRow = finalResult.rows[0];
      if (finalRow === undefined) {
        throw new Error("Yarış satırı katılım transaction'ı içinde okunamadı.");
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
  async listLobbyRaces(input: ListLobbyRacesInput): Promise<RaceLobbyListItem[]> {
    // `my_*` (30.09.2026) — çağıranın KENDİ katılımı, aynı JOIN'den
    // `FILTER` ile. `race_entries_race_player_uq` oyuncu başına en fazla bir
    // satır garanti eder; `MAX` yalnızca gruplamanın istediği toplama
    // biçimidir, birden çok değer arasında seçim yapmaz.
    const result = await this.pool.query<
      LobbyRaceRow & {
        joined_players: string;
        my_status: string | null;
        my_horse_id: string | null;
        tournament_tier: TournamentInfo['tier'] | null;
        tournament_min_level: number | null;
        calendar_program_id: string | null;
      }
    >(
      `SELECT r.id, r.name, r.participant_limit, r.max_players, r.entry_fee, r.prize_pool,
              r.start_time, r.status, r.race_type, r.surface, r.weather, r.distance_m,
              r.tribune_fee, r.spectator_capacity, r.created_by, r.created_at, r.player_control,
              COUNT(e.player_id) FILTER (WHERE e.status IS DISTINCT FROM 'cancelled') AS joined_players,
              MAX(e.status) FILTER (WHERE e.player_id = $3) AS my_status,
              MAX(e.horse_id::text) FILTER (WHERE e.player_id = $3) AS my_horse_id,
              t.tier AS tournament_tier,
              t.min_player_level AS tournament_min_level,
              c.program_id AS calendar_program_id
       FROM races r
       LEFT JOIN race_entries e ON e.race_id = r.id AND e.player_id IS NOT NULL
       LEFT JOIN tournaments t ON t.race_id = r.id
       LEFT JOIN race_calendar_slots c ON c.race_id = r.id
       WHERE r.status = $1
       GROUP BY r.id, t.tier, t.min_player_level, c.program_id
       -- 02.10.2026 (Faz 11): öne çıkan (özel) program yarışları liste sınırına
       -- takılmasın — günler önceden açılan derbi, sıradaki kısa yarışların
       -- arkasında kaybolmasın diye başa alınır.
       ORDER BY (c.program_id = ANY($4::text[])) DESC NULLS LAST, r.start_time ASC
       LIMIT $2`,
      [
        input.status,
        input.limit,
        input.viewerId,
        this.config.raceLobby.calendar.programs.filter((program) => program.featured === true).map((program) => program.id),
      ],
    );

    return result.rows.map((row) => ({
      ...rowToLobbyRaceView(this.config, row, Number(row.joined_players)),
      myEntry:
        row.my_status !== null && row.my_horse_id !== null
          ? { status: row.my_status as RaceEntryStatus, horseId: row.my_horse_id }
          : null,
      tournament:
        row.tournament_tier !== null && row.tournament_min_level !== null
          ? { tier: row.tournament_tier, minPlayerLevel: row.tournament_min_level }
          : null,
      calendar:
        row.calendar_program_id !== null
          ? {
              programId: row.calendar_program_id,
              featured:
                this.config.raceLobby.calendar.programs.find((program) => program.id === row.calendar_program_id)
                  ?.featured === true,
            }
          : null,
    }));
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
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at, player_control
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
      await client.query(
        'UPDATE race_entries SET status = $3 WHERE race_id = $1 AND player_id = $2',
        [input.raceId, input.playerId, input.status],
      );

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
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at, player_control
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
        const wallet = credit(
          { money: balanceBefore, gems: Number(balanceRow.gems) },
          refund,
          'money',
        );
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
        await client.query(
          'UPDATE races SET prize_pool = prize_pool - $2, updated_at = $3 WHERE id = $1',
          [input.raceId, refund, input.now],
        );
      }

      // 6) Katılımı İPTAL et. Satır SİLİNMEZ — `race_entries_race_player_uq`
      //    (migration 0037) `status`'tan bağımsız olarak `player_id` dolu her
      //    satırı kapsar, yani silmek yeniden katılmayı AÇARDI. Bu bilinçli
      //    olarak İSTENMEZ: bkz. `RaceEntryCancelledError` doc yorumu.
      await client.query(
        'UPDATE race_entries SET status = $3 WHERE race_id = $1 AND player_id = $2',
        [input.raceId, input.playerId, 'cancelled'],
      );

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
                race_type, surface, weather, distance_m, tribune_fee, spectator_capacity, created_by, created_at, player_control
         FROM races
         WHERE id = $1`,
        [input.raceId],
      );
      const finalRow = finalResult.rows[0];
      if (finalRow === undefined) {
        throw new Error("Yarış satırı ayrılma transaction'ı içinde okunamadı.");
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
   * READY şartı — port doc yorumu okunmalıdır. İade mantığı
   * `leaveLobbyRace` ile AYNIDIR (tutar defterden okunur, `races.entry_fee`
   * sabitinden DEĞİL; bakiye + havuz + defter tek transaction'da). Kilit
   * sırası `races` → `race_entries` → `players` (ayrılma yoluyla AYNI).
   * Otomatik bir iade olduğu için `idempotency_key` NULL yazılır; tekrar
   * koruması durumun kendisidir (iptal edilen satır ikinci turda seçilmez).
   */
  async dropUnreadyLobbyEntries(input: {
    raceId: string;
    now: Date;
    minRemaining?: number;
  }): Promise<DropUnreadyLobbyEntriesResult> {
    const minRemaining = input.minRemaining ?? 1;
    return withTransaction(this.pool, async (client) => {
      const raceResult = await client.query<{ status: string; start_time: Date }>(
        'SELECT status, start_time FROM races WHERE id = $1 FOR UPDATE',
        [input.raceId],
      );
      const raceRow = raceResult.rows[0];
      if (
        raceRow === undefined ||
        raceRow.status !== 'scheduled' ||
        raceRow.start_time.getTime() > input.now.getTime()
      ) {
        return { droppedPlayerIds: [], raceCancelled: false };
      }

      const unreadyResult = await client.query<{ player_id: string }>(
        `SELECT player_id
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL AND status IN ('waiting', 'not_ready')
         ORDER BY player_id
         FOR UPDATE`,
        [input.raceId],
      );
      const droppedPlayerIds: string[] = [];
      for (const { player_id: playerId } of unreadyResult.rows) {
        await this.refundAndCancelEntry(client, input.raceId, playerId, input.now);
        droppedPlayerIds.push(playerId);
      }

      // Kalan (hazır) oyuncu sayısı. Hiç kimse kalmadıysa yarış koşulamaz;
      // turnuvada (30.09.2026) `minRemaining`in altında kalınırsa da
      // koşulmaz — final botsuzdur ve tek kişilik bir "turnuva" havuzu
      // kendine geri alırdı. O durumda KALANLAR da iade edilir.
      // `scheduled → cancelled` yaşam döngüsünde izinlidir.
      const remainingResult = await client.query<{ player_id: string }>(
        `SELECT player_id
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL AND status IS DISTINCT FROM 'cancelled'
         ORDER BY player_id
         FOR UPDATE`,
        [input.raceId],
      );
      const remaining = remainingResult.rows.map((row) => row.player_id);
      // Lobi (`minRemaining = 1`): YALNIZCA bu turda birileri düşürüldüyse
      // iptal edilir — hiç katılımı olmamış bir yarışa dokunulmaz
      // (`NO_PARTICIPANTS` davranışı değişmez). Turnuvada eşik her zaman
      // uygulanır.
      const belowMinimum =
        remaining.length < minRemaining && (droppedPlayerIds.length > 0 || minRemaining > 1);
      if (!belowMinimum) {
        return { droppedPlayerIds, raceCancelled: false };
      }
      for (const playerId of remaining) {
        await this.refundAndCancelEntry(client, input.raceId, playerId, input.now);
        droppedPlayerIds.push(playerId);
      }
      await client.query("UPDATE races SET status = 'cancelled', updated_at = $2 WHERE id = $1", [
        input.raceId,
        input.now,
      ]);
      return { droppedPlayerIds, raceCancelled: true };
    });
  }

  /**
   * Tek bir katılımı `cancelled` yapar ve ödediği giriş ücretini İADE eder —
   * `leaveLobbyRace` ile AYNI kurallar: tutar DEFTERDEN okunur (son
   * `lobby_race_entry_fee` satırı, `races.entry_fee` sabitinden DEĞİL),
   * bakiye `players` satırı `FOR UPDATE` altında artar, havuz aynı miktarda
   * küçülür, `race_entry_refund` defter satırı AYNI transaction'da yazılır.
   * Otomatik bir iade olduğu için `idempotency_key` NULL'dır; tekrar koruması
   * durumun kendisidir (iptal edilen satır bir daha seçilmez).
   */
  private async refundAndCancelEntry(
    client: PoolClient,
    raceId: string,
    playerId: string,
    now: Date,
  ): Promise<void> {
    const paidResult = await client.query<{ amount: string }>(
      `SELECT amount
       FROM economy_transactions
       WHERE player_id = $1
         AND type = 'lobby_race_entry_fee'
         AND reference_type = 'race'
         AND reference_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [playerId, raceId],
    );
    const paidRow = paidResult.rows[0];
    const refund = paidRow === undefined ? 0 : Math.max(0, -Number(paidRow.amount));

    if (refund > 0) {
      const balanceResult = await client.query<{ money: string; gems: string }>(
        'SELECT money, gems FROM players WHERE id = $1 FOR UPDATE',
        [playerId],
      );
      const balanceRow = balanceResult.rows[0];
      if (balanceRow === undefined) {
        throw new PlayerNotFoundError(playerId);
      }
      const balanceBefore = Number(balanceRow.money);
      const balanceAfter = credit(
        { money: balanceBefore, gems: Number(balanceRow.gems) },
        refund,
        'money',
      ).money;
      await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
        playerId,
        balanceAfter,
        now,
      ]);
      await client.query(
        'UPDATE races SET prize_pool = prize_pool - $2, updated_at = $3 WHERE id = $1',
        [raceId, refund, now],
      );
      await this.writeLedgerEntries(client, [
        {
          playerId,
          type: 'race_entry_refund',
          amount: refund,
          currency: 'money',
          referenceType: 'race',
          referenceId: raceId,
          balanceBefore,
          balanceAfter,
          idempotencyKey: null,
        },
      ]);
    }

    await client.query(
      "UPDATE race_entries SET status = 'cancelled' WHERE race_id = $1 AND player_id = $2",
      [raceId, playerId],
    );
  }

  async findTournamentInfo(raceId: string): Promise<TournamentInfo | null> {
    const result = await this.pool.query<{
      tier: TournamentInfo['tier'];
      min_player_level: number;
    }>('SELECT tier, min_player_level FROM tournaments WHERE race_id = $1', [raceId]);
    const row = result.rows[0];
    return row === undefined ? null : { tier: row.tier, minPlayerLevel: row.min_player_level };
  }

  async findOpenTournamentTiers(): Promise<string[]> {
    const result = await this.pool.query<{ tier: string }>(
      `SELECT DISTINCT t.tier
       FROM tournaments t
       JOIN races r ON r.id = t.race_id
       WHERE r.status = 'scheduled'`,
    );
    return result.rows.map((row) => row.tier);
  }

  /**
   * Turnuva finali = sunucu üretimi bir ücretli lobi yarışı + `tournaments`
   * satırı, TEK transaction (migration 0045). `participant_limit` ve
   * `max_players` aynıdır: final BOTSUZDUR, saha = oyuncu tavanı.
   * `simulation_seed` NULL'dır — seed kilit anında doğar (lobi ile AYNI kural).
   */
  async createTournamentRace(input: CreateTournamentRaceInput): Promise<string | null> {
    return withTransaction(this.pool, async (client) => {
      // ÇİFT AÇILIŞ KORUMASI: iki sunucu örneği aynı turda aynı kademe için
      // turnuva açmaya kalkarsa, kademe başına bir transaction-kilidi ikisini
      // sıraya sokar; ikincisi kilit altında "zaten açık" görür ve `null`
      // döner. `tournaments`ta durum sütunu olmadığı için bunu bir tekil
      // indeks ifade edemez (açıklık, bağlı yarışın durumundan türetilir).
      await client.query("SELECT pg_advisory_xact_lock(hashtext('tournament-open:' || $1))", [
        input.tier,
      ]);
      const open = await client.query(
        `SELECT 1 FROM tournaments t JOIN races r ON r.id = t.race_id
         WHERE t.tier = $1 AND r.status = 'scheduled' LIMIT 1`,
        [input.tier],
      );
      if (open.rows.length > 0) {
        return null;
      }
      await client.query(
        `INSERT INTO races (
           id, created_by, name, distance_m, surface, weather,
           participant_limit, max_players, entry_fee, prize_pool, race_type,
           tribune_fee, spectator_capacity, start_time, status, simulation_seed,
           engine_version, ruleset_version, config_version, weather_config_version, player_control
         )
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $6, $7, 0, $8, $9, $10, $11, 'scheduled', NULL, $12, $13, $14, $15, $16)`,
        [
          input.raceId,
          input.name,
          input.distanceMeters,
          input.surface,
          input.weather,
          input.maxParticipants,
          input.entryFee,
          input.entryFee > 0 ? 'paid' : 'free',
          input.tribuneFee,
          input.spectatorCapacity,
          input.startTime,
          input.engineVersion,
          input.rulesetVersion,
          input.configVersion,
          input.weatherConfigVersion,
          input.playerControl,
        ],
      );
      await client.query(
        'INSERT INTO tournaments (race_id, tier, min_player_level) VALUES ($1, $2, $3)',
        [input.raceId, input.tier, input.minPlayerLevel],
      );
      return input.raceId;
    });
  }

  /**
   * Başlangıcı geçmiş, HİÇ katılımı olmayan turnuvaları iptal eder. Kilit
   * zamanlayıcısı katılımı olmayan yarışı hiç seçmez (`findRacesDueForLock`
   * `EXISTS` ister); turnuva `scheduled` kalsaydı o kademede yeni turnuva
   * hiç açılmazdı. Para yoktur (katılım yok) — defter satırı yazılmaz.
   */
  async cancelEmptyDueTournaments(now: Date): Promise<number> {
    const result = await this.pool.query(
      `UPDATE races r
       SET status = 'cancelled', updated_at = $1
       FROM tournaments t
       WHERE t.race_id = r.id
         AND r.status = 'scheduled'
         AND r.start_time <= $1
         AND NOT EXISTS (
           SELECT 1 FROM race_entries e
           WHERE e.race_id = r.id AND e.player_id IS NOT NULL AND e.status IS DISTINCT FROM 'cancelled'
         )`,
      [now],
    );
    return result.rowCount ?? 0;
  }

  async findExistingCalendarSlots(programId: string, startTimes: Date[]): Promise<Date[]> {
    if (startTimes.length === 0) {
      return [];
    }
    const result = await this.pool.query<{ start_time: Date }>(
      'SELECT start_time FROM race_calendar_slots WHERE program_id = $1 AND start_time = ANY($2::timestamptz[])',
      [programId, startTimes],
    );
    return result.rows.map((row) => row.start_time);
  }

  /**
   * Takvim yarışı = sunucu üretimi sıradan bir lobi yarışı + yuva satırı,
   * TEK transaction (migration 0052). İki sunucu örneği aynı yuvayı açmaya
   * kalkarsa yuva başına transaction-kilidi ikisini sıraya sokar; ikincisi
   * kilit altında yuvayı dolu görür ve `null` döner (turnuvayla aynı desen).
   * Kilit kaçırılsa bile yuvanın birincil anahtarı ikinci satırı reddeder.
   */
  async createCalendarRace(input: CreateCalendarRaceInput): Promise<string | null> {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('race-calendar:' || $1 || ':' || $2))",
        [input.programId, input.startTime.toISOString()],
      );
      const existing = await client.query(
        'SELECT 1 FROM race_calendar_slots WHERE program_id = $1 AND start_time = $2',
        [input.programId, input.startTime],
      );
      if (existing.rows.length > 0) {
        return null;
      }
      await client.query(
        `INSERT INTO races (
           id, created_by, name, distance_m, surface, weather,
           participant_limit, max_players, entry_fee, prize_pool, race_type,
           tribune_fee, spectator_capacity, start_time, status, simulation_seed,
           engine_version, ruleset_version, config_version, weather_config_version, player_control
         )
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, 'scheduled', NULL, $13, $14, $15, $16, $17)`,
        [
          input.raceId,
          input.name,
          input.distanceMeters,
          input.surface,
          input.weather,
          input.fieldSize,
          input.maxPlayers,
          input.entryFee,
          input.raceType,
          input.tribuneFee,
          input.spectatorCapacity,
          input.startTime,
          input.engineVersion,
          input.rulesetVersion,
          input.configVersion,
          input.weatherConfigVersion,
          input.playerControl,
        ],
      );
      await client.query(
        'INSERT INTO race_calendar_slots (program_id, start_time, race_id) VALUES ($1, $2, $3)',
        [input.programId, input.startTime, input.raceId],
      );
      return input.raceId;
    });
  }

  /**
   * Başlangıcı geçmiş, HİÇ katılımı olmayan takvim yarışlarını iptal eder
   * (`cancelEmptyDueTournaments` ile aynı gerekçe: kilit zamanlayıcısı
   * katılımsız yarışı seçmez, `scheduled`da sonsuza dek kalırdı ve lobi
   * listesini geçmiş yarışlarla doldururdu). Para yoktur — defter satırı yazılmaz.
   */
  async cancelEmptyDueCalendarRaces(now: Date): Promise<number> {
    const result = await this.pool.query(
      `UPDATE races r
       SET status = 'cancelled', updated_at = $1
       FROM race_calendar_slots c
       WHERE c.race_id = r.id
         AND r.status = 'scheduled'
         AND r.start_time <= $1
         AND NOT EXISTS (
           SELECT 1 FROM race_entries e
           WHERE e.race_id = r.id AND e.player_id IS NOT NULL AND e.status IS DISTINCT FROM 'cancelled'
         )`,
      [now],
    );
    return result.rowCount ?? 0;
  }

  // ---------------------------------------------------------------------
  // 01.10.2026 — OYUNCU KONTROLLÜ PRATİK YARIŞ (migration 0053)
  // ---------------------------------------------------------------------

  async startInteractiveRace(
    input: StartInteractiveRaceInput,
  ): Promise<
    { ok: true; balance: { money: number; gems: number } } | { ok: false; runningRaceId: string }
  > {
    return withTransaction(this.pool, async (client) => {
      const playerResult = await client.query<{ money: string; gems: string }>(
        'SELECT money, gems FROM players WHERE id = $1 FOR UPDATE',
        [input.playerId],
      );
      const playerRow = playerResult.rows[0];
      if (!playerRow) {
        throw new PlayerNotFoundError(input.playerId);
      }
      // Oyuncu satırı kilitli: aynı oyuncunun eşzamanlı iki başlatması burada sıraya girer.
      const running = await client.query<{ id: string }>(
        "SELECT id FROM interactive_races WHERE player_id = $1 AND status = 'running' LIMIT 1",
        [input.playerId],
      );
      if (running.rows[0]) {
        return { ok: false, runningRaceId: running.rows[0].id };
      }
      const before = { money: Number(playerRow.money), gems: Number(playerRow.gems) };
      const after = input.entryFee > 0 ? debit(before, input.entryFee, 'money') : before;
      await client.query('UPDATE players SET money = $2, updated_at = now() WHERE id = $1', [
        input.playerId,
        after.money,
      ]);
      if (input.entryFee > 0) {
        await this.writeLedgerEntries(client, [
          {
            playerId: input.playerId,
            type: 'practice_race_entry_fee',
            amount: -input.entryFee,
            currency: 'money',
            referenceType: 'race',
            referenceId: input.id,
            balanceBefore: before.money,
            balanceAfter: after.money,
            idempotencyKey: null,
          },
        ]);
      }
      await client.query(
        `INSERT INTO interactive_races (
           id, player_id, horse_id, tier_id, simulation_seed, tactic, entrants, jockey_id,
           entry_fee, distance_m, surface, weather, starts_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          input.id,
          input.playerId,
          input.horseId,
          input.tierId,
          input.simulationSeed,
          JSON.stringify(input.tactic),
          JSON.stringify(input.entrants),
          input.jockeyId,
          input.entryFee,
          input.distanceMeters,
          input.surface,
          input.weather,
          input.startsAt,
        ],
      );
      return { ok: true, balance: after };
    });
  }

  async findInteractiveRace(raceId: string): Promise<InteractiveRaceRecord | null> {
    const result = await this.pool.query<InteractiveRaceRow>(
      'SELECT * FROM interactive_races WHERE id = $1',
      [raceId],
    );
    return result.rows[0] ? rowToInteractiveRace(result.rows[0]) : null;
  }

  async findLiveLobbyRaceIdForPlayer(playerId: string): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT r.id FROM races r
       JOIN race_entries e ON e.race_id = r.id
       WHERE e.player_id = $1 AND e.status IS DISTINCT FROM 'cancelled'
         AND r.player_control AND r.status = 'locking'
       ORDER BY r.live_starts_at DESC NULLS LAST
       LIMIT 1`,
      [playerId],
    );
    return result.rows[0]?.id ?? null;
  }

  async updateLobbyEntryCommands(
    raceId: string,
    playerId: string,
    mutate: (current: PlayerCommandLog, raceStatus: string) => PlayerCommandLog,
  ): Promise<PlayerCommandLog | null> {
    return withTransaction(this.pool, async (client) => {
      const race = await client.query<{ status: string }>(
        'SELECT status FROM races WHERE id = $1 FOR SHARE',
        [raceId],
      );
      if (!race.rows[0]) {
        return null;
      }
      const entry = await client.query<{ id: string; player_commands: PlayerCommandLog }>(
        `SELECT id, player_commands FROM race_entries
         WHERE race_id = $1 AND player_id = $2 AND status IS DISTINCT FROM 'cancelled'
         FOR UPDATE`,
        [raceId, playerId],
      );
      const row = entry.rows[0];
      if (!row) {
        return null;
      }
      const next = mutate(row.player_commands ?? {}, race.rows[0].status);
      await client.query('UPDATE race_entries SET player_commands = $2 WHERE id = $1', [
        row.id,
        JSON.stringify(next),
      ]);
      return next;
    });
  }

  async findLobbyOutcome(
    raceId: string,
    playerId: string,
  ): Promise<{ finishPosition: number; prizeWon: number; entryFee: number } | null> {
    const result = await this.pool.query<{
      finish_position: number | null;
      prize: string;
      fee: string;
    }>(
      `SELECT e.finish_position,
              COALESCE((SELECT SUM(t.amount) FROM economy_transactions t
                        WHERE t.player_id = $2 AND t.reference_id = $1::text AND t.type = 'lobby_race_prize'), 0) AS prize,
              COALESCE((SELECT -SUM(t.amount) FROM economy_transactions t
                        WHERE t.player_id = $2 AND t.reference_id = $1::text AND t.type = 'lobby_race_entry_fee'), 0) AS fee
       FROM race_entries e
       WHERE e.race_id = $1::uuid AND e.player_id = $2 AND e.status IS DISTINCT FROM 'cancelled'`,
      [raceId, playerId],
    );
    const row = result.rows[0];
    if (!row || row.finish_position === null) {
      return null;
    }
    return {
      finishPosition: row.finish_position,
      prizeWon: Number(row.prize),
      entryFee: Number(row.fee),
    };
  }

  async findRunningInteractiveRaceId(playerId: string): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      "SELECT id FROM interactive_races WHERE player_id = $1 AND status = 'running' LIMIT 1",
      [playerId],
    );
    return result.rows[0]?.id ?? null;
  }

  async findRunningInteractiveRaceIds(limit: number): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      "SELECT id FROM interactive_races WHERE status = 'running' ORDER BY starts_at ASC LIMIT $1",
      [limit],
    );
    return result.rows.map((row) => row.id);
  }

  async updateInteractiveRaceCommands(
    raceId: string,
    mutate: (record: InteractiveRaceRecord) => PlayerCommandLog,
  ): Promise<InteractiveRaceRecord | null> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<InteractiveRaceRow>(
        'SELECT * FROM interactive_races WHERE id = $1 FOR UPDATE',
        [raceId],
      );
      if (!result.rows[0]) {
        return null;
      }
      const record = rowToInteractiveRace(result.rows[0]);
      const commands = mutate(record);
      await client.query('UPDATE interactive_races SET commands = $2 WHERE id = $1', [
        raceId,
        JSON.stringify(commands),
      ]);
      return { ...record, commands };
    });
  }

  async finishInteractiveRace(
    raceId: string,
    build: (record: InteractiveRaceRecord) => {
      saveInput: SavePracticeRaceWithStakesInput;
      result: (balance: { money: number; gems: number }) => PracticeRaceResult;
    } | null,
  ): Promise<
    | { status: 'finished'; balance: { money: number; gems: number } }
    | { status: 'not_due' }
    | { status: 'already_finished' }
    | null
  > {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<InteractiveRaceRow>(
        'SELECT * FROM interactive_races WHERE id = $1 FOR UPDATE',
        [raceId],
      );
      if (!result.rows[0]) {
        return null;
      }
      const record = rowToInteractiveRace(result.rows[0]);
      if (record.status !== 'running') {
        return { status: 'already_finished' as const };
      }
      const built = build(record);
      if (built === null) {
        return { status: 'not_due' as const };
      }
      const balance = await this.savePracticeRaceInTransaction(client, built.saveInput);
      await client.query(
        "UPDATE interactive_races SET status = 'finished', finished_at = now(), result = $2 WHERE id = $1",
        [raceId, JSON.stringify(built.result(balance))],
      );
      return { status: 'finished' as const, balance };
    });
  }

  async findLobbySettlementContext(raceId: string): Promise<LobbySettlementContext | null> {
    const raceResult = await this.pool.query<SettlementRaceRow>(
      `SELECT id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
              surface, weather, distance_m, temperature_c, wind_kmh, humidity_pct, created_by, created_at,
              simulation_seed, player_control, live_starts_at
       FROM races
       WHERE id = $1`,
      [raceId],
    );
    const raceRow = raceResult.rows[0];
    if (raceRow === undefined) {
      return null;
    }

    // `status IS DISTINCT FROM 'cancelled'` — `leaveLobbyRace`'in doluluk
    // sorgusuyla AYNI filtre. `IS DISTINCT FROM` kullanılır çünkü `status`
    // NULLABLE'dır (migration 0037): `status <> 'cancelled'` NULL'da
    // NULL döner ve satırı SESSİZCE elerdi.
    const entryResult = await this.pool.query<SettlementEntryRow>(
      `SELECT e.id, e.player_id, e.horse_id, e.tactical_style, e.risk_level, e.gate_position,
              e.horse_snapshot, e.jockey_id, e.player_commands, h.name AS horse_name
       FROM race_entries e
       LEFT JOIN horses h ON h.id = e.horse_id
       WHERE e.race_id = $1 AND e.player_id IS NOT NULL AND e.status IS DISTINCT FROM 'cancelled'
       ORDER BY e.id`,
      [raceId],
    );

    const entrants: LobbySettlementEntrant[] = entryResult.rows.map((row) => ({
      entryId: row.id,
      playerId: row.player_id as string,
      // `player_id` dolu ise `horse_id` de DOLUDUR — `race_entries_horse_xor_
      // bot_chk` CHECK'i (migration 0025) ikisinin birden dolu/boş olmasını
      // engeller. `as string` yalnızca sütunun NULLABLE tipini daraltır.
      horseId: row.horse_id as string,
      tacticalStyle: row.tactical_style as RacingStyle,
      riskLevel: row.risk_level as RiskLevel,
      gatePosition: row.gate_position,
      // `null` → kilit çalışmadı. Dolu → `lockLobbyRace`in yazdığı JSONB;
      // tip gerekçesi `SettlementEntryRow.horse_snapshot` doc yorumunda.
      horseSnapshot:
        row.horse_snapshot === null ? null : (row.horse_snapshot as RaceEntrantSnapshot),
      // PHASE 6.2 — `lockLobbyRace` yazdıysa DOLUDUR ve dondurulmuş
      // snapshot'la AYNI andaki jokeydir. `null` ise kilit çalışmamıştır
      // VE oyuncunun jokeyi olmayabilir de; ikisini ayırt etmek gerekmez,
      // çünkü iki durumda da yapılacak şey aynıdır: `horseSnapshot === null`
      // ise kesinleşme jokeyi kendisi çözer.
      jockeyId: row.jockey_id,
      playerCommands: row.player_commands ?? {},
      horseName: row.horse_name ?? '',
    }));

    return {
      raceId: raceRow.id,
      raceName: raceRow.name,
      status: raceRow.status,
      startTime: raceRow.start_time,
      joinedPlayers: entrants.length,
      entryFee: Number(raceRow.entry_fee),
      prizePool: Number(raceRow.prize_pool),
      fieldSize: raceRow.participant_limit,
      maxPlayers: raceRow.max_players,
      surface: raceRow.surface,
      weather: raceRow.weather,
      distanceMeters: raceRow.distance_m,
      temperatureC: raceRow.temperature_c === null ? null : Number(raceRow.temperature_c),
      windKmh: raceRow.wind_kmh === null ? null : Number(raceRow.wind_kmh),
      humidityPct: raceRow.humidity_pct === null ? null : Number(raceRow.humidity_pct),
      createdBy: raceRow.created_by,
      createdAt: raceRow.created_at,
      entrants,
      simulationSeed: raceRow.simulation_seed,
      playerControl: raceRow.player_control ?? false,
      liveStartsAt: raceRow.live_starts_at ?? null,
    };
  }

  /**
   * Kilitle bekleyen yarışların kimlikleri (PHASE 1, migration 0042).
   * Gerekçe ve güvenlik kanıtı: `RaceRepository.findRacesDueForLock` port
   * doc yorumu. Burada yalnızca SQL vardır.
   */
  async findRacesDueForLock(input: { now: Date; limit: number }): Promise<string[]> {
    // `EXISTS` KULLANILIR, `JOIN + GROUP BY` DEĞİL: yarışın kaç katılımcısı
    // olduğu SORULMAZ, yalnızca "en az bir tane var mı" sorulur. `EXISTS`
    // ilk satırı bulduğunda durur; `COUNT` ise tüm satırları okurdu —
    // zamanlayıcı her 5 saniyede koştuğu için bu fark gerçek bir maliyettir.
    //
    // `status IS DISTINCT FROM 'cancelled'` — `status` NULLABLE (migration
    // 0037) ve `<>` NULL'lı satırları SESSİZCE düşürürdü (CLAUDE.md kuralı).
    // Burada doğru davranış "NULL'ı katılımcı SAY"dır: pratik/PvP girişleri
    // bu durumda olabilir ve ayrılmamış bir satırı yok saymak, yarışı
    // sonsuza kadar `scheduled` bırakırdı.
    const result = await this.pool.query<{ id: string }>(
      `SELECT r.id
       FROM races r
       WHERE r.status = 'scheduled'
         AND r.start_time <= $1
         AND EXISTS (
           SELECT 1 FROM race_entries e
           WHERE e.race_id = r.id
             AND e.player_id IS NOT NULL
             AND e.status IS DISTINCT FROM 'cancelled'
         )
       ORDER BY r.start_time ASC, r.id ASC
       LIMIT $2`,
      [input.now, input.limit],
    );
    return result.rows.map((row) => row.id);
  }

  /** Otomatik kesinleşme sırası — port doc yorumu okunmalıdır. */
  async findRacesDueForSettle(input: { limit: number }): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM races
       WHERE status = 'locking'
       ORDER BY start_time ASC, id ASC
       LIMIT $1`,
      [input.limit],
    );
    return result.rows.map((row) => row.id);
  }

  /**
   * `scheduled → locking` + seed + snapshot + bildirim, TEK transaction
   * (PHASE 1, migration 0042). Adımların gerekçesi `RaceRepository.
   * lockLobbyRace` port doc yorumundadır; burada adım numaraları oraya
   * karşılık gelir.
   */
  async lockLobbyRace(input: LockLobbyRaceInput): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      // 1) `races` satırı KİLİTLİ okunur. Kilit alındıktan sonra bu
      //    transaction boyunca başka bir zamanlayıcı/işçi aynı satıra
      //    yazamaz — "iki işçi aynı yarışı kilitler mi" sorusunun cevabı
      //    tam olarak burasıdır: ikincisi 3. adımda `null` alır.
      const raceResult = await client.query<SettlementRaceRow>(
        `SELECT id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
                surface, weather, distance_m, temperature_c, wind_kmh, humidity_pct, created_by, created_at,
                simulation_seed
         FROM races
         WHERE id = $1
         FOR UPDATE`,
        [input.raceId],
      );
      const raceRow = raceResult.rows[0];
      if (raceRow === undefined) {
        return false;
      }

      // 2) Doluluk KİLİT ALTINDA (`settleLobbyRace` adım 2 ile AYNI sorgu ve
      //    AYNI gerekçe: `checkRaceLockable`'a verilecek sayı, kararın
      //    verildiği an ile aynı okumadan gelmelidir).
      const joinedResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'cancelled') AS count
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL`,
        [input.raceId],
      );
      const joinedPlayers = Number(joinedResult.rows[0]?.count ?? '0');

      // 3) Durum denetimi — SAF fonksiyon. `null` dönüşü burada "kilitlenemez"
      //    demektir ve hata FIRLATILMAZ (gerekçe: port doc yorumu — çağıran
      //    her hâlükârda hiçbir şey yapmaz, ayırt etmek gürültü olurdu).
      const rejection = checkRaceLockable(
        { status: raceRow.status, startTime: raceRow.start_time, joinedPlayers },
        input.now,
      );
      if (rejection !== null) {
        return false;
      }

      // 4) KADRO TRIPWIRE'I. Snapshot'lar kilitten önce, kilitsiz bir
      //    okumadan kuruldu; burada kilit altındaki kadroyla karşılaştırılır.
      //    `settleLobbyRace` adım 5'in BİREBİR aynısı — ve aynı gerekçe:
      //    fark, snapshot'ın YANLIŞ kadroya ait olması demektir ve sessizce
      //    devam etmek bozuk bir yarış kaydı üretirdi.
      const entriesResult = await client.query<{ id: string }>(
        `SELECT id
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL AND status IS DISTINCT FROM 'cancelled'
         ORDER BY id`,
        [input.raceId],
      );
      const lockedEntryIds = entriesResult.rows.map((row) => row.id).sort();
      const frozenEntryIds = input.entrantSnapshots.map((item) => item.entryId).sort();
      if (
        lockedEntryIds.length !== frozenEntryIds.length ||
        lockedEntryIds.some((id, index) => id !== frozenEntryIds[index])
      ) {
        throw new Error(
          `Yarış kadrosu kilitlenirken değişti: ${frozenEntryIds.length} snapshot kuruldu, ${lockedEntryIds.length} kilit altında.`,
        );
      }

      // 5) DURUM GEÇİŞİ + DONDURMA. `simulation_seed` ve dört sürüm sütunu
      //    BURADA yazılır; kesinleşme (`settleLobbyRace` adım 9) AYNI
      //    değerleri tekrar yazar — bu kasıtlıdır, ikinci yazım ilkini
      //    doğrular ve iki uç arasında bir sürüm kayması olursa görünür olur.
      await client.query(
        `UPDATE races
         SET status = 'locking', simulation_seed = $2, engine_version = $3, ruleset_version = $4,
             config_version = $5, weather_config_version = $6, updated_at = $7,
             -- 01.10.2026 — kontrollü yarışta canlı koşu kilitle başlar (geri sayım sonrası).
             live_starts_at = CASE WHEN player_control THEN $7::timestamptz + make_interval(secs => $8) ELSE NULL END
         WHERE id = $1`,
        [
          input.raceId,
          input.simulationSeed,
          input.engineVersion,
          input.rulesetVersion,
          input.configVersion,
          input.weatherConfigVersion,
          input.now,
          input.liveCountdownSeconds,
        ],
      );

      // 6) SNAPSHOT'LAR — dondurmanın KENDİSİ. `entry_id` ile UPDATE edilir;
      //    satır katılım anında doğmuştur, burada yeni satır AÇILMAZ.
      //    `finish_position`/`final_time_ms` BİLEREK yazılmaz: yarış henüz
      //    koşmadı ve bu sütunlara "yarıştı" izlenimi veren bir değer
      //    koymak, `settleLobbyRace`in 7. adımıyla çelişirdi.
      for (const item of input.entrantSnapshots) {
        // `jockey_id` PHASE 6.2'DE BURAYA EKLENDİ — snapshot'la AYNI
        // UPDATE'te, AYNI transaction'da. Ayrı yazılsaydı donmuş
        // `jockeySkillComposite` ile sonuç ekranındaki jokey SESSİZCE
        // ayrışabilirdi (bkz. `LockLobbyRaceInput.entrantSnapshots` doc
        // yorumu). `COALESCE` DEĞİL düz atama: `null` da gerçek bir
        // bilgidir ("jokeyi yoktu") ve eski bir değeri korumak yanlış olurdu.
        await client.query(
          'UPDATE race_entries SET horse_snapshot = $2, jockey_id = $3 WHERE id = $1',
          [item.entryId, JSON.stringify(item.snapshot), item.jockeyId],
        );
      }

      // 7) `race_starting` BİLDİRİMLERİ — durum geçişiyle AYNI transaction
      //    (CLAUDE.md: "BİLDİRİM, YAZILDIĞI ŞEYLE AYNI TRANSACTION'DA
      //    YAZILIR"). Bu yol bir PARA YOLU DEĞİLDİR ama kural yine geçerli:
      //    ayrı yazılsaydı geri alınmış bir kilidin "yarış başlıyor"
      //    haberi oyuncularda kalırdı.
      //
      //    Yalnızca GERÇEK katılımcılara yazılır (botların `player_id`si
      //    yoktur — bkz. `generateBotEntrants`).
      const playerResult = await client.query<{ player_id: string }>(
        `SELECT player_id
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL AND status IS DISTINCT FROM 'cancelled'
         ORDER BY player_id`,
        [input.raceId],
      );
      const startingPayload = JSON.stringify(
        buildRaceStartingPayload({
          raceId: raceRow.id,
          raceName: raceRow.name,
          startTime: raceRow.start_time,
        }),
      );
      for (const row of playerResult.rows) {
        await client.query(
          'INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)',
          [row.player_id, 'race_starting', startingPayload],
        );
      }

      // 8) `true` — kilitlendi. Bağlam DÖNMEZ: çağıran (use-case) onu zaten
      //    snapshot'ları kurmak için okumuştu, ikinci kez döndürmek iki
      //    kopyanın ayrışmasına açık bir kapı olurdu.
      return true;
    });
  }

  async settleLobbyRace(input: SettleLobbyRaceInput): Promise<RaceSettlementResult> {
    return withTransaction(this.pool, async (client) => {
      // 1) Yarış satırını kilitle — kilit alındıktan sonra okunan durum bu
      //    transaction boyunca değişmez (`leaveLobbyRace` adım 1 ile AYNI).
      const raceResult = await client.query<SettlementRaceRow>(
        `SELECT id, name, participant_limit, max_players, entry_fee, prize_pool, start_time, status,
                surface, weather, distance_m, temperature_c, wind_kmh, humidity_pct, created_by, created_at
         FROM races
         WHERE id = $1
         FOR UPDATE`,
        [input.raceId],
      );
      const raceRow = raceResult.rows[0];
      if (raceRow === undefined) {
        throw new RaceNotFoundError(input.raceId);
      }

      // 2) Doluluk — KİLİT ALTINDA. `checkRaceSettleable`'a geçirilecek
      //    "kaç gerçek oyuncu var" sorusunun cevabı burada, yarış satırı
      //    kilitliyken okunur; `joinLobbyRace`'in TOCTOU gerekçesiyle AYNI.
      const joinedResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'cancelled') AS count
         FROM race_entries
         WHERE race_id = $1 AND player_id IS NOT NULL`,
        [input.raceId],
      );
      const joinedPlayers = Number(joinedResult.rows[0]?.count ?? '0');

      // 3) Durum denetimi — SAF fonksiyon (`domain/race/lobby.ts`). Bu
      //    kontrol AYNI ZAMANDA İDEMPOTENCY'NİN KENDİSİDİR: ilk çağrı
      //    `status`'u `finished` yapar, ikincisi burada `NOT_SCHEDULED`
      //    alır (bkz. `RaceNotSettleableError` doc yorumu).
      const rejection = checkRaceSettleable(
        { status: raceRow.status, startTime: raceRow.start_time, joinedPlayers },
        input.now,
      );
      if (rejection !== null) {
        throw new RaceNotSettleableError(rejection);
      }

      // 4) HAVUZ TRIPWIRE'I. Ödül tutarları use-case'te, kilitsiz okunan
      //    havuzdan hesaplandı; burada kilit altında okunanla karşılaştırılır.
      //    `GREATEST(..., 0)` gibi bir düzeltme YOKTUR ve olmamalıdır: fark
      //    gerçek bir muhasebe bozulmasıdır ve sessizce yutulursa "havuzda
      //    görünen" ile "ödenen" ayrışır (`prize_pool >= 0` CHECK'inin
      //    `leaveLobbyRace`'de oynadığı rolün AYNISI).
      const lockedPrizePool = Number(raceRow.prize_pool);
      if (lockedPrizePool !== input.expectedPrizePool) {
        throw new Error(
          `Yarış havuzu kilit altında değişti: beklenen ${input.expectedPrizePool}, okunan ${lockedPrizePool}.`,
        );
      }

      // 5) KİLİT ALTINDA gerçek katılımcılar + kadro tripwire'ı. Use-case
      //    simülasyonu kilitsiz okunan kadro üzerinde koşturdu; kadro
      //    `startTime`dan sonra DONMUŞ olduğundan (bkz. `checkRaceSettleable`
      //    doc yorumu) ikisi AYNI olmak zorundadır. Değilse ödül YANLIŞ
      //    kişilere giderdi — bu yüzden sessizce devam etmek yerine 500.
      const entriesResult = await client.query<{
        id: string;
        player_id: string;
        horse_id: string | null;
        display_name: string;
      }>(
        // `jockey_id` §42 PHASE 2'de bu sorguya EKLENMİŞTİ (o zaman sütun
        // her zaman NULL'du). PHASE 6.2'de ARTIK OKUNMUYOR: sonuç satırının
        // jokeyi `input.realEntries[].jockeyId`den gelir. DB'den okumak,
        // adım 5 (okuma) ile adım 7 (yazım) arasında bayatlayan bir değer
        // taşırdı.
        `SELECT e.id, e.player_id, e.horse_id, p.display_name
         FROM race_entries e
         JOIN players p ON p.id = e.player_id
         WHERE e.race_id = $1 AND e.player_id IS NOT NULL AND e.status IS DISTINCT FROM 'cancelled'
         ORDER BY e.id`,
        [input.raceId],
      );
      const lockedEntryIds = entriesResult.rows.map((row) => row.id).sort();
      const simulatedEntryIds = input.realEntries.map((entry) => entry.entryId).sort();
      if (
        lockedEntryIds.length !== simulatedEntryIds.length ||
        lockedEntryIds.some((id, index) => id !== simulatedEntryIds[index])
      ) {
        throw new Error(
          `Yarış kadrosu simülasyon sırasında değişti: ${simulatedEntryIds.length} simüle edildi, ${lockedEntryIds.length} kilit altında.`,
        );
      }

      const playerIdByEntryId = new Map(entriesResult.rows.map((row) => [row.id, row.player_id]));
      const displayNameByEntryId = new Map(
        entriesResult.rows.map((row) => [row.id, row.display_name]),
      );
      const horseIdByEntryId = new Map(entriesResult.rows.map((row) => [row.id, row.horse_id]));

      // 6) ÖDÜL ÖDEMELERİ — kazananlar ÖNCE sözlüksel id sırasında kilitlenir.
      //    Kilit TEK bir oyuncu değil N oyuncudur; iki eşzamanlı kesinleşme
      //    (farklı yarışlar) aynı iki oyuncuyu paylaşıyorsa, sıra
      //    SABİTLENMEZSE çapraz kilitlenme doğardı (`updateTwoWithLock`'un
      //    AYNI deseni).
      const winnerByEntryId = new Map<string, number>();
      for (const entry of input.realEntries) {
        const payout = input.payouts[entry.finishPosition - 1] ?? 0;
        if (payout > 0) {
          winnerByEntryId.set(entry.entryId, payout);
        }
      }

      const winnerPlayerIds = [
        ...new Set(
          [...winnerByEntryId.keys()].map((entryId) => playerIdByEntryId.get(entryId) as string),
        ),
      ].sort();

      const balanceByPlayerId = new Map<string, { money: number; gems: number }>();
      if (winnerPlayerIds.length > 0) {
        const balances = await client.query<{ id: string; money: string; gems: string }>(
          'SELECT id, money, gems FROM players WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [winnerPlayerIds],
        );
        for (const row of balances.rows) {
          balanceByPlayerId.set(row.id, { money: Number(row.money), gems: Number(row.gems) });
        }
        // Eksik satır = ödül ödenemeyecek bir kazanan. Sessizce atlamak
        // "havuz dağıtıldı" deyip ödememek olurdu.
        for (const playerId of winnerPlayerIds) {
          if (!balanceByPlayerId.has(playerId)) {
            throw new PlayerNotFoundError(playerId);
          }
        }

        // AYNI OYUNCUYA İKİ ÖDEME OLABİLİR Mİ? Hayır — `race_entries_race_
        // player_uq` (migration 0037) bir oyuncunun bir yarışta TEK satırı
        // olmasını garanti eder. Yine de aşağıdaki döngü bakiyeyi
        // `balanceByPlayerId` üzerinden TAŞIR (satır satır DB'den yeniden
        // okumaz), böylece varsayım yanlışlansa bile bakiye tutarlı kalır.
        for (const [entryId, payout] of winnerByEntryId) {
          const playerId = playerIdByEntryId.get(entryId) as string;
          const current = balanceByPlayerId.get(playerId) as { money: number; gems: number };
          const wallet = credit(current, payout, 'money');
          const balanceAfter = wallet.money;

          await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
            playerId,
            balanceAfter,
            input.now,
          ]);

          await this.writeLedgerEntries(client, [
            {
              playerId,
              // `lobby_race_prize` — kazanç ailesinin lobi yarışındaki
              // karşılığı (`practice_race_prize` pratik yarışındır; ikisi
              // AYRI tutulur ki "hangi para nereden geldi" sorusu defterden
              // tek sorguyla cevaplanabilsin).
              type: 'lobby_race_prize',
              amount: payout,
              currency: 'money',
              referenceType: 'race',
              referenceId: input.raceId,
              balanceBefore: current.money,
              balanceAfter,
              // Settlement'ta Idempotency-Key YOKTUR (durum geçişi korur);
              // defter satırı yine de yazılır — `economy_transactions`
              // kaydı bir idempotency mekanizması değil, DENETİM İZİDİR.
              idempotencyKey: null,
            },
          ]);

          balanceByPlayerId.set(playerId, { money: balanceAfter, gems: current.gems });
        }
      }

      // 7) Gerçek katılım satırlarının SONUÇLARI. `status` BİLEREK
      //    dokunulmaz: `race_entries_status_valid` CHECK'i (migration 0037)
      //    yalnızca `waiting`/`ready`/`not_ready`/`cancelled` kabul eder ve
      //    "hazırım" bayrağı koşmuş bir yarışta anlamsızdır. `horse_snapshot`
      //    İSE BURADA yazılır — katılım anında değil, koştuğu anda.
      for (const entry of input.realEntries) {
        await client.query(
          `UPDATE race_entries
           SET horse_snapshot = $2, final_time_ms = $3, finish_position = $4, performance_score = $5, gate_position = $6,
               jockey_id = $7
           WHERE id = $1`,
          [
            entry.entryId,
            JSON.stringify(entry.horseSnapshot),
            entry.finalTimeMs,
            entry.finishPosition,
            entry.performanceScore,
            entry.gatePosition,
            // PHASE 6.2 — kilit çalıştıysa AYNI değer yeniden yazılır
            // (idempotent); çalışmadıysa jokey BURADA kaydedilir. Bu yazım
            // olmasaydı, dondurma yapılmadan kesinleşen bir yarışta
            // snapshot'ta jokey puanı varken `jockey_id` NULL kalırdı —
            // sonuç ekranı "jokeyi yok" derdi.
            entry.jockeyId,
          ],
        );
        await this.insertSegments(
          client,
          entry.entryId,
          input.segments.filter((segment) => segment.raceEntryId === entry.entryId),
        );

        // 01.10.2026 — XP: her gerçek katılımcı ve atı, ödemelerle AYNI
        // transaction'da (pratik yarışla aynı tablo — `xpRewards`).
        const progression = this.config.progression;
        await awardXpInTransaction(
          client,
          'players',
          playerIdByEntryId.get(entry.entryId) as string,
          computeRaceXp(entry.finishPosition, progression.xpRewards.player),
          progression,
          input.now,
        );
        await addClubPointsInTransaction(
          client,
          playerIdByEntryId.get(entry.entryId) as string,
          computeRaceXp(entry.finishPosition, progression.xpRewards.player),
          this.config.online,
        );
        const horseId = horseIdByEntryId.get(entry.entryId);
        if (horseId) {
          await awardXpInTransaction(
            client,
            'horses',
            horseId,
            computeRaceXp(entry.finishPosition, progression.xpRewards.horse),
            progression,
            input.now,
          );
        }
      }

      // 8) Bot koltukları — YENİ satırlar. `fieldSize - gerçekOyuncu` kadar
      //    üretilir (use-case). Segmentleri de kendi satırlarına yazılır,
      //    aksi hâlde `GET /races/:id/timeline` yalnızca gerçek oyuncuları
      //    oynatabilirdi.
      for (const botEntry of input.botEntries) {
        await this.insertEntryWithSegments(
          client,
          botEntry,
          input.segments.filter((segment) => segment.raceEntryId === botEntry.id),
        );
      }

      // 9) Yarışı KESİNLEŞTİR. `simulation_seed` BURADA doğar (katılım
      //    anında değil — bkz. `CreateLobbyRaceInput.simulationSeed` doc
      //    yorumu); dört sürüm sütunu da koşan GERÇEK sürümlerle ÜZERİNE
      //    yazılır (`createLobbyRace`'in "beklenen sürüm" notu).
      await client.query(
        `UPDATE races
         SET status = 'finished', simulation_seed = $2, engine_version = $3, ruleset_version = $4,
             config_version = $5, weather_config_version = $6, updated_at = $7
         WHERE id = $1`,
        [
          input.raceId,
          input.simulationSeed,
          input.engineVersion,
          input.rulesetVersion,
          input.configVersion,
          input.weatherConfigVersion,
          input.now,
        ],
      );

      // 10) BİLDİRİMLER — ödemelerle AYNI transaction'da (bkz. `settleLobbyRace`
      //     port doc yorumu: ayrı yazılsaydı "ödül kazandınız" deyip ödemeyen
      //     bir satır kalabilirdi).
      const places: RaceSettlementPlace[] = [];
      for (const entry of input.realEntries) {
        const playerId = playerIdByEntryId.get(entry.entryId) as string;
        const payout = winnerByEntryId.get(entry.entryId) ?? 0;

        await client.query(
          'INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)',
          [
            playerId,
            'race_finished',
            JSON.stringify(
              buildRaceFinishedPayload({
                raceId: input.raceId,
                raceName: input.raceName,
                finishPosition: entry.finishPosition,
              }),
            ),
          ],
        );

        // `prize_won` YALNIZCA gerçekten ödeme yapılanlara. Sıfır tutarlı bir
        // "kazandınız" bildirimi, istemciye 0 Çip gösteren bir satır bırakırdı
        // (`buildPrizeWonPayload` doc yorumu).
        if (payout > 0) {
          await client.query(
            'INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)',
            [
              playerId,
              'prize_won',
              JSON.stringify(
                buildPrizeWonPayload({
                  raceId: input.raceId,
                  raceName: input.raceName,
                  amount: payout,
                }),
              ),
            ],
          );
        }

        places.push({
          finishPosition: entry.finishPosition,
          horseId: entry.horseId,
          playerId,
          displayName: displayNameByEntryId.get(entry.entryId) ?? null,
          participantType: 'human',
          // PHASE 6.2 — `race_entries.jockey_id` ARTIK YAZILIYOR (adım 7).
          // Değer DB'den YENİDEN OKUNMAZ, `input.realEntries`ten gelir:
          // okuma adım 5'te, yazım adım 7'de olduğu için bir `Map` önbelleği
          // BAYAT kalırdı ve sonuç ekranı koşmayan bir jokeyi gösterebilirdi.
          jockeyId: entry.jockeyId,
          // DONDURULMUŞ snapshot'tan okunur (`race_entries.horse_snapshot`,
          // migration 0042) — `input.realEntries[i].horseSnapshot` tam
          // olarak o değerdir. Koşu anındaki canlı statlar DEĞİL.
          startingStats: pickStartingStats(entry.horseSnapshot),
          finalTimeMs: entry.finalTimeMs,
          prizeAmount: payout,
        });
      }

      // Botlar da sonuç listesinde GÖRÜNÜR (sıralamayı onlar doldurur),
      // ama ödül almazlar ve bir oyuncuya bağlı değildirler.
      for (const botEntry of input.botEntries) {
        places.push({
          finishPosition: botEntry.finishPosition ?? 0,
          horseId: botEntry.botLabel ?? '',
          playerId: null,
          displayName: null,
          participantType: 'ai',
          jockeyId: null,
          // Botun snapshot'ı `generateBotEntrants`ın ÜRETTİĞİ değerdir —
          // motora giden de TAM OLARAK budur. Aradaki fark sıfır olmak
          // zorundadır: bir "gizli AI bonusu" eklenirse bu alan onu ELE
          // VERİR (bkz. `race-field-composition.e2e-spec.ts`).
          startingStats: pickStartingStats(assertBotSnapshot(botEntry)),
          finalTimeMs: botEntry.finalTimeMs ?? null,
          prizeAmount: 0,
        });
      }
      places.sort((a, b) => a.finishPosition - b.finishPosition);

      return {
        raceId: input.raceId,
        status: 'finished',
        prizePool: lockedPrizePool,
        settledAt: input.now.toISOString(),
        places,
      };
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
    // PHASE 7.1 (29.09.2026) — config'ten gelen iki değer BURADA doğrulanır,
    // çünkü burası o değerlerin VERİTABANI SATIRINA dönüştüğü TEK yerdir.
    // `game-config` yükleyicisi saf bir cast'tir (çalışma zamanı doğrulaması
    // yok); bozuk bir `grandstand.config.json` aksi hâlde ya `23514` gibi
    // anlaşılmaz bir CHECK ihlaline ya da sessizce "bedava tribün"e
    // dönüşürdü. Doğrulamayı buraya koymak, `assertTicketPriceIsValid`in
    // üretimde ÇAĞIRANI OLMAMASI durumunu da ortadan kaldırır (ölü kod).
    assertTicketPriceIsValid(this.config.grandstand.defaultTribuneFee.amount);
    assertSpectatorCapacityIsValid(this.config.grandstand.defaultSpectatorCapacity);

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
      // `tribune_fee`/`spectator_capacity` ARTIK AÇIKÇA YAZILIR (PHASE 7.1,
      // 29.09.2026). 27.09.2026 – 29.09.2026 arasında bu iki sütun
      // "varsayılanları (0 ve 500) doğrudur" diye ATLANIYORDU ve bu, iki
      // ayrı sorun üretiyordu:
      //   1. `tribune_fee = 0` bir YOKLUK değil, "tribün ÜCRETSİZ" demektir
      //      (`canWatchRaceWithoutTicket`). Sunucu üretimi yarışların
      //      tribünü böylece sessizce bedava oluyordu ve config'teki
      //      `defaultTribuneFee` HİÇBİR ŞEY İFADE ETMİYORDU — ölü config
      //      tuzağı (`CLAUDE.md`, `aiFillEnabled` dersi).
      //   2. Kapasite (500) SQL şemasında gizli bir denge parametresiydi;
      //      "SİHİRLİ SAYI YOK" kuralı gereği okunabilir bir yerden
      //      gelmelidir.
      // İkisi de `grandstand.config.json`'dan gelir.
      `INSERT INTO races (id, track_id, name, distance_m, surface, weather, temperature_c, wind_kmh, humidity_pct, participant_limit, max_players, race_type, entry_fee, prize_pool, tribune_fee, spectator_capacity, start_time, status, simulation_seed, engine_version, ruleset_version, config_version, weather_config_version, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL, NULL, $7, $7, CASE WHEN $8::bigint > 0 THEN 'paid' ELSE 'free' END, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19)`,
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
        this.config.grandstand.defaultTribuneFee.amount,
        this.config.grandstand.defaultSpectatorCapacity,
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
  private async insertEntryWithSegments(
    client: PoolClient,
    entry: RaceEntry,
    segments: RaceSegmentSnapshot[],
  ): Promise<void> {
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
      // `jockey_id` de aynı hatanın İKİNCİ yarısıydı: PHASE 6.2'ye kadar
      // hardcoded `NULL` yazılıyordu ve `RaceEntry.jockeyId` alanı
      // (shared-types) ZATEN vardı — yani çağıranlar değeri geçiriyor,
      // repository onu SESSİZCE ATIYORDU. Artık gerçek bir parametre (`$5`).
      `INSERT INTO race_entries (id, race_id, horse_id, bot_label, jockey_id, gate_position, tactical_style, risk_level, horse_snapshot, final_time_ms, finish_position, performance_score, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        entry.id,
        entry.raceId,
        entry.horseId,
        entry.botLabel,
        entry.jockeyId,
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

    await this.insertSegments(client, entry.id, segments);
  }

  /**
   * TEK bir `race_entries.id`'ye ait segmentleri yazar (§42 PHASE 13.14'te
   * `insertEntryWithSegments`'ten ÇIKARILDI).
   *
   * **NEDEN AYRI BİR METOT:** kesinleşme (`settleLobbyRace`) GERÇEK
   * katılımcıların satırlarını INSERT ETMEZ, UPDATE eder — satırlar
   * katılım anında zaten doğmuştur. Ama segmentleri yine de yazılmalıdır,
   * yoksa yarışın tekrar oynatması (`GET /races/:id/timeline`) yalnızca
   * botları gösterirdi. Metot çıkarılmasaydı aynı 14 sütunluk çoklu-satır
   * INSERT'i ikinci kez kopyalamak gerekirdi — ve bu sorgunun kendi
   * yorumunda yazdığı gibi sütun sayısı/`values.push` sırası/`$${base+n}`
   * numaralandırması ÜÇÜ BİRLİKTE değişmek zorunda olduğundan, iki kopya
   * kaçınılmaz olarak ayrışırdı.
   *
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — botlar da segment
   * yazdığından (önceden yalnızca 1 katılımcı × ~8 segment, şimdi TÜM
   * katılımcılar × ~8 segment), segment BAŞINA ayrı bir `client.query()`
   * round-trip'i (`race.e2e-spec.ts`'in n=100 eşzamanlılık testlerinin
   * CI #93-109'da onlarca turda stabilize edildiği, GERÇEK zamanlama
   * hassasiyeti olan bir ortam) katılımcı sayısıyla ORANTILI olarak
   * ÇOĞALIRDI. Bunun yerine TEK bir çoklu-satır INSERT — round-trip
   * sayısı katılımcı/segment sayısından BAĞIMSIZ olarak sabit kalır
   * (entry başına 1 sorgu).
   */
  private async insertSegments(
    client: PoolClient,
    raceEntryId: string,
    segments: RaceSegmentSnapshot[],
  ): Promise<void> {
    if (segments.length === 0) {
      return;
    }

    const values: unknown[] = [];
    const rowPlaceholders = segments.map((segment, index) => {
      // 14 sütun (migration 0029 iki tane daha ekledi) — `base` çarpanı ve
      // aşağıdaki `values.push` sırası ile `$${base + n}` numaralandırması
      // ÜÇÜ BİRLİKTE değişmelidir; biri güncellenip diğeri unutulursa
      // Postgres ya "bind message supplies N parameters" ya da SESSİZCE
      // KAYMIŞ değerler döndürür.
      const base = index * 14;
      values.push(
        raceEntryId,
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
