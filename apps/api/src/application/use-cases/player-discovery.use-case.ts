import { Inject, Injectable } from '@nestjs/common';
import type {
  PlayerPrivacyView,
  PlayerRelationshipView,
  PlayerSearchResultView,
  PresenceView,
} from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { canonicalPair } from '../../domain/social/friendship';
import { parsePlayerSearchQuery, resolvePresence } from '../../domain/social/presence';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * 16.10.2026 — sosyal brief §3: oyuncu arama, profil ilişkisi, çevrimiçi
 * durumu ve gizlilik. Kurallar saf `domain/social/presence.ts`te; burası
 * yalnızca sırayı kurar. Çevrimiçi durumu YALNIZCA arkadaşa gösterilir.
 */
@Injectable()
export class PlayerDiscoveryUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async search(callerId: string, rawQuery: string): Promise<PlayerSearchResultView[]> {
    const { minQueryLength, limit } = this.config.social.playerSearch;
    const query = parsePlayerSearchQuery(rawQuery, minQueryLength);
    if (query === null) return [];
    const rows = await this.socialRepository.searchPlayers({ callerId, query, limit });
    return rows.map((row) => ({
      playerId: row.playerId,
      username: row.username,
      displayName: row.displayName,
      level: row.level,
      relation: row.relation,
    }));
  }

  async relationship(callerId: string, otherId: string, now: Date = new Date()): Promise<PlayerRelationshipView> {
    const base = { playerId: otherId, requestId: null, presence: null, friendRequestBlockedReason: null };
    if (callerId === otherId) return { ...base, status: 'self', canSendFriendRequest: false };
    if ((await this.playerRepository.findById(otherId)) === null) throw new PlayerNotFoundError(otherId);
    if (await this.socialRepository.isBlockedBetween(callerId, otherId)) {
      return { ...base, status: 'blocked', canSendFriendRequest: false };
    }
    const { lowId, highId } = canonicalPair(callerId, otherId);
    const pair = await this.socialRepository.findPair(lowId, highId);
    if (pair?.status === 'accepted') {
      return { ...base, status: 'friend', canSendFriendRequest: false, presence: await this.presenceOf(otherId, now) };
    }
    if (pair?.status === 'pending') {
      return {
        ...base,
        status: pair.requestedById === callerId ? 'outgoing' : 'incoming',
        requestId: pair.id,
        canSendFriendRequest: false,
      };
    }
    const eligible = await this.socialRepository.meetsFriendshipGate(callerId, otherId);
    return {
      ...base,
      status: 'none',
      canSendFriendRequest: eligible,
      friendRequestBlockedReason: eligible ? null : 'needs_shared_race',
    };
  }

  /** Nabız: istemci görünürken çağırır; sık nabız yazılmaz (`touchMinIntervalSeconds`). */
  async heartbeat(playerId: string, now: Date = new Date()): Promise<void> {
    await this.socialRepository.touchPresence(playerId, now, this.config.social.presence.touchMinIntervalSeconds);
  }

  async getPrivacy(playerId: string): Promise<PlayerPrivacyView> {
    const facts = await this.socialRepository.findPresence(playerId);
    if (facts === null) throw new PlayerNotFoundError(playerId);
    return { showOnlineStatus: facts.showOnlineStatus };
  }

  async setPrivacy(playerId: string, showOnlineStatus: boolean): Promise<PlayerPrivacyView> {
    if ((await this.socialRepository.findPresence(playerId)) === null) throw new PlayerNotFoundError(playerId);
    return { showOnlineStatus: await this.socialRepository.setShowOnlineStatus(playerId, showOnlineStatus) };
  }

  private async presenceOf(playerId: string, now: Date): Promise<PresenceView> {
    const facts = await this.socialRepository.findPresence(playerId);
    return facts === null
      ? { state: 'hidden', lastSeenAt: null }
      : resolvePresence(facts, now, this.config.social.presence.onlineWindowSeconds);
  }
}
