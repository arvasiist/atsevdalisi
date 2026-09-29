import { Inject, Injectable } from '@nestjs/common';
import type { RespondFriendRequestResult } from '@at-sevdalisi/shared-types';
import { FriendshipNotFoundError } from '../../domain/social/errors';
import { otherParty } from '../../domain/social/friendship';
import { parseFriendshipAction } from '../../domain/social/validation';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * Gelen arkadaşlık isteğini yanıtlama.
 * `POST /players/:id/friend-requests/:requestId/respond`.
 *
 * **Tek bir 404'e düşen DÖRT durum** (bilinçli — bkz. `FriendshipNotFoundError`
 * doc yorumu): kayıt yok · `pending` değil (zaten yanıtlanmış) · ben
 * çiftin üyesi değilim · isteği BEN gönderdim (kendi isteğimi
 * yanıtlayamam). Dördü de aynı kapıdır; ayrıştırmak başkasının
 * arkadaşlık kaydının durumunu sızdırırdı.
 *
 * **Ön okuma (1) ile yazma (4) arası yarış:** ön okuma yalnızca
 * "yanıtlayabilir miyim" sorusunu cevaplar; asıl kapı SQL'dedir
 * (`respondToRequest` → `status = 'pending' AND requested_by_id <> $2`).
 * İki eşzamanlı `accept`'ten yalnızca biri satırı günceller, diğeri `null`
 * alır ve 404 döner — çift yazma yapısal olarak imkânsızdır.
 *
 * **`now` neden burada üretilir:** `responded_at` çağıranın verdiği andır
 * (repository `now()` ÇAĞIRMAZ) — `grandstand`'ın `nowMs` disipliniyle
 * AYNI gerekçe: zaman kaynağı TEK bir yerden gelir, test edilebilir kalır.
 */
@Injectable()
export class RespondFriendRequestUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
  ) {}

  async execute(playerId: string, requestId: string, action: unknown): Promise<RespondFriendRequestResult> {
    // `parseFriendshipAction` ÖNCE çalışır: geçersiz bir gövde (400) hiçbir
    // sorgu yapılmadan reddedilir. `@IsIn` dekoratörüne GÜVENİLMEZ
    // (CLAUDE.md "Kardeş tuzak" — esbuild altında atlanır).
    const parsed = parseFriendshipAction(action);

    const row = await this.socialRepository.findById(requestId);
    const isParty = row !== null && (row.playerLowId === playerId || row.playerHighId === playerId);
    if (row === null || row.status !== 'pending' || !isParty || row.requestedById === playerId) {
      throw new FriendshipNotFoundError(requestId);
    }

    // Karşı taraf — sonuç görünümünde gösterilecek oyuncu. `players`
    // satırı FK + `ON DELETE CASCADE` ile garanti olduğundan burada `null`
    // pratikte imkânsızdır; yine de sessizce devam etmek yerine 404 döner.
    const otherId = otherParty({ lowId: row.playerLowId, highId: row.playerHighId }, playerId);
    const other = await this.playerRepository.findById(otherId);
    if (other === null) {
      throw new PlayerNotFoundError(otherId);
    }

    const updated = await this.socialRepository.respondToRequest({
      friendshipId: requestId,
      responderId: playerId,
      status: parsed === 'accept' ? 'accepted' : 'rejected',
      respondedAt: new Date(),
    });
    if (updated === null) {
      throw new FriendshipNotFoundError(requestId);
    }

    return {
      friendshipId: updated.id,
      status: updated.status,
      player: {
        playerId: other.id,
        // `SocialPlayerView.username` (29.09.2026) — `/friends` ekranı bu
        // satırın adını `/profile/:username`e bağlar.
        username: other.username,
        displayName: other.displayName,
        level: other.level,
      },
    };
  }
}
