import { Inject, Injectable } from '@nestjs/common';
import type { HireJockeyResultView } from '@at-sevdalisi/shared-types';
import { JOCKEY_REPOSITORY, type JockeyRepository } from '../ports/jockey.repository';

/**
 * `POST /jockeys/:jockeyId/hire` (brief §13, §42 PHASE 6.2) — **PARA
 * YOLU.**
 *
 * **BU USE-CASE NEREDEYSE BOŞTUR ve bu bilinçlidir.** İşin tamamı
 * (`SELECT ... FOR UPDATE`, bakiye düşümü, defter satırı, sahiplik devri)
 * TEK bir transaction'da repository'nin içindedir — çünkü dördü
 * bölünürse para ile mülkiyet ayrışır ve bu hiçbir yerde hata üretmez.
 * Application katmanının işi yalnızca zamanı vermek ve sonucu yanıt
 * şekline çevirmektir.
 *
 * **`now` BURADA DOĞAR, repository'de DEĞİL:** tek zaman kaynağı ve
 * test edilebilirlik (`lockLobbyRace`in `now`uyla AYNI desen).
 *
 * **`balanceBefore` YANITA GİRMEZ.** İstemci üst bardaki bakiyeyi
 * güncellemek için `balanceAfter`a ihtiyaç duyar; `balanceBefore` yalnızca
 * defterin kendi tutarlılık denetimidir (`balance_after = balance_before +
 * amount`) ve dışarı sızdırılması yeni bir bilgi taşımaz.
 */
@Injectable()
export class HireJockeyUseCase {
  constructor(@Inject(JOCKEY_REPOSITORY) private readonly jockeyRepository: JockeyRepository) {}

  async execute(jockeyId: string, playerId: string): Promise<HireJockeyResultView> {
    const result = await this.jockeyRepository.hire({ jockeyId, playerId, now: new Date() });
    return { jockey: result.jockey, paid: result.paid, balanceAfter: result.balanceAfter };
  }
}
