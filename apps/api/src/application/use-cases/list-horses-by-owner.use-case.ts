import { Inject, Injectable } from '@nestjs/common';
import type { Horse } from '@at-sevdalisi/shared-types';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

/**
 * brief §39 Ahır ekranı, `GET /horses` (docs/API.md §4 "oyuncunun
 * ahırındaki atlar"). NOT — gerçek kimlik doğrulama henüz bağlı
 * DEĞİLDİR (bkz. `RegisterPlayerUseCase` üstündeki not); bu yüzden
 * sahip (`ownerId`) şimdilik istemciden bir sorgu parametresi olarak
 * alınır, oturum açmış kullanıcıdan TÜRETİLMEZ.
 */
@Injectable()
export class ListHorsesByOwnerUseCase {
  constructor(@Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository) {}

  async execute(ownerId: string): Promise<Horse[]> {
    return this.horseRepository.findByOwnerId(ownerId);
  }
}
