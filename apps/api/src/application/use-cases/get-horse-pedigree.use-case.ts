import { Inject, Injectable } from '@nestjs/common';
import type { HorsePedigreeView } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { HORSE_CAREER_REPOSITORY, type HorseCareerRepository } from '../ports/horse-career.repository';
import { PEDIGREE_REPOSITORY, type PedigreeRepository } from '../ports/pedigree.repository';

/**
 * `GET /horses/:id/pedigree` (docs/API.md §4, brief §40 At Detay ekranı) —
 * `PedigreeTree.tsx`'in ihtiyaç duyduğu soy ağacı + görünen adlar.
 *
 * İş kuralı İÇERMEZ (bkz. `get-horse.use-case.ts` ile AYNI desen): "at yok"
 * durumunu 404'e çevirmek dışında hiçbir karar vermez. Soy kaydı OLMAYAN
 * at bir hata DEĞİLDİR — bu, yeni doğmuş/başlangıç atları için olağan
 * durumdur ve boş bir ağaç olarak gösterilir (bkz. `HorsePedigreeView`).
 */
@Injectable()
export class GetHorsePedigreeUseCase {
  constructor(
    @Inject(PEDIGREE_REPOSITORY) private readonly pedigreeRepository: PedigreeRepository,
    @Inject(HORSE_CAREER_REPOSITORY) private readonly careerRepository: HorseCareerRepository,
  ) {}

  async execute(horseId: string): Promise<HorsePedigreeView> {
    const view = await this.pedigreeRepository.findByHorseId(horseId);
    if (view === null) {
      throw new HorseNotFoundError(horseId);
    }
    // 16.10.2026 — brief §6: ağaçtaki her atın yarış + yetiştirme başarısı.
    // Yalnızca adı bilinen (var olan) atlar sorulur; tek sorgu.
    const records = await this.careerRepository.findRecordsByHorseIds([horseId, ...Object.keys(view.horseNamesById)]);
    return { ...view, recordsById: Object.fromEntries(records) };
  }
}
