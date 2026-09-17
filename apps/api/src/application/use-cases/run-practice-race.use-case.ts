import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Player, PracticeRaceResult, Race, RaceEntry, RaceSegmentSnapshot, RaceTacticInput } from '@at-sevdalisi/shared-types';
import { generateBotEntrants } from '../../domain/race/bot-generator';
import { buildHorseEntrantSnapshot } from '../../domain/race/entrant-snapshot';
import { applyPracticeRaceStakes, getPracticeRaceEntryFee, getPracticeRacePrize } from '../../domain/race/prize';
import { RACE_ENGINE_VERSION, RACE_RULESET_VERSION, simulateRace } from '../../domain/race/race-engine';
import { PRACTICE_RACE_BOT_COUNT, PRACTICE_RACE_DISTANCE_METERS } from '../../domain/race/validation';
import { HorseInjuredError, HorseListedInMarketError, HorseNotFoundError } from '../../domain/horse/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';

export interface RunPracticeRaceInput {
  tactic: RaceTacticInput;
}

const PRACTICE_RACE_SURFACE = 'grass' as const;
const PRACTICE_RACE_WEATHER = 'sunny' as const;

/**
 * `POST /horses/{id}/practice-race` (docs/API.md §4, brief §6 Race Engine).
 *
 * AUDIT_REPORT.md Bulgu H2 (Medium):
 * Pazarda aktif ilanı olan bir at yarışa sokulamaz.
 */
@Injectable()
export class RunPracticeRaceUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string, input: RunPracticeRaceInput): Promise<PracticeRaceResult> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }
    if (horse.status === 'injured') {
      throw new HorseInjuredError(horseId);
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

    const raceId = randomUUID();
    const playerEntrant = buildHorseEntrantSnapshot(horse, stats, input.tactic);
    const botEntrants = generateBotEntrants(PRACTICE_RACE_BOT_COUNT, raceId);

    const timeline = simulateRace({
      raceId,
      simulationSeed: raceId,
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      temperatureC: null,
      entries: [playerEntrant, ...botEntrants],
      raceConfig: this.config.race,
      weatherConfig: this.config.weather,
    });

    const playerFinish = timeline.finalResult.find((finishEntry) => finishEntry.horseId === horseId);
    if (playerFinish === undefined) {
      throw new HorseNotFoundError(horseId);
    }

    const entryFee = getPracticeRaceEntryFee(this.config.economy);
    const prizeWon = getPracticeRacePrize(playerFinish.finishPosition, this.config.economy);
    const walletResult = await this.playerRepository.updateWithLock(horse.ownerId, (player) => {
      const afterStakes = applyPracticeRaceStakes({ money: player.money, gems: player.gems }, entryFee, prizeWon);

      const updated: Player = {
        ...player,
        money: afterStakes.money,
        gems: afterStakes.gems,
        updatedAt: new Date().toISOString(),
      };

      const ledgerEntries = [
        ...(entryFee > 0
          ? [
              {
                playerId: horse.ownerId,
                type: 'practice_race_entry_fee',
                amount: -entryFee,
                currency: 'money' as const,
                referenceType: 'race',
                referenceId: raceId,
                balanceBefore: player.money,
                balanceAfter: player.money - entryFee,
                idempotencyKey: null,
              },
            ]
          : []),
        ...(prizeWon > 0
          ? [
              {
                playerId: horse.ownerId,
                type: 'practice_race_prize',
                amount: prizeWon,
                currency: 'money' as const,
                referenceType: 'race',
                referenceId: raceId,
                balanceBefore: player.money - entryFee,
                balanceAfter: afterStakes.money,
                idempotencyKey: null,
              },
            ]
          : []),
      ];

      return { player: updated, result: afterStakes, ledgerEntries };
    });

    if (walletResult === null) {
      throw new PlayerNotFoundError(horse.ownerId);
    }

    const now = new Date();
    const race: Race = {
      id: raceId,
      trackId: null,
      name: 'Pratik Yarış',
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      temperatureC: null,
      windKmh: null,
      humidityPct: null,
      participantLimit: botEntrants.length + 1,
      entryFee,
      prizePool: prizeWon,
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
      jockeyId: null,
      gatePosition: null,
      tacticalStyle: input.tactic.racingStyle,
      riskLevel: input.tactic.riskLevel,
      horseSnapshot: playerEntrant,
      finalTimeMs: playerFinish.finishTimeMs,
      finishPosition: playerFinish.finishPosition,
      performanceScore: playerFinish.performanceScore,
      createdAt: now.toISOString(),
    };

    const playerSegments: RaceSegmentSnapshot[] = timeline.segments
      .filter((segment) => segment.raceEntryId === horseId)
      .map((segment) => ({ ...segment, raceEntryId: raceEntry.id }));

    await this.raceRepository.savePracticeRace(race, raceEntry, playerSegments);

    return {
      raceId,
      horseId,
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      finalResult: timeline.finalResult,
      explanations: timeline.explanations,
      entryFee,
      prizeWon,
      newBalance: walletResult,
    };
  }
}