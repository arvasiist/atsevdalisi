import { Inject, Injectable } from '@nestjs/common';
import type { PlayerJockeyView } from '@at-sevdalisi/shared-types';
import { calculateJockeySkillComposite } from '../../domain/jockey/jockey';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { JOCKEY_REPOSITORY, type JockeyRepository } from '../ports/jockey.repository';

/**
 * `GET /players/:id/jockey` (brief §13, §42 PHASE 6.2) — oyuncunun kiralı
 * jokeyi ve motorun kullanacağı TEK sayı.
 *
 * **`null` BİR HATA DEĞİLDİR.** Jokeyi olmayan oyuncu nötr 50 ile koşar;
 * bu uç onun için `null` döner (404 DEĞİL) — istemci "jokeyin yok, kirala"
 * ekranını bu ayrımla kurar. `JockeyNotFoundError` yalnızca KİRALAMA
 * ucunun `:jockeyId`si için vardır.
 *
 * **`composite` SUNUCUDA HESAPLANIR.** İstemcinin altı beceriyi config
 * ağırlıklarıyla çarpması, formülün İKİNCİ bir kopyasını doğururdu ve
 * config değiştiğinde gösterilen sayı ile motora giren sayı sessizce
 * ayrışırdı (bkz. `PlayerJockeyView.composite` doc yorumu).
 */
@Injectable()
export class GetPlayerJockeyUseCase {
  constructor(
    @Inject(JOCKEY_REPOSITORY) private readonly jockeyRepository: JockeyRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<PlayerJockeyView | null> {
    const jockey = await this.jockeyRepository.findByOwnerId(playerId);
    if (jockey === null) {
      return null;
    }
    return { jockey, composite: calculateJockeySkillComposite(jockey, this.config.jockey) };
  }
}
