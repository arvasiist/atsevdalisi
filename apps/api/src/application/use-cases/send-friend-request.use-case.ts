import { Inject, Injectable } from '@nestjs/common';
import type { FriendRequestView } from '@at-sevdalisi/shared-types';
import { FriendshipAlreadyExistsError } from '../../domain/social/errors';
import {
  assertFriendRequestAllowed,
  assertNotSelf,
  assertUnderSocialLimit,
  canonicalPair,
} from '../../domain/social/friendship';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * Arkadaşlık isteği gönderme. `POST /players/:id/friend-requests`.
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. `assertNotSelf` — kendine istek (400). Hedefi SORGULAMADAN önce,
 *      çünkü hedef kendisi olduğunda yapılacak bir sorgu yoktur.
 *   2. Hedef oyuncu okunur; yoksa `PlayerNotFoundError` (404). **Bu adım
 *      ZORUNLUDUR:** atlanırsa olmayan bir `addresseeId` doğrudan INSERT'e
 *      gider, `friendships` FK'sı `23503` ile düşer ve istemci 500 görürdü.
 *      (`addresseeId`nin ŞEKİL kontrolü burada DEĞİL, `SocialController.
 *      sendFriendRequest`tedir — 400 döner, bkz. o dosya.)
 *   3. `assertFriendRequestAllowed` — bu çiftte `pending`/`accepted` kayıt
 *      varsa 409 (`rejected` SERBESTTİR: yeniden gönderilebilir).
 *   4. `assertUnderSocialLimit` — gönderenin bekleyen istek TAVANI (409).
 *      Neden burada (kabulde değil): tavanın amacı BİLDİRİM spam'ini
 *      engellemektir, isteği GÖNDEREN tarafı sınırlar.
 *   5. `saveFriendRequest` — satır yoksa ekler, `rejected` ise yeniden
 *      `pending` yapar. `null` dönerse araya giren eşzamanlı bir istek
 *      vardır → 409.
 *
 * **OTOMATİK KABUL YOK (bilinçli):** karşı taraf bana da istek göndermişse
 * "ikisi de istedi, arkadaş olsunlar" denmez; ikinci istek 409 alır ve
 * birinci isteğin AÇIKÇA kabul edilmesi gerekir. Arkadaşlık iki tarafın
 * onayını gerektirir; sessiz otomatik kabul, kullanıcının "kabul ettim"
 * demediği bir ilişkiyi doğururdu.
 *
 * **KANONİK ÇİFT:** `canonicalPair` çağrısı burada YAPILIR (repository
 * ham sıra bekler — bkz. `PostgresSocialRepository` dosya başı notu),
 * böylece A→B ile B→A aynı satıra bakar ve "iki taraf da birbirine istek
 * gönderdi" diye ikinci bir `pending` kayıt oluşamaz.
 */
@Injectable()
export class SendFriendRequestUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string, addresseeId: string): Promise<FriendRequestView> {
    assertNotSelf(playerId, addresseeId);

    const addressee = await this.playerRepository.findById(addresseeId);
    if (addressee === null) {
      throw new PlayerNotFoundError(addresseeId);
    }

    const { lowId, highId } = canonicalPair(playerId, addresseeId);
    const existing = await this.socialRepository.findPair(lowId, highId);
    assertFriendRequestAllowed(existing?.status ?? null);

    const pendingCount = await this.socialRepository.countOutgoingPending(playerId);
    assertUnderSocialLimit(pendingCount, this.config.social.pendingRequestsLimit, 'PENDING_REQUESTS');

    const row = await this.socialRepository.saveFriendRequest({ lowId, highId, requesterId: playerId });
    if (row === null) {
      // Araya giren eşzamanlı bir istek (2–5 arası kontroller transaction
      // DIŞINDA okunur). Zararsızdır: hiçbir şey yazılmadı, istemci doğru
      // cevabı alır.
      throw new FriendshipAlreadyExistsError('pending');
    }

    return {
      requestId: row.id,
      playerId: addressee.id,
      displayName: addressee.displayName,
      level: addressee.level,
      // Ben gönderdim — yön her zaman `outgoing`dur.
      direction: 'outgoing',
      createdAt: row.createdAt.toISOString(),
    };
  }
}
