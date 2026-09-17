import { Inject, Injectable } from '@nestjs/common';
import type { FeedHorseResult, FeedType, Horse } from '@at-sevdalisi/shared-types';
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
 *
 * AUDIT_REPORT.md Bulgu C2 hardening (bu oturum) — `horseRepository.updateWithLock`
 * kullanır (bkz. `TrainHorseUseCase`/`PerformCareActionUseCase`'deki AYNI
 * desen ve `HorseRepository.updateWithLock` doc yorumundaki kapsam notu).
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

    const lockResult = await this.horseRepository.updateWithLock(horseId, (lockedHorse) => {
      const vitals = {
        health: lockedHorse.health,
        fitness: lockedHorse.fitness,
        fatigue: lockedHorse.fatigue,
        energy: lockedHorse.energy,
        morale: lockedHorse.morale,
      };

      const result = applyFeed(this.config.care, feedType, vitals, health);

      const updatedHorse: Horse = {
        ...lockedHorse,
        health: result.vitals.health,
        fitness: result.vitals.fitness,
        fatigue: result.vitals.fatigue,
        energy: result.vitals.energy,
        morale: result.vitals.morale,
        updatedAt: now.toISOString(),
      };

      return { horse: updatedHorse, result };
    });

    if (lockResult === null) {
      throw new HorseNotFoundError(horseId);
    }

    await this.horseHealthRepository.updateCareableFields(horseId, lockResult.health);

    return {
      horseId,
      feedType,
      newVitals: {
        health: lockResult.vitals.health,
        fitness: lockResult.vitals.fitness,
        fatigue: lockResult.vitals.fatigue,
        energy: lockResult.vitals.energy,
        morale: lockResult.vitals.morale,
      },
      newHealth: lockResult.health,
    };
  }
}
