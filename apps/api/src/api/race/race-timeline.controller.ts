import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import type { ApiSuccess, RaceTimelineView } from '@at-sevdalisi/shared-types';
import { GetRaceTimelineUseCase } from '../../application/use-cases/get-race-timeline.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';

/**
 * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`
 * (docs/API.md, brief §58 replay). Ayrı bir controller (`RaceController`'ın
 * `@Controller('horses')` prefix'inin AKSİNE `@Controller('races')`) —
 * `RecentRacesController`'ın `RaceController` ile AYNI modülü (`RaceModule`)
 * FARKLI bir prefix'le paylaştığı desenin AYNISI (o dosyanın doc yorumu).
 *
 * Yetkilendirme `GetRaceTimelineUseCase`'in KENDİSİNDE yapılır (bkz. o
 * dosyanın doc yorumu) — bu route seviyesinde ek bir guard YOKTUR, sadece
 * global `AuthGuard`'ın doldurduğu `CurrentPlayer()` kullanılır.
 */
@Controller('races')
export class RaceTimelineController {
  constructor(@Inject(GetRaceTimelineUseCase) private readonly getRaceTimelineUseCase: GetRaceTimelineUseCase) {}

  @Get(':id/timeline')
  async getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceTimelineView>> {
    const timeline = await this.getRaceTimelineUseCase.execute(id, currentPlayer.id);
    return { success: true, data: timeline };
  }
}
