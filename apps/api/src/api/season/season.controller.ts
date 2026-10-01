import { Controller, Get, Inject } from '@nestjs/common';
import type { ApiSuccess, SeasonView } from '@at-sevdalisi/shared-types';
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
