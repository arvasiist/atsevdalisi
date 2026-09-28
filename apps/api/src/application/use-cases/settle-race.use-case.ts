import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  RaceEntrantSnapshot,
  RaceEntry,
  RaceSegmentSnapshot,
  RaceSettlementResult,
  RaceSurface,
  RaceTacticInput,
  RaceWeather,
} from '@at-sevdalisi/shared-types';
import { generateBotEntrants } from '../../domain/race/bot-generator';
import { buildHorseEntrantSnapshot, FORM_SAMPLE_SIZE, type TrackFitInput } from '../../domain/race/entrant-snapshot';
import { checkRaceSettleable, nextGatePosition } from '../../domain/race/lobby';
import { computePrizePayouts, resolvePrizeDistribution } from '../../domain/race/prize-distribution';
import { RACE_ENGINE_VERSION, RACE_RULESET_VERSION, simulateRace } from '../../domain/race/race-engine';
import { DEFAULT_RACE_TACTIC } from '../../domain/race/validation';
import { RaceNotFoundError, RaceNotSettleableError } from '../../domain/race/errors';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { HORSE_SURFACE_STATS_REPOSITORY, type HorseSurfaceStatsRepository } from '../ports/horse-surface-stats.repository';
import { HORSE_DISTANCE_STATS_REPOSITORY, type HorseDistanceStatsRepository } from '../ports/horse-distance-stats.repository';
import { HORSE_EQUIPMENT_REPOSITORY, type HorseEquipmentRepository } from '../ports/horse-equipment.repository';
import {
  RACE_REPOSITORY,
  type LobbySettlementEntrant,
  type RaceRepository,
  type SettleLobbyRealEntryResult,
} from '../ports/race.repository';

/**
 * `POST /races/:id/settle` (§42 PHASE 13.14) — ÜCRETLİ LOBİ YARIŞINI KOŞAR
 * VE ÖDÜLÜ DAĞITIR.
 *
 * **BU DİLİM PROJEDEKİ EN BÜYÜK DÜRÜST BOŞLUĞU KAPATIR (PROJE_DURUMU.md
 * §13.13.2).** Ondan önce: oyuncu giriş ücretini ödüyor, para
 * `races.prize_pool`'a giriyor ve HİÇBİR ZAMAN geri dönmüyordu — çünkü
 * `races.status = 'finished'` yalnızca pratik yarış ve PvP yollarında
 * yazılıyordu; lobi yarışını koşturan bir kod yoktu. Aynı eksiklik
 * `race_finished`/`prize_won` bildirimlerinin de üretilememesinin
 * sebebiydi.
 *
 * **KİM ÇAĞIRIR: HERHANGİ BİR KİMLİĞİ DOĞRULANMIŞ OYUNCU.** Uç bir "crank"
 * (zamanlayıcı görevi) gibi çalışır — çağıranın yarışla bir ilgisi olmak
 * zorunda DEĞİLDİR. Bunun nedeni basit: bu projede **zamanlanmış görev
 * altyapısı yok** (cron/worker yok — `race_starting` bildiriminin de
 * üretilememesinin sebebi AYNI). Yarışı yalnızca katılımcılarından birine
 * açsaydık, tüm katılımcılar oyunu kapattığında yarış sonsuza kadar
 * `scheduled` kalır ve para havuzda kilitlenirdi. Crank deseni bunu
 * çözer: yarışı İLK gören koşturur, geri kalanlar 409 alır.
 *
 * **BU YÜZDEN İDEMPOTENCY-Key KULLANILMAZ.** Çift ödemeyi engelleyen şey
 * anahtar değil, DURUM GEÇİŞİDİR: kilit altındaki `checkRaceSettleable`
 * ilk çağrıdan sonra `NOT_SCHEDULED` döner. Ayrı bir anahtar altyapısı
 * eklemek, zaten yapısal olarak imkânsız bir şeyi ikinci kez engellemek
 * olurdu.
 *
 * **KATILIMCI SAYISI `minPlayers`'A TAKILMAZ — bilinçli.** Gerekçenin
 * tamamı `checkRaceSettleable` doc yorumundadır: `startTime` geçtikten
 * sonra ayrılma da kapandığı için "8 oyuncu dolmadı, koşmaz" demek,
 * ödenen ücretleri kalıcı olarak yakmak olurdu. Kalan koltuklar botlarla
 * dolar (`aiFillEnabled`).
 *
 * **BİLİNEN AÇIK PENCERE (dürüstçe):** snapshot, katılım anında değil
 * KOŞMA anında alınır (`joinLobbyRace`'in bilinçli kararı). Crank deseni
 * yüzünden bu an `startTime`'dan saniyeler ya da dakikalar sonra olabilir;
 * yani bir oyuncu `startTime` ile kesinleşme arasında atını
 * eğitebilir/iyileştirebilir ve snapshot bu YENİ hâli yakalar. Bu,
 * sunucu otoritesini ÇİĞNEMEZ (sonucu yine sunucu belirler) ama adaletsiz
 * bir zamanlama avantajıdır. Kapatmanın yolu, `startTime` anında
 * snapshot'ı donduran bir zamanlayıcıdır — yani bu projede HENÜZ OLMAYAN
 * scheduler. Uydurma bir çözüm yerine boşluk burada yazılı bırakıldı.
 */
@Injectable()
export class SettleRaceUseCase {
  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(HORSE_SURFACE_STATS_REPOSITORY) private readonly horseSurfaceStatsRepository: HorseSurfaceStatsRepository,
    @Inject(HORSE_DISTANCE_STATS_REPOSITORY) private readonly horseDistanceStatsRepository: HorseDistanceStatsRepository,
    @Inject(HORSE_EQUIPMENT_REPOSITORY) private readonly horseEquipmentRepository: HorseEquipmentRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(raceId: string): Promise<RaceSettlementResult> {
    const context = await this.raceRepository.findLobbySettlementContext(raceId);
    if (context === null) {
      throw new RaceNotFoundError(raceId);
    }

    const now = new Date();
    // Durum denetimi BURADA da yapılır (repository kilit altında TEKRAR
    // yapar): geçersiz bir istek, aşağıdaki PAHALI simülasyon (onlarca
    // katılımcı × yüzlerce segment) hiç koşmadan reddedilmelidir —
    // `RunPracticeRaceUseCase`'in kademe doğrulamasını en başa almasıyla
    // AYNI gerekçe. Asıl garanti repository'dedir; burası bir kapıdır.
    const rejection = checkRaceSettleable(
      { status: context.status, startTime: context.startTime, joinedPlayers: context.joinedPlayers },
      now,
    );
    if (rejection !== null) {
      throw new RaceNotSettleableError(rejection);
    }

    // SEED, YARIŞ KOŞARKEN ÜRETİLİR — `races.simulation_seed` bu ana kadar
    // NULL'dır ve `GET /races/:id/timeline` onu istemciye vermez (bkz.
    // `CreateLobbyRaceInput.simulationSeed` doc yorumu). `raceId`'yi seed
    // yapmak YASAK olurdu: `raceId` herkese açıktır, dolayısıyla sonuç
    // önceden hesaplanabilirdi.
    const simulationSeed = randomUUID();

    // KULVARLAR — gerçek katılımcılarınki katılım anında çekilmişti
    // (`nextGatePosition`); botlar ve (eski satırlarda) eksik kalanlar
    // burada, aynı "en küçük boş numara" kuralıyla tamamlanır.
    const usedGatePositions = context.entrants
      .map((entrant) => entrant.gatePosition)
      .filter((position): position is number => position !== null);

    const entrantSnapshots: RaceEntrantSnapshot[] = [];
    const realEntryResults: SettleLobbyRealEntryResult[] = [];
    for (const entrant of context.entrants) {
      const snapshot = await this.buildEntrantSnapshot(entrant, context.surface, context.distanceMeters);
      entrantSnapshots.push(snapshot);

      let gatePosition = entrant.gatePosition;
      if (gatePosition === null) {
        gatePosition = nextGatePosition(usedGatePositions);
        usedGatePositions.push(gatePosition);
      }

      realEntryResults.push({
        entryId: entrant.entryId,
        horseId: entrant.horseId,
        horseSnapshot: snapshot,
        // Aşağıda simülasyondan DOLDURULUR; burada yalnızca yer tutucu.
        finalTimeMs: 0,
        finishPosition: 0,
        performanceScore: 0,
        gatePosition,
      });
    }

    const botEntrants = generateBotEntrants(context.fieldSize - context.entrants.length, simulationSeed);
    const botEntries: RaceEntry[] = botEntrants.map((bot) => {
      const gatePosition = nextGatePosition(usedGatePositions);
      usedGatePositions.push(gatePosition);
      return {
        id: randomUUID(),
        raceId,
        horseId: null,
        botLabel: bot.horseId,
        jockeyId: null,
        gatePosition,
        tacticalStyle: bot.tactic.racingStyle,
        riskLevel: bot.tactic.riskLevel,
        // Botun snapshot'ı ZATEN koştuğu hâldir (`generateBotEntrants` onu
        // simülasyon için üretir) — gerçek atlardan farklı olarak ayrıca
        // yüklenmesi gereken bir satırı yoktur.
        horseSnapshot: bot,
        finalTimeMs: null,
        finishPosition: null,
        performanceScore: null,
        createdAt: now.toISOString(),
      };
    });

    const timeline = simulateRace({
      raceId,
      simulationSeed,
      distanceMeters: context.distanceMeters,
      // `context.surface`/`context.weather` VERİTABANINDAN gelen `string`tir
      // (`race.repository` portu bilinçli olarak `string` taşır — repository
      // domain tiplerini bilmez). Daraltma BURADA yapılır: `races` sütunları
      // `validateRaceCreation`'dan geçmiş değerler tutar, yani bu bir
      // varsayım değil bir sözleşmedir.
      surface: context.surface as RaceSurface,
      weather: context.weather as RaceWeather,
      // `RaceSimulationInput` YALNIZCA `temperatureC` taşır — rüzgâr/nem
      // alanları race engine'de YOKTUR (`race-engine.ts` imzası). `races`
      // tablosundaki `wind_kmh`/`humidity_pct` sütunları başka bir amaçla
      // (ileride motor genişlerse) durur; buraya geçirilmeye çalışılırsa
      // tsc zaten reddeder (yaşandı: TS2353).
      temperatureC: context.temperatureC,
      entries: [...entrantSnapshots, ...botEntrants],
      raceConfig: this.config.race,
      weatherConfig: this.config.weather,
    });

    // SİMÜLASYON ETİKETİ → KALICI `race_entries.id` EŞLEMESİ
    // (`RunPracticeRaceUseCase`'teki AYNI desen).
    const entryIdByLabel = new Map<string, string>([
      ...context.entrants.map((entrant): [string, string] => [entrant.horseId, entrant.entryId]),
      ...botEntries.map((entry): [string, string] => [entry.botLabel as string, entry.id]),
    ]);

    for (const result of realEntryResults) {
      const finish = timeline.finalResult.find(
        (finishEntry) => entryIdByLabel.get(finishEntry.horseId) === result.entryId,
      );
      if (finish === undefined) {
        // Motor her katılımcı için bir sonuç üretir; eksikse bu bir
        // bütünlük hatasıdır ve sıfırlarla devam etmek sessizce yanlış
        // sonuç yazardı.
        throw new Error(`Simülasyon ${result.horseId} için sonuç üretmedi.`);
      }
      result.finalTimeMs = finish.finishTimeMs;
      result.finishPosition = finish.finishPosition;
      result.performanceScore = finish.performanceScore;
    }

    for (const entry of botEntries) {
      const finish = timeline.finalResult.find((finishEntry) => finishEntry.horseId === entry.botLabel);
      entry.finalTimeMs = finish?.finishTimeMs ?? null;
      entry.finishPosition = finish?.finishPosition ?? null;
      entry.performanceScore = finish?.performanceScore ?? null;
    }

    const segments: RaceSegmentSnapshot[] = timeline.segments.map((segment) => ({
      ...segment,
      raceEntryId: entryIdByLabel.get(segment.raceEntryId) ?? segment.raceEntryId,
    }));

    // ÖDÜL TUTARLARI — `pool` DIŞARIDAN verilir ve burada `races.prize_pool`
    // sütunudur (kademe yarışındaki `entryFee × fieldSize` DEĞİL; bkz.
    // `prize-distribution.ts` doc yorumu). Paylar config'ten gelir.
    const distribution = resolvePrizeDistribution(this.config.economy, this.config.raceLobby.prizeDistributionId);
    const shares = distribution?.shares ?? [];
    const payouts = computePrizePayouts(context.prizePool, shares);

    return this.raceRepository.settleLobbyRace({
      raceId,
      expectedPrizePool: context.prizePool,
      simulationSeed,
      engineVersion: RACE_ENGINE_VERSION,
      rulesetVersion: RACE_RULESET_VERSION,
      configVersion: this.config.race.version,
      weatherConfigVersion: this.config.weather.version,
      raceName: context.raceName,
      realEntries: realEntryResults,
      botEntries,
      segments,
      payouts,
      now,
    });
  }

  /**
   * Bir katılımcının KOŞTUĞU ANDAKİ snapshot'ı — `RunPracticeRaceUseCase`
   * ile AYNI kurulum (form son sonuçlardan türetilir, track-fit iki
   * istatistik satırından).
   *
   * **TAKTİK: `DEFAULT_RACE_TACTIC` TABANI + KATILIM SATIRININ İKİ ALANI.**
   * `joinLobbyRace` yalnızca `tactical_style`/`risk_level` saklar;
   * `startApproach`/`finalStretchPlan` HİÇ YAZILMAZ (bkz. `RaceJoinInput`).
   * Onları uydurmak yerine varsayılanları kullanmak, "kaydedilmemiş bir
   * kararı sonradan icat etmemek" demektir — motor bu iki alanı bugün
   * zaten OKUMUYOR (bkz. `InvalidRaceTacticError` doc yorumu). Katılım
   * formu bu iki alanı toplamaya başladığında buranın da güncellenmesi
   * gerekir; bu bilinçli bir açık uçtur.
   */
  private async buildEntrantSnapshot(
    entrant: LobbySettlementEntrant,
    surface: string,
    distanceMeters: number,
  ): Promise<RaceEntrantSnapshot> {
    const horse = await this.horseRepository.findById(entrant.horseId);
    if (horse === null) {
      throw new HorseNotFoundError(entrant.horseId);
    }
    const stats = await this.horseStatsRepository.findByHorseId(entrant.horseId);
    if (stats === null) {
      throw new HorseNotFoundError(entrant.horseId);
    }

    const recentResults = await this.raceRepository.findRecentResultsByHorseId(entrant.horseId, FORM_SAMPLE_SIZE);
    const [surfaceStats, distanceStats, equippedItems] = await Promise.all([
      this.horseSurfaceStatsRepository.findByHorseId(entrant.horseId),
      this.horseDistanceStatsRepository.findByHorseId(entrant.horseId),
      this.horseEquipmentRepository.findEquippedByHorseId(entrant.horseId),
    ]);

    const trackFit: TrackFitInput | null =
      surfaceStats === null || distanceStats === null
        ? null
        : { surfaceStats, distanceStats, surface: surface as RaceSurface, distanceMeters };

    const tactic: RaceTacticInput = {
      racingStyle: entrant.tacticalStyle,
      riskLevel: entrant.riskLevel,
      startApproach: DEFAULT_RACE_TACTIC.startApproach,
      finalStretchPlan: DEFAULT_RACE_TACTIC.finalStretchPlan,
    };

    return buildHorseEntrantSnapshot(horse, stats, tactic, recentResults, trackFit, equippedItems);
  }
}
