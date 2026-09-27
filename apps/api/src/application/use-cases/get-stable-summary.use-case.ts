import { Inject, Injectable } from '@nestjs/common';
import type { StableSummaryView } from '@at-sevdalisi/shared-types';
import { getNextStableUpgradeOffer, getStableCapacity, summarizeStable } from '../../domain/stable/stable';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * FAZ 1 wiring, üçüncü dilim — brief §38 "Ahır Özeti" (Ana Sayfa kartı),
 * §39 Ahır Ekranı. `domain/stable/stable.ts`'teki SAF fonksiyonları
 * (`getStableCapacity`, `summarizeStable`) gerçek Player + Horse
 * repository'lerinden gelen verilerle besler — bu use-case'in kendisi
 * hiçbir iş kuralı İÇERMEZ, yalnızca iki repository'yi ve domain
 * fonksiyonlarını birbirine bağlar (bkz. docs/ARCHITECTURE.md §4).
 */
@Injectable()
export class GetStableSummaryUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<StableSummaryView> {
    const player = await this.playerRepository.findById(playerId);
    if (player === null) {
      throw new PlayerNotFoundError(playerId);
    }

    const horses = await this.horseRepository.findByOwnerId(playerId);
    const capacity = getStableCapacity(player.stableLevel, this.config.stable);
    const summary = summarizeStable(
      horses.map((horse) => ({ name: horse.name, health: horse.health, fitness: horse.fitness })),
      capacity,
      this.config.stable,
    );

    // `nextUpgrade`: Ahır ekranındaki "Yükselt" düğmesinin fiyatını ve
    // kazanılacak kapasiteyi ÖNCEDEN gösterebilmesi için (bkz.
    // `StableSummaryView.nextUpgrade` doc yorumu). Kural İÇERMEZ — yalnızca
    // `domain/stable/stable.ts`'teki saf fonksiyona delege eder; en yüksek
    // seviyede `null` döner, bu yüzden burada bir hata yakalama YOKTUR.
    return {
      stableLevel: player.stableLevel,
      ...summary,
      nextUpgrade: getNextStableUpgradeOffer(player.stableLevel, this.config.stable),
    };
  }
}
