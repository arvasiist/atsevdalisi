import { Inject, Injectable } from '@nestjs/common';
import type { Jockey } from '@at-sevdalisi/shared-types';
import { JOCKEY_REPOSITORY, type JockeyRepository } from '../ports/jockey.repository';

/**
 * `GET /jockeys` (brief §13, §42 PHASE 6.2) — kiralamaya AÇIK jokeylerin
 * vitrini.
 *
 * **SALT OKUMADIR:** `@RateLimit` GEREKMEZ ve para hareketi üretmez —
 * `ListHorseEquipmentUseCase`/`ListMyGiftsUseCase` ile AYNI durum.
 *
 * **YALNIZCA `owner_id IS NULL` OLANLAR DÖNER** (kural repository'de,
 * `findAvailable`). Başka bir oyuncunun jokeyini vitrinde göstermek,
 * kiralanamayacak bir satırı tıklanabilir kılardı.
 */
@Injectable()
export class ListAvailableJockeysUseCase {
  constructor(@Inject(JOCKEY_REPOSITORY) private readonly jockeyRepository: JockeyRepository) {}

  async execute(): Promise<Jockey[]> {
    return this.jockeyRepository.findAvailable();
  }
}
