import { Inject, Injectable } from '@nestjs/common';
import type { RaceCompanionView } from '@at-sevdalisi/shared-types';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * "Birlikte yarıştıkların" (08.10.2026) — `GET /players/:id/race-companions`.
 * Arkadaşlık yalnızca bitmiş bir yarışta birlikte koşulan oyuncularla
 * kurulabildiği için (`SendFriendRequestUseCase` yarış kapısı) oyuncunun
 * arkadaş ekleyebileceği kişileri bulduğu yer burasıdır. Yalnızca
 * `SocialPlayerView` alanları + sayım döner (bakiye YOK).
 */
@Injectable()
export class ListRaceCompanionsUseCase {
  constructor(
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<RaceCompanionView[]> {
    const rows = await this.socialRepository.findRaceCompanions(playerId, this.config.social.raceCompanionsLimit);
    return rows.map((row) => ({
      playerId: row.playerId,
      username: row.username,
      displayName: row.displayName,
      level: row.level,
      sharedRaces: row.sharedRaces,
      lastRacedAt: row.lastRacedAt.toISOString(),
      relation: row.relation,
    }));
  }
}
