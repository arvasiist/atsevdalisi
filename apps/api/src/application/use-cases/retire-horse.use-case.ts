import { Inject, Injectable } from '@nestjs/common';
import type { Horse } from '@at-sevdalisi/shared-types';
import {
  HORSE_RETIREMENT_REPOSITORY,
  type HorseRetirementRepository,
} from '../ports/horse-retirement.repository';

/**
 * `POST /horses/:id/retire` — atı yarıştan emekli eder (S5, 15.10.2026).
 * Geri alınmaz. Kurallar `domain/horse/retirement.ts` + depo kilidi.
 */
@Injectable()
export class RetireHorseUseCase {
  constructor(
    @Inject(HORSE_RETIREMENT_REPOSITORY) private readonly repository: HorseRetirementRepository,
  ) {}

  execute(playerId: string, horseId: string, now: Date = new Date()): Promise<Horse> {
    return this.repository.retire({ playerId, horseId, now });
  }
}
