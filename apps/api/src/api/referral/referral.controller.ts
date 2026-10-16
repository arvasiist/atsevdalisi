import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import type {
  ApiSuccess,
  AttachReferralResult,
  ClaimReferralRewardsResult,
  ReferralOverviewView,
} from '@at-sevdalisi/shared-types';
import { ReferralUseCase } from '../../application/use-cases/referral.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * 16.10.2026 — sosyal brief §7: arkadaş daveti. Oyuncu kimliği YALNIZCA
 * token'dan; ödül tutarı, koşul ve tavan sunucudadır. `Idempotency-Key`
 * gerekmez: bağlama davetli başına tekil (DB), ödül `rewarded_at` kilit
 * altında yazılır — tekrar istek ikinci kez para üretmez.
 */
@Controller('referrals')
export class ReferralController {
  constructor(@Inject(ReferralUseCase) private readonly referrals: ReferralUseCase) {}

  @Get()
  async overview(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<ReferralOverviewView>> {
    return { success: true, data: await this.referrals.overview(player.id) };
  }

  @RateLimit({ name: 'referral-attach', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post('attach')
  @HttpCode(HttpStatus.OK)
  async attach(
    @Body() body: { code?: unknown },
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AttachReferralResult>> {
    return { success: true, data: await this.referrals.attach(player.id, body?.code) };
  }

  @RateLimit({ name: 'referral-claim', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post('claim')
  @HttpCode(HttpStatus.OK)
  async claim(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<ClaimReferralRewardsResult>> {
    return { success: true, data: await this.referrals.claim(player.id) };
  }
}
