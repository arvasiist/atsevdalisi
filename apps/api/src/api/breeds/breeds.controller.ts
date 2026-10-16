import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Param, Post, UseInterceptors } from '@nestjs/common';
import type { ApiSuccess, BuyBreedHorseResult } from '@at-sevdalisi/shared-types';
import { BreedShopUseCase } from '../../application/use-cases/breed-shop.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { toPublicHorse } from '../dto/horse.mapper';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * IRK MAĞAZASI (07.10.2026). Katalog (ad, fiyat, seviye şartı, statlar)
 * `config/breeds.config.json`dur ve web onu aynı paketten okur — ayrı bir
 * okuma ucu yoktur. Alıcı kimliği YALNIZCA token'dan gelir; fiyat gövdede
 * GÖNDERİLMEZ. Tekrarlanan istek ikinci bir at + ikinci ödeme olurdu →
 * `Idempotency-Key` ZORUNLU (kapsam: oyuncu).
 */
@Controller('breeds')
export class BreedsController {
  constructor(@Inject(BreedShopUseCase) private readonly shop: BreedShopUseCase) {}

  @RateLimit({ name: 'breed-buy', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post(':breedKey/purchase')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  async purchase(
    @Param('breedKey') breedKey: string,
    @Body() body: { name?: unknown; gender?: unknown } | undefined,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BuyBreedHorseResult>> {
    const result = await this.shop.buy({
      playerId: player.id,
      breedKey,
      name: body?.name,
      gender: body?.gender,
      idempotencyKey: idempotencyKey ?? null,
    });
    return { success: true, data: { horse: toPublicHorse(result.horse), price: result.price, money: result.money } };
  }
}
