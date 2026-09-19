import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  PvpMatch,
  Race,
  RaceEntry,
  RaceJockeyDecision,
  RaceSegmentSnapshot,
  RaceSurface,
  RaceTimelineEntrantView,
  RaceTimelineView,
  RaceWeather,
  RecentRaceResultView,
} from '@at-sevdalisi/shared-types';
import type {
  RaceRepository,
  SavePracticeRaceWithStakesInput,
  SavePracticeRaceWithStakesResult,
} from '../../application/ports/race.repository';
import type { EconomyLedgerEntryInput } from '../../application/ports/economy-ledger';
import { applyPracticeRaceStakes } from '../../domain/race/prize';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PG_POOL, withTransaction } from '../database/database.module';

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
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

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
      final_time_ms: number | null;
      finish_position: number | null;
      performance_score: string | null;
    }>(
      `SELECT re.id AS entry_id, re.horse_id, re.bot_label, h.name AS horse_name,
              re.tactical_style, re.risk_level, re.final_time_ms, re.finish_position, re.performance_score
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
        lane: number | null;
        tactical_state: string | null;
        current_rank: number | null;
        blocked: boolean;
        jockey_decision: string | null;
      }>(
        `SELECT race_entry_id, segment_distance_m, timestamp_ms, position_m, speed, stamina, fatigue, lane, tactical_state, current_rank, blocked, jockey_decision
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
      `INSERT INTO races (id, track_id, name, distance_m, surface, weather, temperature_c, wind_kmh, humidity_pct, participant_limit, entry_fee, prize_pool, start_time, status, simulation_seed, engine_version, ruleset_version, config_version, weather_config_version, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)`,
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
      `INSERT INTO race_entries (id, race_id, horse_id, bot_label, jockey_id, gate_position, tactical_style, risk_level, horse_snapshot, final_time_ms, finish_position, performance_score, created_at)
       VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.id,
        entry.raceId,
        entry.horseId,
        entry.botLabel,
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
      const base = index * 12;
      values.push(
        entry.id,
        segment.segmentDistanceMeters,
        segment.timestampMs,
        segment.positionMeters,
        segment.speed,
        segment.stamina,
        segment.fatigue,
        segment.lane,
        segment.tacticalState,
        segment.currentRank,
        segment.blocked,
        segment.decision,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`;
    });

    await client.query(
      `INSERT INTO race_entry_segments (race_entry_id, segment_distance_m, timestamp_ms, position_m, speed, stamina, fatigue, lane, tactical_state, current_rank, blocked, jockey_decision)
       VALUES ${rowPlaceholders.join(', ')}`,
      values,
    );
  }
}
