import { Inject, Injectable } from '@nestjs/common';
import type { Horse, HorsePersonalityView } from '@at-sevdalisi/shared-types';
import { describePersonality } from '../../domain/horse/personality';
import { horseRacingPower } from '../../domain/race/practice-class';
import { estimateRaceReadyAt } from '../../domain/care/race-condition';
import { horseAgeMonths } from '../../domain/horse/age-curve';
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
 *
 * 14.10.2026 — her at pratik yarış SINIF GÜCÜYLE döner (`horseRacingPower`);
 * yarış ekranı girebileceği kademeyi bununla gösterir (kural sunucuda).
 *
 * 15.10.2026 — yorgunluk/enerji yüzünden yarışa hazır değilse ne zaman
 * hazır olacağı (`raceReadyAt`, zamanla toparlanma hızından; S3).
 */
@Injectable()
export class ListHorsesByOwnerUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(
    ownerId: string,
    now: Date = new Date(),
  ): Promise<
    Array<{
      horse: Horse;
      personality: HorsePersonalityView | null;
      racingPower: number | null;
      raceReadyAt: string | null;
      /** 15.10.2026 — oyun yaşı (ay), sunucuda hesaplanır. */
      ageMonths: number;
    }>
  > {
    const horses = await this.horseRepository.findByOwnerId(ownerId);
    const ids = horses.map((horse) => horse.id);
    const [traits, powerStats] = await Promise.all([
      this.horseStatsRepository.findPersonalityByHorseIds(ids),
      this.horseStatsRepository.findPowerStatsByHorseIds(ids),
    ]);
    return horses.map((horse) => {
      const values = traits.get(horse.id);
      const power = powerStats.get(horse.id);
      const ageMonths = horseAgeMonths(horse, now, this.config.horseGrowth);
      return {
        horse,
        personality: values ? describePersonality(values, this.config.horsePersonality) : null,
        racingPower: power ? horseRacingPower(power) : null,
        raceReadyAt:
          estimateRaceReadyAt(
            horse.status,
            horse,
            this.config.race.readiness,
            this.config.care.passiveRecovery,
            now,
            ageMonths,
          )?.toISOString() ?? null,
        ageMonths,
      };
    });
  }
}
