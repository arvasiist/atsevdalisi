import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  Horse,
  HorseStatField,
  NumericHorseStatField,
  TrainHorseResult,
  TrainingIntensity,
  TrainingType,
} from '@at-sevdalisi/shared-types';
import { calculateAgeInMonths } from '../../domain/horse/age-curve';
import { HorseInjuredError, HorseListedInMarketError, HorseNotFoundError } from '../../domain/horse/errors';
import { applyVitalDelta } from '../../domain/horse/vital-signs';
import { applyTraining, getPrimaryStatKey, rollInjuryOccurred } from '../../domain/training/training';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { TRAINING_SESSION_REPOSITORY, type TrainingSessionRepository } from '../ports/training-session.repository';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';

export interface TrainHorseInput {
  type: TrainingType;
  intensity: TrainingIntensity;
  durationMinutes: number;
}

/**
 * `POST /horses/{id}/train` (docs/API.md §4, brief §10).
 *
 * AUDIT_REPORT.md Bulgu H2 (Medium):
 * Pazarda aktif ilanı olan bir at antrenmana sokulamaz.
 */
@Injectable()
export class TrainHorseUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(TRAINING_SESSION_REPOSITORY) private readonly trainingSessionRepository: TrainingSessionRepository,
    @Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string, input: TrainHorseInput): Promise<TrainHorseResult> {
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

    const statKey: NumericHorseStatField | null = getPrimaryStatKey(input.type);
    const currentStatValue: number = statKey === null ? 0 : stats[statKey];
    const now = new Date();
    const ageMonths = calculateAgeInMonths(new Date(horse.birthDate), now);
    const vitals = {
      health: horse.health,
      fitness: horse.fitness,
      fatigue: horse.fatigue,
      energy: horse.energy,
      morale: horse.morale,
    };

    const outcome = applyTraining(this.config.training, {
      trainingType: input.type,
      intensity: input.intensity,
      durationMinutes: input.durationMinutes,
      currentStatValue,
      potential: horse.potential,
      vitals,
      ageMonths,
    });

    const sessionId = randomUUID();
    const injuryOccurred = rollInjuryOccurred(outcome.injuryRisk, `${sessionId}:injury`);
    const newVitals = applyVitalDelta(vitals, { fatigue: outcome.fatigueGain });

    const updatedHorse: Horse = {
      ...horse,
      fatigue: newVitals.fatigue,
      status: injuryOccurred ? 'injured' : horse.status,
      updatedAt: now.toISOString(),
    };
    await this.horseRepository.update(updatedHorse);

    const statChanges: Partial<Record<HorseStatField, number>> = {};
    if (statKey !== null && outcome.statGain > 0) {
      await this.horseStatsRepository.updateStatValue(horseId, statKey, currentStatValue + outcome.statGain);
      statChanges[statKey] = outcome.statGain;
    }

    await this.trainingSessionRepository.save({
      id: sessionId,
      horseId,
      type: input.type,
      intensity: input.intensity,
      durationMinutes: input.durationMinutes,
      statGain: statChanges,
      fatigueGain: outcome.fatigueGain,
      injuryRisk: outcome.injuryRisk,
      injuryOccurred,
      createdAt: now.toISOString(),
    });

    return {
      horseId,
      statChanges,
      fatigueGain: outcome.fatigueGain,
      injuryOccurred,
      newStatus: { fatigue: newVitals.fatigue, energy: newVitals.energy, morale: newVitals.morale },
    };
  }
}