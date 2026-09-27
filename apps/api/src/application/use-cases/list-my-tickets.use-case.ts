import { Inject, Injectable } from '@nestjs/common';
import type { RaceTicketView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { GRANDSTAND_REPOSITORY, type GrandstandRepository } from '../ports/grandstand.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * Tribün — "Biletlerim" listesi. `GetRecentRaceResultsUseCase` ile AYNI
 * "hiçbir iş kuralı içermez, yalnızca doğrulama + repository çağrısı"
 * deseni.
 *
 * `GET /players/:id/tickets` yalnızca OYUNCUNUN KENDİ biletlerini döner
 * (`assertSelf` controller'da) — başkasının biletleri hiçbir uç noktadan
 * okunamaz.
 */
@Injectable()
export class ListMyTicketsUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(GRANDSTAND_REPOSITORY) private readonly grandstandRepository: GrandstandRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<RaceTicketView[]> {
    const player = await this.playerRepository.findById(playerId);
    if (player === null) {
      throw new PlayerNotFoundError(playerId);
    }

    return this.grandstandRepository.findTicketsByPlayerId(playerId, this.config.grandstand.myTicketsLimit);
  }
}
