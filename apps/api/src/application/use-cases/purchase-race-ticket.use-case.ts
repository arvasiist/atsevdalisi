import { Inject, Injectable } from '@nestjs/common';
import type { RaceTicketPurchaseResult } from '@at-sevdalisi/shared-types';
import { RaceNotFoundError } from '../../domain/race/errors';
import { assertRaceWatchable, assertTicketNotOwned, assertTribuneIsPaid } from '../../domain/grandstand/ticket';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { GRANDSTAND_REPOSITORY, type GrandstandRepository } from '../ports/grandstand.repository';

/**
 * Tribün bileti satın alma (proje sahibinin açık talebi, 27.09.2026:
 * "yarış yapılan yerlerde tribüne ücretli girişler olsun").
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. Yarış olguları okunur; yarış yoksa `RaceNotFoundError` (404).
 *   2. `assertRaceWatchable` — kendi yarışı / bitmemiş / pencere dolmuş (409).
 *   3. `assertTribuneIsPaid` — bu yarışın tribünü ÜCRETSİZSE bilet satılmaz
 *      (409 `RACE_TRIBUNE_FREE`); doğru eylem doğrudan izlemektir.
 *   4. `assertTicketNotOwned` — zaten bilet var (409).
 *   5. `purchaseTicket` — **PARA YOLU**, tek transaction (kilit + KONTENJAN +
 *      düşüm + bilet satırı + defter kaydı).
 *
 * **FİYAT BURADA BELİRLENMEZ (PHASE 7.1, 29.09.2026).** 27.09.2026 –
 * 29.09.2026 arasında bu use-case config'teki `ticketPrice.amount`u
 * repository'ye geçiriyordu ve `races.tribune_fee` sütunu **hiç
 * okunmuyordu** (ölü sütun). Artık tutarın tek kaynağı kilitli yarış
 * satırıdır; use-case yalnızca "ücretsiz mi" sorusunu sorar
 * (`assertTribuneIsPaid`) ve ödenen tutarı sonuçtan GERİ okur
 * (`purchase.price`) — yanıtın gösterdiği sayı ile deftere yazılan sayı
 * ayrışamasın diye.
 *
 * **YARIŞ DURUMU (race condition) notu — dürüst sınır:** 1–4 arasındaki
 * kontroller transaction DIŞINDA okunur. Eşzamanlı iki isteğin ikisi de
 * 4'ü geçebilir; bu durumda İKİNCİ istek `race_tickets_unique_per_player`
 * kısıtından 23505 alır ve transaction'ı — çekilen para dahil — geri alınır,
 * yani **çift tahsilat yapısal olarak imkânsızdır** (asıl korunan şey budur).
 * 2'nin transaction dışında olması ise zararsızdır: biletler SÜRESİZ
 * geçerlidir, pencere dolduktan birkaç milisaniye sonra alınmış bir bilet
 * ne kullanıcıya ne ekonomiye zarar verir.
 *
 * **KONTENJAN (kapasite) ise transaction İÇİNDEDİR** — dışarıda okunan bir
 * "kaç bilet satıldı" sayısı TOCTOU penceresi bırakırdı ve o pencere
 * **hiçbir yerde hata üretmezdi** (`TribuneFullError` doc yorumu).
 */
@Injectable()
export class PurchaseRaceTicketUseCase {
  constructor(
    @Inject(GRANDSTAND_REPOSITORY) private readonly grandstandRepository: GrandstandRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(raceId: string, playerId: string, idempotencyKey: string | null): Promise<RaceTicketPurchaseResult> {
    const { watchWindowHours } = this.config.grandstand;

    const facts = await this.grandstandRepository.findRaceWatchability(raceId, playerId);
    if (facts === null) {
      throw new RaceNotFoundError(raceId);
    }

    assertRaceWatchable({
      raceId,
      isFinished: facts.isFinished,
      finishedAtMs: facts.finishedAtMs,
      // `nowMs` ÇAĞIRAN tarafından geçirilir (domain `Date.now()` çağırmaz —
      // bkz. `domain/grandstand/ticket.ts` doc yorumu, deterministik test
      // edilebilirlik).
      nowMs: Date.now(),
      windowHours: watchWindowHours,
      isOwnRace: facts.isOwnRace,
    });

    assertTribuneIsPaid(facts.tribuneFee, raceId);

    assertTicketNotOwned(await this.grandstandRepository.hasTicket(raceId, playerId), raceId);

    const purchase = await this.grandstandRepository.purchaseTicket({ playerId, raceId, idempotencyKey });
    if (purchase === null) {
      throw new PlayerNotFoundError(playerId);
    }

    return {
      ticketId: purchase.ticketId,
      raceId,
      // GERÇEKTE tahsil edilen tutar (kilitli `races.tribune_fee`) —
      // config'ten okunan bir varsayım değil.
      price: purchase.price,
      currency: purchase.currency,
      purchasedAt: purchase.purchasedAt.toISOString(),
      newBalance: { money: purchase.money, gems: purchase.gems },
    };
  }
}
