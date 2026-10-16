import { Inject, Injectable } from '@nestjs/common';
import type { HorseCareerView } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_CAREER_REPOSITORY, type HorseCareerRepository } from '../ports/horse-career.repository';

/**
 * 16.10.2026 — `GET /horses/:id/career` (brief §3 "detaylı at profili ve
 * geçmişi"). Yarış sonuçları zaten tekrar/sıralama yüzeylerinde herkese açık;
 * burada atın tamamı tek yerde toplanır. Kazanç DEFTERDEN okunur (sayaç yok).
 */
@Injectable()
export class GetHorseCareerUseCase {
  constructor(
    @Inject(HORSE_CAREER_REPOSITORY) private readonly careerRepository: HorseCareerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string): Promise<HorseCareerView> {
    const career = await this.careerRepository.findCareer(horseId, this.config.stable.careerRecentRaceLimit);
    if (career === null) {
      throw new HorseNotFoundError(horseId);
    }
    return career;
  }
}
