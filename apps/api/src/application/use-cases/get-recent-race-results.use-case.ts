import { Inject, Injectable } from '@nestjs/common';
import type { RecentRaceResultView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

const DEFAULT_RECENT_RACE_LIMIT = 5;
const MAX_RECENT_RACE_LIMIT = 20;

/**
 * Faz 2 (görsel kalite planı) — brief §38'e komşu Ana Sayfa "Son Yarış
 * Sonuçları" paneli. `GetStableSummaryUseCase` ile AYNI desen: hiçbir iş
 * kuralı İÇERMEZ, yalnızca oyuncunun var olduğunu doğrular ve
 * `RaceRepository`'yi çağırır (bkz. docs/ARCHITECTURE.md §4).
 */
@Injectable()
export class GetRecentRaceResultsUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
  ) {}

  async execute(playerId: string, limit: number = DEFAULT_RECENT_RACE_LIMIT): Promise<RecentRaceResultView[]> {
    const player = await this.playerRepository.findById(playerId);
    if (player === null) {
      throw new PlayerNotFoundError(playerId);
    }

    const clampedLimit = Math.min(Math.max(1, limit), MAX_RECENT_RACE_LIMIT);
    return this.raceRepository.findRecentResultsByOwnerId(playerId, clampedLimit);
  }
}
