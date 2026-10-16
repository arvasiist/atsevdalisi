import { randomInt, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Jockey } from '@at-sevdalisi/shared-types';
import { createJockeyCandidate, planJockeyMarketRefill, type JockeyCandidate } from '../../domain/jockey/market';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { JOCKEY_REPOSITORY, type JockeyRepository } from '../ports/jockey.repository';

/**
 * `GET /jockeys` (brief §13, §42 PHASE 6.2) — kiralamaya AÇIK jokeylerin
 * vitrini.
 *
 * Para hareketi üretmez; `@RateLimit` GEREKMEZ — `ListHorseEquipmentUseCase`/
 * `ListMyGiftsUseCase` ile AYNI durum.
 *
 * **YALNIZCA `owner_id IS NULL` OLANLAR DÖNER** (kural repository'de,
 * `findAvailable`). Başka bir oyuncunun jokeyini vitrinde göstermek,
 * kiralanamayacak bir satırı tıklanabilir kılardı.
 *
 * **14.10.2026 — VİTRİN BOŞ KALMAZ.** Eskiden jokey yalnızca geliştirme
 * seed'inde vardı; üretimde liste boştu. Artık bir beceri bandında
 * (`jockey.market.bands`) yeterli jokey yoksa eksik olanlar üretilir
 * (personel adaylarıyla aynı desen: vitrin okunurken doldurulur). Önce
 * kilitsiz bakılır; eksik varsa dolum pazar kilidi altında yeniden sayar.
 */
@Injectable()
export class ListAvailableJockeysUseCase {
  constructor(
    @Inject(JOCKEY_REPOSITORY) private readonly jockeyRepository: JockeyRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(): Promise<Jockey[]> {
    const available = await this.jockeyRepository.findAvailable();
    if (planJockeyMarketRefill(available, this.config.jockey).length === 0) {
      return available;
    }
    // Dolum 0 yazsa bile yeniden okunur: eşzamanlı istek eksiği doldurmuş olabilir.
    await this.jockeyRepository.refillMarket((locked) => this.buildMissing(locked));
    return this.jockeyRepository.findAvailable();
  }

  private buildMissing(available: Jockey[]): JockeyCandidate[] {
    const candidates: JockeyCandidate[] = [];
    for (const { band, missing } of planJockeyMarketRefill(available, this.config.jockey)) {
      for (let i = 0; i < missing; i += 1) {
        candidates.push(createJockeyCandidate({ id: randomUUID(), band, random: randomInt }, this.config.jockey));
      }
    }
    return candidates;
  }
}
