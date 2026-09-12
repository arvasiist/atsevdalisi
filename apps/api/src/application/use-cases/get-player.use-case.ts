import { Inject, Injectable } from '@nestjs/common';
import type { Player } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/** brief §38 Ana Sayfa "Oyuncu" kartı, `GET /players/:id` (docs/API.md §3). */
@Injectable()
export class GetPlayerUseCase {
  constructor(@Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository) {}

  async execute(id: string): Promise<Player> {
    const player = await this.playerRepository.findById(id);
    if (player === null) {
      throw new PlayerNotFoundError(id);
    }
    return player;
  }
}
