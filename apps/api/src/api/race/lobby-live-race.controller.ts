import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { ApiSuccess, InteractiveRaceView } from '@at-sevdalisi/shared-types';
import { LobbyLiveRaceUseCase } from '../../application/use-cases/lobby-live-race.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * 01.10.2026 — kontrollü lobi/turnuva yarışının canlı uçları (migration 0054).
 * Yalnızca KATILIMCI erişir (değilse 404); tohum ve ileri segmentler
 * yarış bitmeden gönderilmez.
 */
@Controller('races')
export class LobbyLiveRaceController {
  constructor(@Inject(LobbyLiveRaceUseCase) private readonly useCase: LobbyLiveRaceUseCase) {}

  @Get('live/current')
  async current(
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView | null>> {
    return { success: true, data: await this.useCase.current(player.id) };
  }

  @Get(':id/live')
  async view(
    @Param('id', ParseUUIDPipe) raceId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView>> {
    return { success: true, data: await this.useCase.view(player.id, raceId) };
  }

  /** Canlı tribün (01.10.2026) — yetki zaman çizelgesiyle aynı (katılımcı / ücretsiz tribün / bilet). */
  @Get(':id/live/spectate')
  async spectate(
    @Param('id', ParseUUIDPipe) raceId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView>> {
    return { success: true, data: await this.useCase.spectate(player.id, raceId) };
  }

  @Post(':id/live/commands')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'lobby-live-command', limit: 600, windowSeconds: 60, keyBy: 'player' })
  async command(
    @Param('id', ParseUUIDPipe) raceId: string,
    @Body() body: { control?: unknown },
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView>> {
    return { success: true, data: await this.useCase.command(player.id, raceId, body?.control) };
  }

  @Post(':id/live/finish')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'lobby-live-finish', limit: 30, windowSeconds: 60, keyBy: 'player' })
  async finish(
    @Param('id', ParseUUIDPipe) raceId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView>> {
    return { success: true, data: await this.useCase.finish(player.id, raceId) };
  }
}
