import { Inject, Injectable } from '@nestjs/common';
import type { StudListingView } from '@at-sevdalisi/shared-types';
import { isWithinBreedingAge, lifetimeFoalLimitFor } from '../../domain/breeding/breeding';
import { computeHorseAgeMonths } from '../../domain/horse/age-curve';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { BREEDING_REPOSITORY, type BreedingRepository } from '../ports/breeding.repository';
import { HORSE_CAREER_REPOSITORY, type HorseCareerRepository } from '../ports/horse-career.repository';

/**
 * `GET /breeding/studs` — başka oyuncuların İLANDAKİ aygırları (brief §4:
 * aygır sahibi kendi ücretiyle ilan verir; kısrak sahibi ırk ve azami ücrete
 * göre süzer). Her satır aygırın soyunu (anne/baba adı) ve yarış + yetiştirme
 * özetini taşır. Liste yalnızca kolaylıktır — teklif yolu aynı süzgeçleri
 * kilit altında yeniden uygular.
 */
@Injectable()
export class ListStudsUseCase {
  constructor(
    @Inject(BREEDING_REPOSITORY) private readonly repository: BreedingRepository,
    @Inject(HORSE_CAREER_REPOSITORY) private readonly careerRepository: HorseCareerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(
    viewerId: string,
    filters: { breed: string | null; maxFee: number | null } = { breed: null, maxFee: null },
    now: Date = new Date(),
  ): Promise<StudListingView[]> {
    const genetics = this.config.genetics;
    const foalLimit = lifetimeFoalLimitFor('stallion', genetics);
    const candidates = await this.repository.listStudCandidates({
      viewerId,
      foalLimit,
      scanLimit: genetics.studMarket.scanLimit,
      breed: filters.breed,
      maxFee: filters.maxFee,
    });
    const eligible = candidates
      .map((candidate) => ({
        candidate,
        ageMonths: computeHorseAgeMonths(
          { birthDate: candidate.birthDate, agingStartedAt: candidate.agingStartedAt },
          now,
          this.config.horseGrowth,
        ),
      }))
      .filter(({ ageMonths }) => isWithinBreedingAge(ageMonths, genetics))
      .slice(0, genetics.studMarket.listLimit);
    const records = await this.careerRepository.findRecordsByHorseIds(eligible.map(({ candidate }) => candidate.horseId));
    return eligible.map(({ candidate, ageMonths }) => ({
      horseId: candidate.horseId,
      name: candidate.name,
      breed: candidate.breed,
      ownerId: candidate.ownerId,
      ownerUsername: candidate.ownerUsername,
      ageMonths,
      level: candidate.level,
      quality: candidate.quality,
      fertility: candidate.fertility,
      fee: candidate.fee,
      foalCount: candidate.foalCount,
      foalLimit,
      sireName: candidate.sireName,
      damName: candidate.damName,
      record: records.get(candidate.horseId) ?? { starts: 0, wins: 0, places: 0, earnings: 0, foals: 0 },
    }));
  }
}
