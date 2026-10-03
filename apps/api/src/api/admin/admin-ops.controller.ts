import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type {
  AdminConfigEntry,
  AdminHorseView,
  AdminSeasonView,
  AdminTournamentView,
  ApiSuccess,
  BalanceAdjustmentResult,
} from '@at-sevdalisi/shared-types';
import { AdminOpsUseCase } from '../../application/use-cases/admin-ops.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/** Yönetim işlemleri (Faz 10). Yetki use-case'in ilk satırında, DB'den. */
@Controller('admin')
export class AdminOpsController {
  constructor(@Inject(AdminOpsUseCase) private readonly ops: AdminOpsUseCase) {}

  /**
   * PARA YOLU. `Idempotency-Key` ZORUNLU (kapsam: işlemi yapan yönetici) —
   * yanıt ağda kaybolup yönetici yeniden basarsa ikinci bir düzeltme YAZILMAZ.
   */
  @RateLimit({ name: 'admin-balance-adjust', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post('players/:playerId/balance-adjustments')
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  async adjustBalance(
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Body() body: { currency?: unknown; amount?: unknown; reason?: unknown },
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BalanceAdjustmentResult>> {
    return {
      success: true,
      data: await this.ops.adjustBalance(actor.id, playerId, body ?? {}, idempotencyKey ?? null),
    };
  }

  @Get('horses')
  async searchHorses(
    @Query('q') query: string | undefined,
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminHorseView[]>> {
    return { success: true, data: await this.ops.searchHorses(actor.id, query) };
  }

  @Get('config')
  async config(@CurrentPlayer() actor: AuthenticatedPlayer): Promise<ApiSuccess<AdminConfigEntry[]>> {
    return { success: true, data: await this.ops.listConfig(actor.id) };
  }

  @Get('seasons')
  async seasons(@CurrentPlayer() actor: AuthenticatedPlayer): Promise<ApiSuccess<AdminSeasonView[]>> {
    return { success: true, data: await this.ops.listSeasons(actor.id) };
  }

  @Get('tournaments')
  async tournaments(@CurrentPlayer() actor: AuthenticatedPlayer): Promise<ApiSuccess<AdminTournamentView[]>> {
    return { success: true, data: await this.ops.listTournaments(actor.id) };
  }
}
