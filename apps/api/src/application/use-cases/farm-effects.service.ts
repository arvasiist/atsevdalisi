import { Inject, Injectable } from '@nestjs/common';
import { computeFarmEffects, type FarmEffects } from '../../domain/farm/farm';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { FACILITY_REPOSITORY, type FacilityRepository } from '../ports/facility.repository';

/**
 * 01.10.2026 — oyuncunun tesis seviyelerinden oyun etkilerini okur
 * (`computeFarmEffects`). Bakım, antrenman, yem ve yetiştirme bunu tüketir.
 *
 * Seviye kilit DIŞINDA okunur: tesis seviyesi yalnızca ARTAR, yani yarışan
 * bir yükseltme en kötü ihtimalle bu işlemde eski (daha düşük) indirimi
 * uygular — oyuncu aleyhine değil, yükseltme bir sonraki işlemde etkilidir.
 * Önbellek YOK (yükseltme anında etkili olsun).
 */
@Injectable()
export class FarmEffectsService {
  constructor(
    @Inject(FACILITY_REPOSITORY) private readonly facilityRepository: FacilityRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async effectsFor(ownerId: string): Promise<FarmEffects> {
    const facilities = await this.facilityRepository.findByOwnerId(ownerId);
    const levels = new Map(facilities.map((facility) => [facility.type, facility.level] as const));
    return computeFarmEffects(levels, this.config.farm);
  }
}
