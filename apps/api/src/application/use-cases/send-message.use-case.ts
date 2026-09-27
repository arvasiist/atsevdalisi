import { Inject, Injectable } from '@nestjs/common';
import type { DirectMessageView } from '@at-sevdalisi/shared-types';
import { CannotMessageSelfError, NotFriendsError } from '../../domain/social/errors';
import { canonicalPair } from '../../domain/social/friendship';
import { normalizeMessageBody } from '../../domain/social/validation';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';
import { toDirectMessageView } from './social-message-view';

/**
 * Doğrudan mesaj gönderme. `POST /players/:id/messages`.
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. `assertNotSelf` — kendine mesaj (400). `direct_messages_not_self`
 *      CHECK'ine varmadan anlamlı bir hata dönmek için.
 *   2. `normalizeMessageBody` — SAF doğrulama (kırp, boş/uzun kontrolü).
 *      Veritabanına HİÇ gidilmeden önce, çünkü ucuz ve girdi hatasıdır.
 *   3. Alıcı okunur; yoksa `PlayerNotFoundError` (404) — aksi halde FK
 *      `23503` ile 500 dönerdi (`SendFriendRequestUseCase`'in AYNI adımı).
 *   4. `areFriends` — **ARKADAŞLIK ZORUNLUDUR** (403 `NOT_FRIENDS`).
 *   5. `saveMessage`.
 *
 * **ARKADAŞLIK NEDEN ZORUNLU:** bu, istenmeyen mesajı (spam/taciz)
 * YAPISAL olarak engeller — mesaj atabilmek için karşı tarafın isteği
 * KABUL etmiş olması gerekir. Engel veritabanı kısıtı DEĞİL, uygulama
 * katmanı kuralıdır: böylece arkadaşlıktan çıkıldığında GEÇMİŞ mesajlar
 * silinmez, yalnızca YENİ mesaj gönderilemez (bkz. `RemoveFriendUseCase`).
 *
 * **`@RateLimit` ile İKİNCİ savunma hattı:** arkadaşlık kapısı "kime"
 * sorusunu kapatır, hız sınırı "ne kadar sık" sorusunu (bkz.
 * `social.controller.ts`). İkisi birbirinin yerine geçmez.
 */
@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string, recipientId: string, body: unknown): Promise<DirectMessageView> {
    if (playerId === recipientId) {
      throw new CannotMessageSelfError();
    }

    const normalized = normalizeMessageBody(body, this.config.social.maxMessageLength);

    const recipient = await this.playerRepository.findById(recipientId);
    if (recipient === null) {
      throw new PlayerNotFoundError(recipientId);
    }

    const { lowId, highId } = canonicalPair(playerId, recipientId);
    if (!(await this.socialRepository.areFriends(lowId, highId))) {
      throw new NotFriendsError(recipientId);
    }

    const row = await this.socialRepository.saveMessage({
      senderId: playerId,
      recipientId,
      body: normalized,
    });
    return toDirectMessageView(row);
  }
}
