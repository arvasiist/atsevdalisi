import { Inject, Injectable } from '@nestjs/common';
import type { RaceTicketRefundResult } from '@at-sevdalisi/shared-types';
import { RaceTicketNotFoundError } from '../../domain/grandstand/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { GRANDSTAND_REPOSITORY, type GrandstandRepository } from '../ports/grandstand.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * Tribün bileti iadesi — "tribünden ayrıl" (PHASE 7.2, 29.09.2026; brief §42
 * PHASE 7: "tribune ... join, leave, refund").
 *
 * **Neden gerekli:** Bilet satın alma 27.09.2026'da yazıldı ama **geri dönüş
 * yolu yoktu**. Bir oyuncu yanlış yarışa bilet aldığında ya da izlemekten
 * vazgeçtiğinde parasını hiçbir yoldan geri alamıyordu — ve bu, hiçbir
 * yerde hata üretmeyen **kalıcı bir para kilidiydi** (yarış iptali
 * diliminde `PROJE_DURUMU.md` §13.19'un çözdüğü sorunun AYNISI, tribün
 * tarafında).
 *
 * **Akış:**
 *   1. Oyuncu var mı? (`PlayerNotFoundError` → 404). Bu kontrol ŞART:
 *      `refundTicket`in `null`u "bilet yok" anlamına gelir ve oyuncunun
 *      yokluğu oraya karışırsa var olmayan bir oyuncuya "biletin yok"
 *      denirdi (yanlış teşhis).
 *   2. `refundTicket` — **PARA YOLU**, tek transaction: bilet satırını
 *      sil, bakiyeyi artır, deftere POZİTİF `grandstand_ticket_refund`
 *      yaz. Bilet yoksa `null` → `RaceTicketNotFoundError` (404).
 *
 * **İADE PENCERESİ YOKTUR — ve bu bilinçlidir.** `watchWindowHours`
 * yalnızca yeni bilet SATIN ALMAYI sınırlar; mevcut bir bileti iade etmek
 * için süre sınırı koymak, penceresi dolmuş bir oyuncunun parasını kalıcı
 * olarak kilitlemek olurdu. Bilet zaten yalnızca `finished` yarışlar için
 * satılabildiğinden "iade ederek yarışı bedava izleme" gibi bir açık
 * OLUŞMAZ: satın alma da izleme de aynı bitmiş yarışı hedefler, iade
 * edilen bilet izleme yetkisini de siler.
 *
 * **Idempotency:** Çift iadeyi `IdempotencyInterceptor` DEĞİL,
 * `DELETE ... RETURNING`in ikinci çağrıda 0 satır döndürmesi engeller
 * (yarış iptalindeki "`scheduled → cancelled` geçişi zaten engelliyor"
 * gerekçesinin AYNISI, `PROJE_DURUMU.md` §13.19). Interceptor yine de
 * takılır — defter satırının istemci anahtarını taşıması için.
 */
@Injectable()
export class RefundRaceTicketUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(GRANDSTAND_REPOSITORY) private readonly grandstandRepository: GrandstandRepository,
  ) {}

  async execute(raceId: string, playerId: string, idempotencyKey: string | null): Promise<RaceTicketRefundResult> {
    const player = await this.playerRepository.findById(playerId);
    if (player === null) {
      throw new PlayerNotFoundError(playerId);
    }

    const refund = await this.grandstandRepository.refundTicket({ playerId, raceId, idempotencyKey });
    if (refund === null) {
      throw new RaceTicketNotFoundError(raceId);
    }

    return {
      ticketId: refund.ticketId,
      raceId,
      // İade tutarı BİLET SATIRININ kendi `price`'ından geldi (kilitli
      // okuma) — `races.tribune_fee`den değil, o sonradan değişmiş olabilir.
      refundedAmount: refund.refundedAmount,
      currency: refund.currency,
      newBalance: { money: refund.money, gems: refund.gems },
    };
  }
}
