import { Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, UseInterceptors } from '@nestjs/common';
import type { ApiSuccess, CosmeticPurchaseResult, CosmeticsCatalogView } from '@at-sevdalisi/shared-types';
import { CosmeticsUseCase } from '../../application/use-cases/cosmetics.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * KOZMETİK MAĞAZA (09.10.2026, elmas politikası: yalnızca görünüş).
 * Ürün ve fiyat config'ten; yolda yalnızca ürün anahtarı. Satın alma PARA
 * YOLU (elmas): `Idempotency-Key` ZORUNLU + `@RateLimit`.
 */
@Controller('cosmetics')
export class CosmeticsController {
  constructor(@Inject(CosmeticsUseCase) private readonly cosmetics: CosmeticsUseCase) {}

  @Get()
  async catalog(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<CosmeticsCatalogView>> {
    return { success: true, data: await this.cosmetics.catalog(player.id) };
  }

  @RateLimit({ name: 'cosmetic-purchase', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post(':key/purchase')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async purchase(
    @Param('key') key: string,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<CosmeticPurchaseResult>> {
    return { success: true, data: await this.cosmetics.purchase(player.id, key, idempotencyKey ?? null) };
  }
}
