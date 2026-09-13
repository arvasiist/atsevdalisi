import { Inject, Injectable } from '@nestjs/common';
import type { FeedHorseResult, FeedType } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { applyFeed } from '../../domain/care/care';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_HEALTH_REPOSITORY, type HorseHealthRepository } from '../ports/horse-health.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

/**
 * `POST /horses/{id}/feed` (docs/API.md §4, brief §12).
 *
 * KAPSAM (bu dilim, bilinçli — `PerformCareActionUseCase` ile AYNI
 * gerekçeler): besleme maliyeti (`getFeedCost`, Economy entegrasyonu)
 * bu dilimde YOKTUR; `applyFeed`'in bir cooldown'u OLMADIĞI için (bkz.
 * `domain/care/care.ts`) burada `CareLogRepository` KULLANILMAZ.
 */
@Injectable()
export class FeedHorseUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_HEALTH_REPOSITORY) private readonly horseHealthRepository: HorseHealthRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string, feedType: FeedType): Promise<FeedHorseResult> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }

    const health = await this.horseHealthRepository.findCareableHealth(horseId);
    if (health === null) {
      throw new HorseNotFoundError(horseId);
    }

    const now = new Date();
    const vitals = {
      health: horse.health,
      fitness: horse.fitness,
      fatigue: horse.fatigue,
      energy: horse.energy,
      morale: horse.morale,
    };

    const result = applyFeed(this.config.care, feedType, vitals, health);

    await this.horseRepository.update({
      ...horse,
      health: result.vitals.health,
      fitness: result.vitals.fitness,
      fatigue: result.vitals.fatigue,
      energy: result.vitals.energy,
      morale: result.vitals.morale,
      updatedAt: now.toISOString(),
    });
    await this.horseHealthRepository.updateCareableFields(horseId, result.health);

    return {
      horseId,
      feedType,
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
