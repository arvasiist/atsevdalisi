import { Controller, Get, Inject, Param } from '@nestjs/common';
import type { ApiSuccess, PeriodLeaderboardView, SeasonView } from '@at-sevdalisi/shared-types';
import { PeriodLeaderboardUseCase } from '../../application/use-cases/period-leaderboard.use-case';
import { SeasonUseCase } from '../../application/use-cases/season.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';

/** Sezon (brief §69, 01.10.2026). Salt okuma — ödülü zamanlayıcı öder, uç DEĞİL. */
@Controller('seasons')
export class SeasonController {
  constructor(@Inject(SeasonUseCase) private readonly seasons: SeasonUseCase) {}

  @Get('current')
  async current(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<SeasonView>> {
    return { success: true, data: await this.seasons.current(player.id) };
  }
}

/** Haftalık/aylık sıralama (Faz 11). Sezonla aynı kaynak + formül; dönem bitince yeni pencere. */
@Controller('leaderboard/period')
export class PeriodLeaderboardController {
  constructor(@Inject(PeriodLeaderboardUseCase) private readonly periods: PeriodLeaderboardUseCase) {}

  @Get(':period')
  async get(
    @Param('period') period: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PeriodLeaderboardView>> {
    return { success: true, data: await this.periods.execute(player.id, period) };
  }
}
