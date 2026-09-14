import { Inject, Injectable } from '@nestjs/common';
import type { CareActionType, PerformCareActionResult } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { applyCareAction } from '../../domain/care/care';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { CARE_LOG_REPOSITORY, type CareLogRepository } from '../ports/care-log.repository';
import { HORSE_HEALTH_REPOSITORY, type HorseHealthRepository } from '../ports/horse-health.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

@Injectable()
export class PerformCareActionUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_HEALTH_REPOSITORY) private readonly horseHealthRepository: HorseHealthRepository,
    @Inject(CARE_LOG_REPOSITORY) private readonly careLogRepository: CareLogRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string, actionType: CareActionType): Promise<PerformCareActionResult> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }

    const health = await this.horseHealthRepository.findCareableHealth(horseId);
    if (health === null) {
      throw new HorseNotFoundError(horseId);
    }

    const now = new Date();
    const lastPerformedAt = await this.careLogRepository.findLastPerformedAt(horseId, actionType);
    const vitals = {
      health: horse.health,
      fitness: horse.fitness,
      fatigue: horse.fatigue,
      energy: horse.energy,
      morale: horse.morale,
    };

    const result = applyCareAction(this.config.care, actionType, vitals, health, lastPerformedAt, now);

    const nextStatus =
      horse.status === 'injured' && actionType === 'vet'
        ? 'active'
        : horse.status;

    await this.horseRepository.update({
      ...horse,
      status: nextStatus,
      health: result.vitals.health,
      fitness: result.vitals.fitness,
      fatigue: result.vitals.fatigue,
      energy: result.vitals.energy,
      morale: result.vitals.morale,
      updatedAt: now.toISOString(),
    });
    await this.horseHealthRepository.updateCareableFields(horseId, result.health);
    await this.careLogRepository.recordPerformed(horseId, actionType, now);

    return {
      horseId,
      actionType,
      newVitals: {
        health: result.vitals.health,
        fitness: result.vitals.fitness,
        fatigue: result.vitals.fatigue,
        energy: result.vitals.energy,
        morale: result.vitals.morale,
      },
      newHealth: result.health,
    };
  }
}