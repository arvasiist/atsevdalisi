import { Inject, Injectable } from '@nestjs/common';
import type { HorsePedigreeView } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
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
  constructor(@Inject(PEDIGREE_REPOSITORY) private readonly pedigreeRepository: PedigreeRepository) {}

  async execute(horseId: string): Promise<HorsePedigreeView> {
    const view = await this.pedigreeRepository.findByHorseId(horseId);
    if (view === null) {
      throw new HorseNotFoundError(horseId);
    }
    return view;
  }
}
