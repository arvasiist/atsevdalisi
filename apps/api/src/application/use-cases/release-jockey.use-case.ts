import { Inject, Injectable } from '@nestjs/common';
import type { ReleaseJockeyResultView } from '@at-sevdalisi/shared-types';
import { JOCKEY_REPOSITORY, type JockeyRepository } from '../ports/jockey.repository';

/**
 * `POST /jockeys/:jockeyId/release` (29.09.2026, FINAL_PROJECT_AUDIT #18).
 *
 * **BU DİLİM BİR ÇIKMAZ SOKAĞI KAPATIR.** `JockeyAlreadyHiredError`ın
 * mesajı 29.09.2026'ya kadar **"Önce onu bırakmalısın"** diyordu — ama
 * jokeyi bırakmanın HİÇBİR yolu yoktu. Yani sunucu, oyuncuya
 * yapamayacağı bir şeyi söylüyordu ve bu hiçbir yerde hata üretmiyordu:
 * yanlış olan mesaj değil, eksik olan uçtu. Hata metnini yumuşatmak
 * yerine eksik yol yazıldı.
 *
 * **`hire` GİBİ NEREDEYSE BOŞTUR ve bu bilinçlidir.** Kilit, sahiplik
 * denetimi ve yazma TEK bir transaction'da repository'nin içindedir;
 * application katmanının işi zamanı vermek ve sonucu yanıt şekline
 * çevirmektir.
 *
 * **PARA HAREKET ETMEZ, İADE YOKTUR.** Kiralama bedeli bir kiralama
 * ücretidir, depozito değil — iade edilseydi `hire → release` döngüsü
 * kiralamayı bedava yapardı. Bu yüzden yanıt `balanceAfter`
 * TAŞIMAZ (`ReleaseJockeyResultView` doc yorumu).
 *
 * **`now` BURADA DOĞAR, repository'de DEĞİL:** tek zaman kaynağı ve test
 * edilebilirlik (`hire`in `now`uyla AYNI desen).
 */
@Injectable()
export class ReleaseJockeyUseCase {
  constructor(@Inject(JOCKEY_REPOSITORY) private readonly jockeyRepository: JockeyRepository) {}

  async execute(jockeyId: string, playerId: string): Promise<ReleaseJockeyResultView> {
    const result = await this.jockeyRepository.release({ jockeyId, playerId, now: new Date() });
    return { jockey: result.jockey };
  }
}
