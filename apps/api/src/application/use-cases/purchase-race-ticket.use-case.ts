import { Inject, Injectable } from '@nestjs/common';
import type { RaceTicketPurchaseResult } from '@at-sevdalisi/shared-types';
import { RaceNotFoundError } from '../../domain/race/errors';
import { assertRaceWatchable, assertTicketNotOwned, assertTicketPriceIsValid } from '../../domain/grandstand/ticket';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { GRANDSTAND_REPOSITORY, type GrandstandRepository } from '../ports/grandstand.repository';

/**
 * Tribün bileti satın alma (proje sahibinin açık talebi, 27.09.2026:
 * "yarış yapılan yerlerde tribüne ücretli girişler olsun").
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. Config'teki fiyat doğrulanır (`assertTicketPriceIsValid`) — bozuk bir
 *      config "bedava bilet" ya da anlaşılmaz bir çökmeye dönüşmesin diye,
 *      HİÇBİR ŞEY yazılmadan ÖNCE.
 *   2. Yarış olguları okunur; yarış yoksa `RaceNotFoundError` (404).
 *   3. `assertRaceWatchable` — kendi yarışı / bitmemiş / pencere dolmuş (409).
 *   4. `assertTicketNotOwned` — zaten bilet var (409).
 *   5. `purchaseTicket` — **PARA YOLU**, tek transaction (kilit + düşüm +
 *      bilet satırı + defter kaydı).
 *
 * **YARIŞ DURUMU (race condition) notu — dürüst sınır:** 2–4 arasındaki
 * kontroller transaction DIŞINDA okunur. Eşzamanlı iki isteğin ikisi de
 * 4'ü geçebilir; bu durumda İKİNCİ istek `race_tickets_unique_per_player`
 * kısıtından 23505 alır ve transaction'ı — çekilen para dahil — geri alınır,
 * yani **çift tahsilat yapısal olarak imkânsızdır** (asıl korunan şey budur).
 * 3'ün transaction dışında olması ise zararsızdır: biletler SÜRESİZ
 * geçerlidir, pencere dolduktan birkaç milisaniye sonra alınmış bir bilet
 * ne kullanıcıya ne ekonomiye zarar verir.
 */
@Injectable()
export class PurchaseRaceTicketUseCase {
  constructor(
    @Inject(GRANDSTAND_REPOSITORY) private readonly grandstandRepository: GrandstandRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(raceId: string, playerId: string, idempotencyKey: string | null): Promise<RaceTicketPurchaseResult> {
    const { ticketPrice, watchWindowHours } = this.config.grandstand;
    assertTicketPriceIsValid(ticketPrice.amount);

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

    assertTicketNotOwned(await this.grandstandRepository.hasTicket(raceId, playerId), raceId);

    const purchase = await this.grandstandRepository.purchaseTicket({
      playerId,
      raceId,
      price: ticketPrice.amount,
      currency: ticketPrice.currency,
      idempotencyKey,
    });
    if (purchase === null) {
      throw new PlayerNotFoundError(playerId);
    }

    return {
      ticketId: purchase.ticketId,
      raceId,
      price: ticketPrice.amount,
      currency: ticketPrice.currency,
      purchasedAt: purchase.purchasedAt.toISOString(),
      newBalance: { money: purchase.money, gems: purchase.gems },
    };
  }
}
