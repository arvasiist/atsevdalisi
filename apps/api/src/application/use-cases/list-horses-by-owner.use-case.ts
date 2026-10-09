import { Inject, Injectable } from '@nestjs/common';
import type { Horse, HorsePersonalityView } from '@at-sevdalisi/shared-types';
import { describePersonality } from '../../domain/horse/personality';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

/**
 * brief §39 Ahır ekranı, `GET /horses` (docs/API.md §4 "oyuncunun
 * ahırındaki atlar"). Sahiplik kapısı controller'dadır (`assertSelf`).
 *
 * 08.10.2026 — her at kişilik ETİKETİYLE döner (`describePersonality`,
 * gizli sayılardan sunucuda türetilir; sayı istemciye gitmez). Tek sorgu:
 * N at için N okuma yapılmaz.
 */
@Injectable()
export class ListHorsesByOwnerUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(ownerId: string): Promise<Array<{ horse: Horse; personality: HorsePersonalityView | null }>> {
    const horses = await this.horseRepository.findByOwnerId(ownerId);
    const traits = await this.horseStatsRepository.findPersonalityByHorseIds(horses.map((horse) => horse.id));
    return horses.map((horse) => {
      const values = traits.get(horse.id);
      return {
        horse,
        personality: values ? describePersonality(values, this.config.horsePersonality) : null,
      };
    });
  }
}
