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
 * (docs/ARCHITECTURE.md §4).
 *
 * **`ticketPrice` ARTIK BURADA EKLENMEZ (PHASE 7.1, 29.09.2026).**
 * 27.09.2026 – 29.09.2026 arasında bu use-case, repository'nin
 * `WatchableRaceFacts` (`Omit<WatchableRaceView, 'ticketPrice'>`) satırlarına
 * config'teki tek fiyatı yamıyordu. Artık fiyat satır başına
 * `races.tribune_fee`'dir ve repository onu ZATEN `WatchableRaceView`
 * olarak döner — burada yapılacak bir birleştirme kalmadı. İki katmana
 * yayılmış bir "fiyatı kim koyuyor" sorusu, ikisinin ayrıştığı bir durum
 * üretir; soru tek katmanda biter.
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

    const { watchWindowHours, watchableRacesLimit } = this.config.grandstand;
    return this.grandstandRepository.findWatchableRaces(playerId, watchWindowHours, watchableRacesLimit);
  }
}
