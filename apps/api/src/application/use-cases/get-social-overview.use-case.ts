import { Inject, Injectable } from '@nestjs/common';
import type { SocialOverviewView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * Sosyal özet (proje sahibinin açık talebi, 27.09.2026: "arkadaşlık +
 * mesajlaşma"). `GET /players/:id/social`.
 *
 * `ListWatchableRacesUseCase` ile AYNI desen: iş kuralı İÇERMEZ, oyuncunun
 * var olduğunu doğrular (yoksa 404 — sessizce boş liste dönmez) ve
 * repository'yi çağırır. **Tek işi** `Date` alanlarını ISO metne çevirmek
 * ve `direction`'ı (`repository`'de `requested_by_id`'den türetilmiş)
 * olduğu gibi API sınırına taşımaktır.
 */
@Injectable()
export class GetSocialOverviewUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<SocialOverviewView> {
    const player = await this.playerRepository.findById(playerId);
    if (player === null) {
      throw new PlayerNotFoundError(playerId);
    }

    const { overviewFriendsLimit, overviewRequestsLimit } = this.config.social;
    const facts = await this.socialRepository.findOverview({
      playerId,
      friendsLimit: overviewFriendsLimit,
      requestsLimit: overviewRequestsLimit,
    });

    const toPlayer = (row: { playerId: string; displayName: string; level: number }) => ({
      playerId: row.playerId,
      displayName: row.displayName,
      level: row.level,
    });

    return {
      friends: facts.friends.map((row) => ({
        ...toPlayer(row),
        friendshipId: row.friendshipId,
        friendsSince: row.friendsSince.toISOString(),
      })),
      incomingRequests: facts.incomingRequests.map((row) => ({
        ...toPlayer(row),
        requestId: row.requestId,
        direction: row.direction,
        createdAt: row.createdAt.toISOString(),
      })),
      outgoingRequests: facts.outgoingRequests.map((row) => ({
        ...toPlayer(row),
        requestId: row.requestId,
        direction: row.direction,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadMessageCount: facts.unreadMessageCount,
    };
  }
}
