import { computeRaceXp } from '../../domain/progression/progression';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  PracticeRaceResult,
  Race,
  RaceEntrantSnapshot,
  RaceEntry,
  RaceFinishEntry,
  RaceSegmentSnapshot,
  RaceTacticInput,
  RaceTimeline,
} from '@at-sevdalisi/shared-types';
import type { RaceTierConfig } from '@at-sevdalisi/game-config';
import { generateBotEntrants } from '../../domain/race/bot-generator';
import {
  buildHorseEntrantSnapshot,
  FORM_SAMPLE_SIZE,
  type TrackFitInput,
} from '../../domain/race/entrant-snapshot';
import { assignGatePositions } from '../../domain/race/gate-assignment';
import { effectiveJockeySkill } from '../../domain/jockey/jockey';
import {
  computeRacePool,
  getDefaultRaceTier,
  getRacePrize,
  getRaceTierById,
} from '../../domain/race/prize';
import { checkRaceReadiness } from '../../domain/race/readiness';
import {
  RACE_ENGINE_VERSION,
  RACE_RULESET_VERSION,
  simulateRace,
  type PlayerSegmentCommand,
} from '../../domain/race/race-engine';
import { PRACTICE_RACE_DISTANCE_METERS } from '../../domain/race/validation';
import { HorseNotReadyToRaceError, InvalidRaceTierError } from '../../domain/race/errors';
import {
  HorseInjuredError,
  HorseListedInMarketError,
  HorseNotFoundError,
} from '../../domain/horse/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import {
  HORSE_SURFACE_STATS_REPOSITORY,
  type HorseSurfaceStatsRepository,
} from '../ports/horse-surface-stats.repository';
import {
  HORSE_DISTANCE_STATS_REPOSITORY,
  type HorseDistanceStatsRepository,
} from '../ports/horse-distance-stats.repository';
import {
  HORSE_EQUIPMENT_REPOSITORY,
  type HorseEquipmentRepository,
} from '../ports/horse-equipment.repository';
import { JOCKEY_REPOSITORY, type JockeyRepository } from '../ports/jockey.repository';
import {
  RACE_REPOSITORY,
  type RaceRepository,
  type SavePracticeRaceWithStakesInput,
} from '../ports/race.repository';
import {
  MARKET_LISTING_REPOSITORY,
  type MarketListingRepository,
} from '../ports/market-listing.repository';

export interface RunPracticeRaceInput {
  tactic: RaceTacticInput;
  /**
   * Seçilen yarış kademesi (`config/economy.config.json` → `raceTiers[].id`).
   * `null`/verilmezse `getDefaultRaceTier` (listenin ilk elemanı) kullanılır
   * — `docs/API.md` §4 örnek isteği gibi kademe göndermeyen çağrılar
   * çalışmaya devam eder.
   */
  tierId?: string | null;
}

export const PRACTICE_RACE_SURFACE = 'grass' as const;
export const PRACTICE_RACE_WEATHER = 'sunny' as const;

/** 01.10.2026 — hazırlanmış (kapılardan geçmiş, donmuş) pratik yarış. */
export interface PreparedPracticeRace {
  raceId: string;
  tier: RaceTierConfig;
  horseId: string;
  ownerId: string;
  tactic: RaceTacticInput;
  playerEntrant: RaceEntrantSnapshot;
  botEntrants: RaceEntrantSnapshot[];
  jockeyId: string | null;
  /** Verilmezse `raceId` (anında koşan pratik yarışın eski davranışı). Canlı yarışta GİZLİ ayrı tohum. */
  simulationSeed?: string;
}

export interface BuiltPracticeRace {
  playerFinish: RaceFinishEntry;
  prizePool: number;
  saveInput: SavePracticeRaceWithStakesInput;
}

/**
 * `POST /horses/{id}/practice-race` (docs/API.md §4, brief §6 Race Engine).
 *
 * AUDIT_REPORT.md Bulgu H2 (Medium):
 * Pazarda aktif ilanı olan bir at yarışa sokulamaz.
 *
 * AUDIT_REPORT.md Bulgu E1 (High, bu oturum) — bu use-case artık
 * `PLAYER_REPOSITORY`'yi HİÇ enjekte ETMEZ: cüzdan mutasyonu +
 * yarış/ledger kaydı `raceRepository.savePracticeRaceWithStakes` içinde
 * TEK bir atomik transaction'da birleştirildi (bkz. o port metodunun doc
 * yorumu) — önceden bunlar `playerRepository.updateWithLock` + `raceRepository.
 * savePracticeRace` olarak İKİ AYRI transaction'dı.
 */
@Injectable()
export class RunPracticeRaceUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(HORSE_SURFACE_STATS_REPOSITORY)
    private readonly horseSurfaceStatsRepository: HorseSurfaceStatsRepository,
    @Inject(HORSE_DISTANCE_STATS_REPOSITORY)
    private readonly horseDistanceStatsRepository: HorseDistanceStatsRepository,
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(MARKET_LISTING_REPOSITORY)
    private readonly marketListingRepository: MarketListingRepository,
    @Inject(HORSE_EQUIPMENT_REPOSITORY)
    private readonly horseEquipmentRepository: HorseEquipmentRepository,
    // PHASE 6.2 (29.09.2026) — jokey ARTIK PRATİK YARIŞTA DA ETKİLİ.
    // Yalnızca ücretli lobi yarışına bağlamak, oyuncunun en sık
    // kullandığı yolda (tek başına pratik) jokeyin HİÇBİR etkisi
    // olmadığı anlamına gelirdi — ve oyuncu bunu "jokey işe yaramıyor"
    // diye okurdu. Jokey sahibi OYUNCUDUR, at değil; bu yüzden
    // `horse.ownerId` üzerinden çözülür.
    @Inject(JOCKEY_REPOSITORY) private readonly jockeyRepository: JockeyRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * 01.10.2026 — pratik yarışın HAZIRLIĞI (tüm uygunluk kapıları + donmuş
   * snapshot'lar + botlar). Anında koşan pratik yarış (`execute`) ve oyuncu
   * kontrollü canlı yarış (`InteractiveRaceUseCase`) AYNI kapılardan geçsin
   * diye ayrıldı; iki kopya ayrışamaz.
   */
  async prepare(
    horseId: string,
    input: RunPracticeRaceInput,
    raceId: string = randomUUID(),
  ): Promise<PreparedPracticeRace> {
    // KADEME ÇÖZÜMÜ ÖNCE (proje sahibinin açık talebi, 27.09.2026) —
    // gövdeden gelen `tierId` yalnızca config'e karşı doğrulanır, hiç DB
    // okumaz. En başta yapılmasının nedeni: geçersiz bir kademe isteği,
    // aşağıdaki PAHALI yarış simülasyonu (yüzlerce segment) hiç
    // çalıştırılmadan reddedilmelidir. DTO'da `@IsIn` KULLANILAMAZ çünkü
    // kademe kimlikleri statik değil, config'ten gelir — ve esbuild
    // altında DTO doğrulaması zaten atlanabilir (bkz. CLAUDE.md), yani
    // gerçek kontrolün yeri her hâlükârda burasıdır.
    const tier: RaceTierConfig | null =
      input.tierId === undefined || input.tierId === null
        ? getDefaultRaceTier(this.config.economy)
        : getRaceTierById(this.config.economy, input.tierId);
    if (tier === null) {
      throw new InvalidRaceTierError(input.tierId ?? '(varsayılan)');
    }

    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }
    if (horse.status === 'injured') {
      throw new HorseInjuredError(horseId);
    }

    // "HAZIR OLAN KİŞİLER YARIŞABİLSİNLER" (proje sahibinin açık talebi,
    // 27.09.2026) — bkz. `domain/race/readiness.ts` doc yorumu: bu,
    // `HorseInjuredError`'ın YERİNE GEÇMEZ (o, `docs/API.md`de
    // `HORSE_INJURED` olarak sabitlenmiş ayrı bir sözleşmedir), onu
    // TAMAMLAR — sakatlık dışındaki `resting`/`retired` durumları, yetersiz
    // sağlık, aşırı yorgunluk ve yetersiz enerji de engeldir. Bu kontrol
    // para hareketinden ÖNCE çalışır, yani hazır olmayan bir at için
    // HİÇBİR Çip hareket etmez.
    const readiness = checkRaceReadiness(
      horse.status,
      // `train-horse.use-case.ts` ile AYNI açık kurulum: `Horse` yapısal
      // olarak `VitalSigns`'a uyar ama burada ALANLAR TEK TEK yazılır ki
      // `Horse`a yeni bir vital alanı eklenip `VitalSigns`'a eklenmezse
      // sessizce eksik bir kontrol doğmasın (derleyici burada uyarır).
      {
        health: horse.health,
        fitness: horse.fitness,
        fatigue: horse.fatigue,
        energy: horse.energy,
        morale: horse.morale,
      },
      this.config.race.readiness,
    );
    if (!readiness.ready && readiness.reason !== null) {
      throw new HorseNotReadyToRaceError(readiness.reason);
    }

    // H2 KONTROLÜ: Pazarda aktif bir ilanı var mı?
    const activeListing = await this.marketListingRepository.findActiveByHorseId(horseId);
    if (activeListing !== null) {
      throw new HorseListedInMarketError(horseId);
    }

    const stats = await this.horseStatsRepository.findByHorseId(horseId);
    if (stats === null) {
      throw new HorseNotFoundError(horseId);
    }

    // AUDIT_REPORT.md Bulgu R3 (önceki oturum) — `form` alanı artık bu atın
    // KENDİ son `FORM_SAMPLE_SIZE` sonuçlanmış yarışından türetiliyor (bkz.
    // `deriveFormFromRecentResults` doc yorumu). Botların bu sorguya
    // ihtiyacı yok (`generateBotEntrants` her zaman nötr 50 kullanır).
    const recentResults = await this.raceRepository.findRecentResultsByHorseId(
      horseId,
      FORM_SAMPLE_SIZE,
    );

    // R3 — Track Fit (bu turda EKLENDİ) — `PostgresHorseRepository.save()`
    // + migration 0026 backfill'i sayesinde HER atın bu iki satırı olması
    // GEREKİR (`horse_stats` ile AYNI veri bütünlüğü varsayımı) — yine de
    // `null` dönerse (`horse-owner.guard.ts` ile AYNI "ulaşılamaz dal"
    // savunması) `buildHorseEntrantSnapshot`'a `trackFit: null` geçilir,
    // yani surfaceCompatibility/distanceCompatibility nötr (50) kalır
    // (ÇÖKMEZ) — bkz. o fonksiyonun `trackFit` parametresinin doc yorumu.
    // Ekipman (bu turda EKLENDİ) — mevcut Promise.all'a EKLENDİ (salt
    // okunur, `surfaceStats`/`distanceStats` sorgularıyla AYNI kategori).
    // PHASE 6.2 — jokey de mevcut `Promise.all`a eklendi (salt okunur,
    // `equippedItems` ile AYNI kategori). `null` ise nötr 50 (gizli bonus YOK).
    const [surfaceStats, distanceStats, equippedItems, jockey] = await Promise.all([
      this.horseSurfaceStatsRepository.findByHorseId(horseId),
      this.horseDistanceStatsRepository.findByHorseId(horseId),
      this.horseEquipmentRepository.findEquippedByHorseId(horseId),
      this.jockeyRepository.findByOwnerId(horse.ownerId),
    ]);
    const trackFit: TrackFitInput | null =
      surfaceStats === null || distanceStats === null
        ? null
        : {
            surfaceStats,
            distanceStats,
            surface: PRACTICE_RACE_SURFACE,
            distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
          };

    const playerEntrant = buildHorseEntrantSnapshot(
      horse,
      stats,
      input.tactic,
      recentResults,
      trackFit,
      equippedItems,
      // PHASE 6.2 — oyuncunun kiralı jokeyi varsa puanı, yoksa `null`
      // (motor nötre çevirir). Botlarınki BİLEREK nötr kalır.
      // 02.10.2026 — uyum dahil (`effectiveJockeySkill`).
      jockey === null
        ? null
        : effectiveJockeySkill(
            {
              jockey,
              horse: { temperament: stats.temperament, racingStyle: input.tactic.racingStyle },
              previousPairAveragePerformance:
                await this.raceRepository.findJockeyPairAveragePerformance(horseId, jockey.id),
            },
            this.config.jockey,
          ),
    );
    // ALAN DOLDURMA (proje sahibinin açık talebi, 27.09.2026): bot sayısı
    // artık sabit değil, kademenin `fieldSize`'ından türer — oyuncunun
    // kendi atı alanın BİR üyesi olduğundan `fieldSize − 1` rakip üretilir
    // (8/10/12/14/16 at → 7/9/11/13/15 bot). `generateBotEntrants` sayıyı
    // ZATEN parametre olarak alıyordu (eski sabit çağıran taraftaydı), yani
    // bu değişiklik motor/bot üretim mantığına DOKUNMAZ.
    const botEntrants = generateBotEntrants(tier.fieldSize - 1, raceId);

    return {
      raceId,
      tier,
      horseId,
      ownerId: horse.ownerId,
      tactic: input.tactic,
      playerEntrant,
      botEntrants,
      jockeyId: jockey === null ? null : jockey.id,
    };
  }

  async execute(horseId: string, input: RunPracticeRaceInput): Promise<PracticeRaceResult> {
    const prepared = await this.prepare(horseId, input);
    const timeline = this.simulate(prepared);

    const built = this.buildPracticeRaceRecords(prepared, timeline, new Date());
    const newBalance = await this.raceRepository.savePracticeRaceWithStakes(built.saveInput);
    return this.toResult(prepared, timeline, built, newBalance);
  }

  /** Hazırlanmış yarışı koşar; `playerCommands` yalnızca oyuncu kontrollü yarışta verilir. */
  simulate(
    prepared: Pick<
      PreparedPracticeRace,
      'raceId' | 'playerEntrant' | 'botEntrants' | 'simulationSeed'
    >,
    playerCommands?: ReadonlyMap<string, ReadonlyMap<number, PlayerSegmentCommand>>,
  ): RaceTimeline {
    return simulateRace({
      raceId: prepared.raceId,
      simulationSeed: prepared.simulationSeed ?? prepared.raceId,
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      temperatureC: null,
      entries: [prepared.playerEntrant, ...prepared.botEntrants],
      raceConfig: this.config.race,
      weatherConfig: this.config.weather,
      playerCommands,
    });
  }

  /**
   * 01.10.2026 — koşulmuş bir pratik yarışın kayıt satırları (yarış,
   * katılımlar, segmentler) + para girdisi. `execute` ve canlı yarışın
   * kesinleşmesi AYNI fonksiyonu kullanır.
   */
  buildPracticeRaceRecords(
    prepared: PreparedPracticeRace,
    timeline: RaceTimeline,
    now: Date,
  ): BuiltPracticeRace {
    const { raceId, tier, horseId, botEntrants, playerEntrant, tactic, jockeyId } = prepared;
    const playerFinish = timeline.finalResult.find(
      (finishEntry) => finishEntry.horseId === horseId,
    );
    if (playerFinish === undefined) {
      throw new HorseNotFoundError(horseId);
    }

    // EKONOMİ (proje sahibinin açık talebi, 27.09.2026) — bkz.
    // `domain/race/prize.ts` doc yorumundaki tam model. Oyuncunun ödediği
    // ücret kademeden gelir; havuz TÜM katılımcıların ücretidir (botlar da
    // "ödedi" sayılır) ve ödül bu havuzun bir PAYIDIR. `prizeWon`, ödül
    // almayan bir sırada 0 olur — bu olağan bir durumdur (her dağıtımda
    // yalnızca `shares.length` kadar sıra ödül alır) ve
    // `applyPracticeRaceStakes` sıfır miktarda `credit` ÇAĞIRMADIĞI için
    // 500 hatası üretmez (bkz. o fonksiyonun doc yorumundaki CI hatası).
    //
    // §42 PHASE 5: `getRacePrize` artık `config` de alır — oranlar kademenin
    // kendi alanı değil, `distributionId`'nin çözdüğü dağıtımdır.
    const entryFee = tier.entryFee;
    const prizePool = computeRacePool(tier);
    const prizeWon = getRacePrize(this.config.economy, tier, playerFinish.finishPosition);

    // AUDIT_REPORT.md Bulgu R3 (bu oturum) — "Draw/post-position" artık
    // gerçek bir çekilişten türetiliyor (bkz. `gate-assignment.ts` doc
    // yorumu). Simülasyon ZATEN tamamlandıktan SONRA, tamamen AYRI bir
    // isim uzayında (`:gate-draw`) çağrılır — motor/denge SIFIR etkilenir.
    const gatePositionByLabel = assignGatePositions(
      [horseId, ...botEntrants.map((bot) => bot.horseId)],
      timeline.simulationSeed,
      raceId,
    );

    const race: Race = {
      id: raceId,
      trackId: null,
      // Kademenin adı ("Mahalli Koşu" vb.) — önceden her pratik yarış
      // "Pratik Yarış" adını taşıyordu ve kademe kavramı yoktu. Bu ad
      // `GET /players/:id/recent-races` ("Son Yarış Sonuçları" paneli)
      // üzerinden oyuncuya AYNEN gösterilir, yani artık hangi kademede
      // koştuğunu geçmişinde görebilir.
      name: tier.label,
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      temperatureC: null,
      windKmh: null,
      humidityPct: null,
      participantLimit: tier.fieldSize,
      entryFee,
      // DÜZELTME (proje sahibinin açık talebi, 27.09.2026) — bu alan
      // ÖNCEDEN `prizeWon`a yazılıyordu, yani "havuz" aslında oyuncunun
      // KENDİ kazancıydı (havuz kavramı yoktu). Artık gerçek havuzdur
      // (`entryFee × fieldSize`); `prizeWon` ayrı bir alan olarak yanıtta
      // döner. Bkz. `PracticeRaceResult` doc yorumu.
      prizePool,
      startTime: now.toISOString(),
      status: 'finished',
      simulationSeed: timeline.simulationSeed,
      engineVersion: RACE_ENGINE_VERSION,
      rulesetVersion: RACE_RULESET_VERSION,
      configVersion: this.config.race.version,
      // AUDIT_REPORT.md R1 (bu oturum) — bkz. `Race.weatherConfigVersion` doc yorumu.
      weatherConfigVersion: this.config.weather.version,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const raceEntry: RaceEntry = {
      id: randomUUID(),
      raceId,
      horseId,
      botLabel: null,
      // PHASE 6.2 — koşan jokey kaydedilir (snapshot'taki puanla AYNI
      // okumadan). Bot satırları (`botRaceEntries`) `null` kalır: onların
      // jokeyi yoktur ve sonuç ekranı bunu doğru göstermelidir.
      jockeyId: jockeyId,
      gatePosition: gatePositionByLabel.get(horseId) ?? null,
      tacticalStyle: tactic.racingStyle,
      riskLevel: tactic.riskLevel,
      horseSnapshot: playerEntrant,
      finalTimeMs: playerFinish.finishTimeMs,
      finishPosition: playerFinish.finishPosition,
      performanceScore: playerFinish.performanceScore,
      createdAt: now.toISOString(),
    };

    // AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — botlar ARTIK oyuncunun
    // atıyla AYNI şekilde `race_entries`/`race_entry_segments`'e yazılır
    // (bkz. `RaceEntry.botLabel` doc yorumu, migration 0025). `botEntrants`
    // listesindeki SIRA korunur; her bota `timeline`'daki KENDİ orijinal
    // simülasyon-içi etiketiyle (`bot.horseId`, ör. "bot-1") eşleşen
    // `finalResult`/`segments` verisi atanır, sonra kalıcı `race_entries.id`'ye
    // YENİDEN eşlenir (`playerSegments`'teki AYNI `raceEntryId` yeniden
    // eşleme deseni).
    const botRaceEntries: RaceEntry[] = botEntrants.map((bot) => {
      const botFinish = timeline.finalResult.find(
        (finishEntry) => finishEntry.horseId === bot.horseId,
      );
      return {
        id: randomUUID(),
        raceId,
        horseId: null,
        botLabel: bot.horseId,
        jockeyId: null,
        gatePosition: gatePositionByLabel.get(bot.horseId) ?? null,
        tacticalStyle: bot.tactic.racingStyle,
        riskLevel: bot.tactic.riskLevel,
        horseSnapshot: bot,
        finalTimeMs: botFinish?.finishTimeMs ?? null,
        finishPosition: botFinish?.finishPosition ?? null,
        performanceScore: botFinish?.performanceScore ?? null,
        createdAt: now.toISOString(),
      };
    });

    const allEntries: RaceEntry[] = [raceEntry, ...botRaceEntries];
    const entryIdBySimulationLabel = new Map<string, string>([
      [horseId, raceEntry.id],
      ...botRaceEntries.map((entry): [string, string] => [entry.botLabel as string, entry.id]),
    ]);
    const allSegments: RaceSegmentSnapshot[] = timeline.segments.map((segment) => ({
      ...segment,
      raceEntryId: entryIdBySimulationLabel.get(segment.raceEntryId) ?? segment.raceEntryId,
    }));

    // AUDIT_REPORT.md Bulgu E1 (bu oturum) — bkz. `RaceRepository.
    // savePracticeRaceWithStakes` doc yorumu: cüzdan mutasyonu ile yarış
    // kaydı ARTIK TEK bir atomik transaction'da yazılıyor (önceden
    // `playerRepository.updateWithLock` + `raceRepository.savePracticeRace`
    // İKİ AYRI transaction'dı — biri commit olup diğeri başarısız olursa
    // para hareket etmiş ama yarış kaydı yok kalabiliyordu).
    return {
      playerFinish,
      prizePool,
      saveInput: {
        race,
        entries: allEntries,
        segments: allSegments,
        playerId: prepared.ownerId,
        entryFee,
        prizeWon,
      },
    };
  }

  toResult(
    prepared: PreparedPracticeRace,
    timeline: RaceTimeline,
    built: BuiltPracticeRace,
    newBalance: { money: number; gems: number },
  ): PracticeRaceResult {
    const { tier, raceId, horseId } = prepared;
    const { playerFinish, prizePool } = built;
    const { entryFee, prizeWon } = built.saveInput;
    return {
      raceId,
      horseId,
      tierId: tier.id,
      tierLabel: tier.label,
      fieldSize: tier.fieldSize,
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      finalResult: timeline.finalResult,
      explanations: timeline.explanations,
      entryFee,
      prizePool,
      prizeWon,
      newBalance,
      xpGained: {
        player: computeRaceXp(
          playerFinish.finishPosition,
          this.config.progression.xpRewards.player,
        ),
        horse: computeRaceXp(playerFinish.finishPosition, this.config.progression.xpRewards.horse),
      },
    };
  }
}
