import { Controller, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ApiSuccess, ClaimDailyRewardResult } from '@at-sevdalisi/shared-types';
import { ClaimDailyRewardUseCase } from '../../application/use-cases/claim-daily-reward.use-case';

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
  @Post(':id/daily-reward')
  @HttpCode(HttpStatus.OK)
  async claimDailyReward(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<ClaimDailyRewardResult>> {
    const result = await this.claimDailyRewardUseCase.execute(id);
    return { success: true, data: result };
  }
}
