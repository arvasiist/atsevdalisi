import { Inject, Injectable } from '@nestjs/common';
import type { HippodromeCatalogView } from '@at-sevdalisi/shared-types';
import { buildHippodromeCatalog } from '../../domain/race/hippodrome-catalog';
import { AppConfigService } from '../../infrastructure/config/config.service';

/**
 * HİPODROM KATALOĞU (16.10.2026, brief §9) — pistler, masaları ve takvimleri.
 * Salt okuma, veritabanına dokunmaz; saatler sunucu saatiyle hesaplanır.
 */
@Injectable()
export class GetHippodromeCatalogUseCase {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  execute(now: Date = new Date()): HippodromeCatalogView {
    return buildHippodromeCatalog(
      now,
      this.config.hippodromes,
      this.config.economy.raceTiers,
      this.config.economy.prizeDistributions,
      this.config.raceLobby.calendar.programs,
      this.config.career,
    );
  }
}
