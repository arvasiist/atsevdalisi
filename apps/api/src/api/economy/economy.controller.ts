import { Controller, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ApiSuccess, ClaimDailyRewardResult } from '@at-sevdalisi/shared-types';
import { ClaimDailyRewardUseCase } from '../../application/use-cases/claim-daily-reward.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * docs/API.md §3.1 "Günlük Ödül" (brief §37). `@Controller('players')`
 * `PlayerController`/`StableController` ile AYNI prefix'i paylaşır —
 * `StableController`'daki AYNI gerekçeyle güvenlidir (tam rota yolları
 * çakışmaz).
 */
@Controller('players')
export class EconomyController {
  constructor(@Inject(ClaimDailyRewardUseCase) private readonly claimDailyRewardUseCase: ClaimDailyRewardUseCase) {}

  // Yeni bir KAYNAK yaratmaz — `TrainingController.train`/`CareController.care`/
  // `StableController.upgradeStable` ile AYNI gerekçeyle 200 OK döner
  // (201 Created DEĞİL).
  // AUDIT_REPORT.md Bulgu S4 hardening (bu oturum) — bkz. `assertSelf` doc yorumu.
  // AUDIT_REPORT.md Bulgu S5 (High) hardening, ikinci dilim (bu oturum) —
  // docs/SECURITY.md §7'nin "ödül talebi" örneği. Zaten kendi günlük
  // cooldown kuralı (`DailyRewardAlreadyClaimedError`, 409) var — bu limit
  // yalnızca o kontrole ulaşmadan ÖNCE gereksiz spam denemelerini keser,
  // ikinci bir savunma katmanıdır.
  @RateLimit({ name: 'daily-reward', limit: 5, windowSeconds: 60, keyBy: 'player' })
  @Post(':id/daily-reward')
  @HttpCode(HttpStatus.OK)
  async claimDailyReward(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClaimDailyRewardResult>> {
    assertSelf(currentPlayer.id, id);
    const result = await this.claimDailyRewardUseCase.execute(id);
    return { success: true, data: result };
  }
}
