import { Inject, Injectable } from '@nestjs/common';
import type { WatchableRaceView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { GRANDSTAND_REPOSITORY, type GrandstandRepository } from '../ports/grandstand.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * Tribün — "izlenebilecek yarışlar" listesi (proje sahibinin açık talebi,
 * 27.09.2026: "insanlar yarışları izleyebilsin").
 *
 * `GetRecentRaceResultsUseCase` ile AYNI desen: hiçbir iş kuralı İÇERMEZ,
 * yalnızca oyuncunun var olduğunu doğrular ve repository'yi çağırır
 * (docs/ARCHITECTURE.md §4). **Tek istisna**, `ticketPrice`'ın burada
 * eklenmesidir — gerekçesi `GrandstandRepository.findWatchableRaces` port
 * doc yorumunda (fiyat bir config değeridir, veritabanı olgusu değildir).
 *
 * `PLAYER_REPOSITORY` bağımlılığı `GetRecentRaceResultsUseCase`'teki AYNI
 * "var olmayan oyuncu 404 döner, sessizce boş liste dönmez" gerekçesiyledir.
 */
@Injectable()
export class ListWatchableRacesUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(GRANDSTAND_REPOSITORY) private readonly grandstandRepository: GrandstandRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<WatchableRaceView[]> {
    const player = await this.playerRepository.findById(playerId);
    if (player === null) {
      throw new PlayerNotFoundError(playerId);
    }

    const { watchWindowHours, watchableRacesLimit, ticketPrice } = this.config.grandstand;
    const facts = await this.grandstandRepository.findWatchableRaces(playerId, watchWindowHours, watchableRacesLimit);

    return facts.map((fact) => ({ ...fact, ticketPrice }));
  }
}
