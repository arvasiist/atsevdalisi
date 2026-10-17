import {
  BadRequestException,
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
  UseInterceptors,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type {
  ApiSuccess,
  CollectTribuneGiftsResult,
  RaceTribuneGiftsView,
  SendTribuneGiftResult,
  TribuneGiftInboxView,
} from '@at-sevdalisi/shared-types';
import { TribuneGiftUseCase } from '../../application/use-cases/tribune-gift.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { SendTribuneGiftDto } from './dto/send-tribune-gift.dto';

/**
 * TRİBÜN HEDİYESİ (08.10.2026). Gönderen token'dan gelir; gövdede YALNIZCA
 * at + hediye anahtarı. PARA YOLU → `Idempotency-Key` ZORUNLU (tekrar ikinci
 * kez tahsil etmesin) + `@RateLimit`.
 */
@Controller('races/:raceId/tribune-gifts')
export class TribuneGiftController {
  constructor(@Inject(TribuneGiftUseCase) private readonly tribuneGifts: TribuneGiftUseCase) {}

  @Get()
  async board(
    @Param('raceId', ParseUUIDPipe) raceId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceTribuneGiftsView>> {
    return { success: true, data: await this.tribuneGifts.board(raceId, player.id) };
  }

  @RateLimit({ name: 'tribune-gift-send', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async send(
    @Param('raceId', ParseUUIDPipe) raceId: string,
    @Body() dto: SendTribuneGiftDto,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<SendTribuneGiftResult>> {
    // Gövde UUID'si DTO dekoratörüne bırakılmaz (CLAUDE.md "gövde-UUID" kuralı).
    if (!dto.horseId || !isUUID(dto.horseId)) {
      throw new BadRequestException('horseId geçerli bir UUID olmalıdır.');
    }
    const result = await this.tribuneGifts.send(raceId, player.id, dto.horseId, dto.giftKey, idempotencyKey ?? null);
    return { success: true, data: result };
  }
}

/**
 * 17.10.2026 (brief §17) — at sahibinin HEDİYE KUTUSU. Oyuncu token'dan gelir
 * (başkasının kutusu sorulamaz). Toplama PARA YOLU: oyuncu `FOR UPDATE` + tek
 * defter satırı; tekrar çağrı sıfır toplar.
 */
@Controller('tribune-gifts')
export class TribuneGiftInboxController {
  constructor(@Inject(TribuneGiftUseCase) private readonly tribuneGifts: TribuneGiftUseCase) {}

  @RateLimit({ name: 'tribune-gift-inbox', limit: 60, windowSeconds: 60, keyBy: 'player' })
  @Get('inbox')
  async inbox(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<TribuneGiftInboxView>> {
    return { success: true, data: await this.tribuneGifts.inbox(player.id) };
  }

  @RateLimit({ name: 'tribune-gift-collect', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post('collect')
  @HttpCode(HttpStatus.OK)
  async collect(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<CollectTribuneGiftsResult>> {
    return { success: true, data: await this.tribuneGifts.collect(player.id) };
  }
}
