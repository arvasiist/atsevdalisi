import { Inject, Injectable } from '@nestjs/common';
import type { BreedingAttemptView } from '@at-sevdalisi/shared-types';
import { assertBreedingConfigIsValid } from '../../domain/breeding/breeding';
import { validateHorseName } from '../../domain/horse/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import {
  BREEDING_RANDOM,
  BREEDING_REPOSITORY,
  type BreedingRandomSource,
  type BreedingRepository,
} from '../ports/breeding.repository';
import { FarmEffectsService } from './farm-effects.service';

/**
 * `POST /players/:id/breeding` — KENDİ kısrağı × KENDİ aygırı (ücretsiz).
 *
 * 16.10.2026 (brief §4–§5): başkasının aygırı yalnızca kabul edilmiş teklifle
 * (`BreedingCenterUseCase`); burada 409 `BREEDING_REQUIRES_AGREEMENT`. Tay
 * ANINDA doğmaz: döllenme olasılığı < 1'dir, tutarsa gebelik başlar ve doğumu
 * zamanlayıcı yapar. Sahiplik + uygunluk deponun İÇİNDE, kilitli satırlarla
 * verilir (ön kontrol yok — TOCTOU).
 */
@Injectable()
export class BreedHorsesUseCase {
  constructor(
    @Inject(BREEDING_REPOSITORY) private readonly breedingRepository: BreedingRepository,
    @Inject(BREEDING_RANDOM) private readonly random: BreedingRandomSource,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(FarmEffectsService) private readonly farmEffects: FarmEffectsService,
  ) {}

  async execute(playerId: string, mareId: string, stallionId: string, rawFoalName: unknown): Promise<BreedingAttemptView> {
    assertBreedingConfigIsValid(this.config.genetics);
    const foalName = validateHorseName(rawFoalName);
    // Üreme merkezi tayın doğum riskini düşürür (kısrak sahibi = çağıran).
    const { birthHealthRiskMultiplier } = await this.farmEffects.effectsFor(playerId);
    return this.breedingRepository.attemptOwnBreeding({
      playerId,
      mareId,
      stallionId,
      foalName,
      now: new Date(),
      random: () => this.random.next(),
      birthHealthRiskMultiplier,
    });
  }
}
