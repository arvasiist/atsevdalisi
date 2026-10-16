import { Inject, Injectable } from '@nestjs/common';
import type { StudListingView } from '@at-sevdalisi/shared-types';
import { calculateStudFee, isWithinBreedingAge, lifetimeFoalLimitFor } from '../../domain/breeding/breeding';
import { computeHorseAgeMonths } from '../../domain/horse/age-curve';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { BREEDING_REPOSITORY, type BreedingRepository } from '../ports/breeding.repository';

/**
 * `GET /breeding/studs` — damızlık pazarı (S5, 15.10.2026). Başka oyuncuların
 * emekli aygırları, ÜCRETİYLE birlikte (eskiden aygır yalnızca kimlik yazılarak
 * seçilebiliyor, ücret ödendikten sonra öğreniliyordu). Liste yalnızca
 * kolaylıktır: uygunluk ve ücret çiftleştirme anında kilit altında yeniden
 * hesaplanır.
 */
@Injectable()
export class ListStudsUseCase {
  constructor(
    @Inject(BREEDING_REPOSITORY) private readonly repository: BreedingRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(viewerId: string, now: Date = new Date()): Promise<StudListingView[]> {
    const genetics = this.config.genetics;
    const foalLimit = lifetimeFoalLimitFor('stallion', genetics);
    const candidates = await this.repository.listStudCandidates({
      viewerId,
      foalLimit,
      scanLimit: genetics.studMarket.scanLimit,
    });
    return candidates
      .map((candidate) => ({
        candidate,
        ageMonths: computeHorseAgeMonths(
          { birthDate: candidate.birthDate, agingStartedAt: candidate.agingStartedAt },
          now,
          this.config.horseGrowth,
        ),
      }))
      .filter(({ ageMonths }) => isWithinBreedingAge(ageMonths, genetics))
      .slice(0, genetics.studMarket.listLimit)
      .map(({ candidate, ageMonths }) => ({
        horseId: candidate.horseId,
        name: candidate.name,
        breed: candidate.breed,
        ownerId: candidate.ownerId,
        ownerUsername: candidate.ownerUsername,
        ageMonths,
        quality: candidate.quality,
        fee: calculateStudFee(candidate, genetics),
        foalCount: candidate.foalCount,
        foalLimit,
      }));
  }
}
