import { Inject, Injectable } from '@nestjs/common';
import type { DirectMessageView } from '@at-sevdalisi/shared-types';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';
import { toDirectMessageView } from './social-message-view';

/**
 * Gelen kutusu — bana gelen son mesajlar (gönderen adıyla), en yeniden
 * eskiye. `GET /players/:id/inbox`.
 *
 * **Okuma işaretlemesi YAPMAZ** (`GetConversationUseCase`'ten AYRI):
 * gelen kutusu bir listedir, sohbet değil; listeden geçmek mesajları
 * okumak anlamına gelmez. Okundu işaretlemesi yalnızca sohbet açıldığında
 * olur.
 *
 * **Oyuncu kontrolü YOKTUR:** `playerId` doğrulanmış token'dan gelir
 * (`CurrentPlayer`), gövdeden/parametreden DEĞİL — var olmayan bir oyuncu
 * için bu uç nokta zaten çağrılamaz. `GetMyTicketsUseCase`'in AYNI
 * gerekçesi.
 *
 * **Uç nokta yolu `inbox`, `messages/:otherPlayerId` DEĞİL:** ikisi de
 * `messages` altına konsaydı `GET /players/:id/messages/inbox` ile
 * `GET /players/:id/messages/:otherPlayerId` çakışır ve `inbox` bir
 * oyuncu id'si sanılırdı (`ListWatchableRacesUseCase`'in `/races/watchable`
 * vs `/races/:id/timeline` ayrımıyla AYNI gerekçe).
 */
@Injectable()
export class GetInboxUseCase {
  constructor(
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<DirectMessageView[]> {
    const rows = await this.socialRepository.findInbox(playerId, this.config.social.inboxLimit);
    return rows.map(toDirectMessageView);
  }
}
