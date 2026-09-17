import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { ApiSuccess, RecentRaceResultView } from '@at-sevdalisi/shared-types';
import { GetRecentRaceResultsUseCase } from '../../application/use-cases/get-recent-race-results.use-case';

/**
 * Faz 2 (görsel kalite planı) — Ana Sayfa "Son Yarış Sonuçları" paneli.
 * `StableController`'ın `PlayerController` ile AYNI `/players` prefix'ini
 * paylaştığı desenin AYNISI (bkz. o dosyanın doc yorumu) — tam rota yolu
 * (`/players/:id/recent-races`) `/players/:id` ve `/players/:id/
 * stable-summary` ile ÇAKIŞMAZ. `RaceModule` içinde yaşar çünkü
 * `RACE_REPOSITORY`'ye ihtiyaç duyar (`RaceController` ile AYNI modül).
 *
 * Yalnızca OYUNCUNUN KENDİ pratik yarış geçmişini döner (bkz.
 * `RecentRaceResultView` doc yorumu) — bot rakipler `race_entries`'e
 * yazılmadığından bu "global son kazananlar" akışı DEĞİLDİR.
 */
@Controller('players')
export class RecentRacesController {
  constructor(
    @Inject(GetRecentRaceResultsUseCase) private readonly getRecentRaceResultsUseCase: GetRecentRaceResultsUseCase,
  ) {}

  @Get(':id/recent-races')
  async getRecentRaces(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ): Promise<ApiSuccess<RecentRaceResultView[]>> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const results = await this.getRecentRaceResultsUseCase.execute(
      id,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
    return { success: true, data: results };
  }
}
