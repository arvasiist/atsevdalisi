import { Inject, Injectable } from '@nestjs/common';
import type { Horse } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

/** brief §40 At Detay ekranı, `GET /horses/:id` (docs/API.md §4). */
@Injectable()
export class GetHorseUseCase {
  constructor(@Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository) {}

  async execute(id: string): Promise<Horse> {
    const horse = await this.horseRepository.findById(id);
    if (horse === null) {
      throw new HorseNotFoundError(id);
    }
    return horse;
  }
}
