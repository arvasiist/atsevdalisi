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
  UseGuards,
} from '@nestjs/common';
import type { ApiSuccess, InteractiveRaceView } from '@at-sevdalisi/shared-types';
import { InteractiveRaceUseCase } from '../../application/use-cases/interactive-race.use-case';
import { DEFAULT_RACE_TACTIC } from '../../domain/race/validation';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RunPracticeRaceDto } from './dto/run-practice-race.dto';

/**
 * OYUNCU KONTROLLÜ PRATİK YARIŞ (01.10.2026, migration 0053).
 *
 * Başlatma bir PARA yoludur (giriş ücreti hemen düşer) ama
 * `Idempotency-Key` İSTEMEZ: çift başlatmayı "oyuncu başına tek süren
 * oturum" kuralı keser (ikinci istek 409 `INTERACTIVE_RACE_IN_PROGRESS`),
 * yanıtı kaybolan istemci `GET /interactive-races/current` ile oturumu
 * geri bulur. Komut ucu kırbaç spam'ine dayanacak kadar geniş ama sınırlı.
 */
@Controller()
export class InteractiveRaceController {
  constructor(@Inject(InteractiveRaceUseCase) private readonly useCase: InteractiveRaceUseCase) {}

  @UseGuards(HorseOwnerGuardByParam)
  @Post('horses/:id/interactive-race')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'interactive-race-start', limit: 10, windowSeconds: 60, keyBy: 'player' })
  async start(
    @Param('id', ParseUUIDPipe) horseId: string,
    @Body() dto: RunPracticeRaceDto,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView>> {
    const view = await this.useCase.start(player.id, horseId, {
      tactic: {
        racingStyle: dto.racingStyle ?? DEFAULT_RACE_TACTIC.racingStyle,
        riskLevel: dto.riskLevel ?? DEFAULT_RACE_TACTIC.riskLevel,
        startApproach: dto.startApproach ?? DEFAULT_RACE_TACTIC.startApproach,
        finalStretchPlan: dto.finalStretchPlan ?? DEFAULT_RACE_TACTIC.finalStretchPlan,
      },
      tierId: dto.tierId ?? null,
    });
    return { success: true, data: view };
  }

  @Get('interactive-races/current')
  async current(
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView | null>> {
    return { success: true, data: await this.useCase.current(player.id) };
  }

  @Get('interactive-races/:raceId')
  async view(
    @Param('raceId', ParseUUIDPipe) raceId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView>> {
    return { success: true, data: await this.useCase.view(player.id, raceId) };
  }

  @Post('interactive-races/:raceId/commands')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'interactive-race-command', limit: 600, windowSeconds: 60, keyBy: 'player' })
  async command(
    @Param('raceId', ParseUUIDPipe) raceId: string,
    @Body() body: { control?: unknown },
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView>> {
    // Doğrulama domain'de (`parsePlayerControlInput`) — DTO dekoratörleri esbuild altında atlanır.
    return { success: true, data: await this.useCase.command(player.id, raceId, body?.control) };
  }

  @Post('interactive-races/:raceId/finish')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'interactive-race-finish', limit: 30, windowSeconds: 60, keyBy: 'player' })
  async finish(
    @Param('raceId', ParseUUIDPipe) raceId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<InteractiveRaceView>> {
    return { success: true, data: await this.useCase.finish(player.id, raceId) };
  }
}
