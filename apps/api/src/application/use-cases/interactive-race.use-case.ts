import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  InteractiveRaceView,
  PlayerControlInput,
  PracticeRaceResult,
  RaceSurface,
  RaceTimeline,
  RaceWeather,
} from '@at-sevdalisi/shared-types';
import { getRaceTierById } from '../../domain/race/prize';
import {
  InteractiveRaceClosedError,
  InteractiveRaceInProgressError,
  InteractiveRaceNotFinishedError,
  InteractiveRaceNotFoundError,
  InvalidRaceTierError,
} from '../../domain/race/errors';
import {
  applyPlayerControl,
  commandTargetSegment,
  parsePlayerControlInput,
  raceEndMs,
  revealedSegmentCount,
  segmentCountOf,
  toPlayerCommandMap,
} from '../../domain/race/interactive-race';
import { PRACTICE_RACE_DISTANCE_METERS } from '../../domain/race/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import {
  RACE_REPOSITORY,
  type InteractiveRaceRecord,
  type RaceRepository,
} from '../ports/race.repository';
import {
  PRACTICE_RACE_SURFACE,
  PRACTICE_RACE_WEATHER,
  RunPracticeRaceUseCase,
  type PreparedPracticeRace,
  type RunPracticeRaceInput,
} from './run-practice-race.use-case';

const MS_PER_SECOND = 1000;

/**
 * OYUNCU KONTROLLÜ PRATİK YARIŞ (01.10.2026). Oyuncu kırbaç / sol / sağ /
 * sakin düğmeleriyle atı yönetir; yarış SUNUCUDA gerçek zamanlı akar.
 *
 * - Başlatma, anında koşan pratik yarışla AYNI kapılardan geçer
 *   (`RunPracticeRaceUseCase.prepare`) ve giriş ücreti HEMEN düşer.
 * - Her okuma/komutta yarış, o ana kadarki komutlarla GİZLİ tohumla baştan
 *   hesaplanır; yalnızca gösterilmiş segmentler istemciye gider. Komut ilk
 *   gösterilmemiş segmente yazılır (motorun önek değişmezliği sayesinde
 *   gösterilen geçmiş değişmez).
 * - Kesinleşme anında koşan pratik yarışın kayıt yolunu kullanır (ödül,
 *   XP, kulüp puanı, segmentler); oturum satırı kilitliyken, tek sefer.
 *   Oyuncu sayfayı kapatsa da `InteractiveRaceScheduler` kesinleştirir.
 */
@Injectable()
export class InteractiveRaceUseCase {
  private readonly logger = new Logger(InteractiveRaceUseCase.name);

  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(RunPracticeRaceUseCase) private readonly practice: RunPracticeRaceUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async start(
    playerId: string,
    horseId: string,
    input: RunPracticeRaceInput,
    now = new Date(),
  ): Promise<InteractiveRaceView> {
    // Eskimiş bir oturum varsa önce kesinleştir (yeni yarışa engel olmasın).
    const running = await this.raceRepository.findRunningInteractiveRaceId(playerId);
    if (running !== null) {
      await this.tryFinish(running, now);
    }

    const prepared = await this.practice.prepare(horseId, input);
    const startsAt = new Date(
      now.getTime() + this.config.interactiveRace.startCountdownSeconds * MS_PER_SECOND,
    );
    const started = await this.raceRepository.startInteractiveRace({
      id: prepared.raceId,
      playerId,
      horseId,
      tierId: prepared.tier.id,
      simulationSeed: randomUUID(),
      tactic: prepared.tactic,
      entrants: [prepared.playerEntrant, ...prepared.botEntrants],
      jockeyId: prepared.jockeyId,
      entryFee: prepared.tier.entryFee,
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      startsAt,
    });
    if (!started.ok) {
      throw new InteractiveRaceInProgressError(started.runningRaceId);
    }
    return this.view(playerId, prepared.raceId, now);
  }

  async current(playerId: string, now = new Date()): Promise<InteractiveRaceView | null> {
    const id = await this.raceRepository.findRunningInteractiveRaceId(playerId);
    return id === null ? null : this.view(playerId, id, now);
  }

  async view(playerId: string, raceId: string, now = new Date()): Promise<InteractiveRaceView> {
    const record = await this.findOwned(playerId, raceId);
    return this.toView(record, now);
  }

  async command(
    playerId: string,
    raceId: string,
    rawControl: unknown,
    now = new Date(),
  ): Promise<InteractiveRaceView> {
    const control: PlayerControlInput = parsePlayerControlInput(rawControl);
    await this.findOwned(playerId, raceId);
    const updated = await this.raceRepository.updateInteractiveRaceCommands(raceId, (record) => {
      if (record.status !== 'running') {
        throw new InteractiveRaceClosedError(raceId);
      }
      // Gösterim sınırı KİLİT ALTINDA hesaplanır: komut kesinlikle gösterilmemiş bir segmente düşer.
      const timeline = this.simulate(record);
      const entryCount = record.entrants.length;
      const target = commandTargetSegment(
        timeline,
        entryCount,
        this.elapsedMs(record, now),
        this.config.interactiveRace,
      );
      if (target >= segmentCountOf(timeline, entryCount)) {
        throw new InteractiveRaceClosedError(raceId);
      }
      return applyPlayerControl(record.commands, target, control, this.config.race.playerControl);
    });
    if (updated === null) {
      throw new InteractiveRaceNotFoundError(raceId);
    }
    return this.toView(updated, now);
  }

  async finish(playerId: string, raceId: string, now = new Date()): Promise<InteractiveRaceView> {
    await this.findOwned(playerId, raceId);
    const outcome = await this.tryFinish(raceId, now);
    if (outcome === 'not_due') {
      const record = await this.findOwned(playerId, raceId);
      const timeline = this.simulate(record);
      throw new InteractiveRaceNotFinishedError(
        this.remainingMs(record, timeline, now) / this.config.interactiveRace.timeScale,
      );
    }
    return this.view(playerId, raceId, now);
  }

  /** Zamanlayıcı + `start` için: süresi dolmuşsa kesinleştir. Sahiplik kontrolü YAPMAZ. */
  async tryFinish(
    raceId: string,
    now = new Date(),
  ): Promise<'finished' | 'not_due' | 'already_finished' | 'missing'> {
    const outcome = await this.raceRepository.finishInteractiveRace(raceId, (record) => {
      const timeline = this.simulate(record);
      if (this.remainingMs(record, timeline, now) > 0) {
        return null;
      }
      const prepared = this.toPrepared(record);
      const built = this.practice.buildPracticeRaceRecords(prepared, timeline, record.startsAt);
      // Giriş ücreti BAŞLANGIÇTA ödendi: kayıt yolu ikinci kez düşmesin.
      // Yarış satırı yine kademenin ücretini taşır (`race.entryFee`).
      const saveInput = { ...built.saveInput, entryFee: 0 };
      return {
        saveInput,
        result: (balance: { money: number; gems: number }): PracticeRaceResult => ({
          ...this.practice.toResult(prepared, timeline, built, balance),
          entryFee: record.entryFee,
        }),
      };
    });
    if (outcome === null) {
      return 'missing';
    }
    if (outcome.status === 'finished') {
      this.logger.log(`Kontrollü yarış kesinleşti: ${raceId}`);
    }
    return outcome.status;
  }

  private async findOwned(playerId: string, raceId: string): Promise<InteractiveRaceRecord> {
    const record = await this.raceRepository.findInteractiveRace(raceId);
    // Başkasının oturumu 404: varlığı sızdırılmaz.
    if (record === null || record.playerId !== playerId) {
      throw new InteractiveRaceNotFoundError(raceId);
    }
    return record;
  }

  private toPrepared(record: InteractiveRaceRecord): PreparedPracticeRace {
    const tier = getRaceTierById(this.config.economy, record.tierId);
    if (tier === null) {
      throw new InvalidRaceTierError(record.tierId);
    }
    const [playerEntrant, ...botEntrants] = record.entrants;
    return {
      raceId: record.id,
      tier,
      horseId: record.horseId,
      ownerId: record.playerId,
      tactic: record.tactic,
      playerEntrant: playerEntrant!,
      botEntrants,
      jockeyId: record.jockeyId,
      simulationSeed: record.simulationSeed,
    };
  }

  private simulate(record: InteractiveRaceRecord): RaceTimeline {
    const [playerEntrant, ...botEntrants] = record.entrants;
    return this.practice.simulate(
      {
        raceId: record.id,
        playerEntrant: playerEntrant!,
        botEntrants,
        simulationSeed: record.simulationSeed,
      },
      toPlayerCommandMap(record.horseId, record.commands),
    );
  }

  /** Yarış saati (ms): gerçek geçen süre × `timeScale`. */
  private elapsedMs(record: InteractiveRaceRecord, now: Date): number {
    return (now.getTime() - record.startsAt.getTime()) * this.config.interactiveRace.timeScale;
  }

  private remainingMs(record: InteractiveRaceRecord, timeline: RaceTimeline, now: Date): number {
    return (
      raceEndMs(timeline) + this.config.interactiveRace.finishGraceMs - this.elapsedMs(record, now)
    );
  }

  private toView(record: InteractiveRaceRecord, now: Date): InteractiveRaceView {
    const timeline = this.simulate(record);
    const entryCount = record.entrants.length;
    const total = segmentCountOf(timeline, entryCount);
    const finished = record.status === 'finished';
    const revealed = finished
      ? total
      : revealedSegmentCount(
          timeline,
          entryCount,
          this.elapsedMs(record, now),
          this.config.interactiveRace.revealLeadMs,
        );
    return {
      raceId: record.id,
      status: record.status,
      serverNow: now.toISOString(),
      startsAt: record.startsAt.toISOString(),
      timeScale: this.config.interactiveRace.timeScale,
      distanceMeters: record.distanceMeters,
      surface: record.surface as RaceSurface,
      weather: record.weather as RaceWeather,
      segmentCount: total,
      revealedSegments: revealed,
      nextCommandSegment: finished || revealed >= total ? null : revealed,
      playerLabel: record.horseId,
      entrants: record.entrants.map((entrant, index) => ({
        label: entrant.horseId,
        displayName: index === 0 ? 'Senin atın' : `Rakip ${index}`,
        isPlayer: index === 0,
      })),
      segments: timeline.segments.slice(0, revealed * entryCount),
      myCommands: record.commands,
      canFinish: !finished && this.remainingMs(record, timeline, now) <= 0,
      result: record.result,
      outcome:
        record.result === null
          ? null
          : {
              finishPosition:
                record.result.finalResult.find((entry) => entry.horseId === record.result?.horseId)
                  ?.finishPosition ?? 0,
              prizeWon: record.result.prizeWon,
              entryFee: record.result.entryFee,
              xpGained: record.result.xpGained.player,
            },
      kind: 'practice',
    };
  }
}
