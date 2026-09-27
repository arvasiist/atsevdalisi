import { Inject, Injectable } from '@nestjs/common';
import type { FarmSummaryView } from '@at-sevdalisi/shared-types';
import { getMaxStaffCapacity, summarizeFacilities } from '../../domain/farm/farm';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { FACILITY_REPOSITORY, type FacilityRepository } from '../ports/facility.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * brief §32 "Çiftlik" — `GET /players/:id/farm`. Bu turda EKLENDİ.
 *
 * Bu use-case KURAL İÇERMEZ: hangi tesisin hangi seviyede ne verdiği
 * `domain/farm/farm.ts`'te yaşar (`summarizeFacilities`), burada yalnızca
 * üç şey yapılır — oyuncunun var olduğunu doğrula, tesis kayıtlarını oku,
 * domain fonksiyonuna verip API'nin dışa açtığı görünüme çevir.
 *
 * Oyuncu kaydı AYRICA okunur çünkü `GET /players/:id/stable-summary` ile
 * AYNI sözleşme geçerlidir: var olmayan bir oyuncu için boş bir çiftlik
 * döndürmek, 404 yerine yanıltıcı bir "her şey yolunda" yanıtı üretirdi.
 */
@Injectable()
export class GetFarmSummaryUseCase {
  constructor(
    @Inject(FACILITY_REPOSITORY) private readonly facilityRepository: FacilityRepository,
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(ownerId: string): Promise<FarmSummaryView> {
    const player = await this.playerRepository.findById(ownerId);
    if (player === null) {
      throw new PlayerNotFoundError(ownerId);
    }

    const facilities = await this.facilityRepository.findByOwnerId(ownerId);
    // Kaydı OLMAYAN tesis tipi "inşa edilmedi" (seviye 0) sayılır —
    // `summarizeFacilities` yedi tesisin TAMAMINI bu haritadan üretir
    // (bkz. `domain/farm/farm.ts`).
    const levelsByType = new Map(facilities.map((facility) => [facility.type, facility.level] as const));

    return {
      ownerId,
      facilities: summarizeFacilities(levelsByType, this.config.farm),
      staffCapacity: getMaxStaffCapacity(levelsByType.get('staff_building') ?? 0, this.config.farm),
    };
  }
}
