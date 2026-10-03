import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import type { AchievementBoardView, AchievementClaimResult, ApiSuccess } from '@at-sevdalisi/shared-types';
import { AchievementUseCase } from '../../application/use-cases/achievement.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * BAŞARIMLAR (03.10.2026). Oyuncu kimliği YALNIZCA token'dan gelir
 * (başkası adına talep edilemez); anahtar yalnızca config listesinde aranır.
 */
@Controller('achievements')
export class AchievementsController {
  constructor(@Inject(AchievementUseCase) private readonly achievements: AchievementUseCase) {}

  @Get()
  async board(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<AchievementBoardView>> {
    return { success: true, data: await this.achievements.board(player.id) };
  }

  @RateLimit({ name: 'achievement-claim', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @Post(':achievementKey/claim')
  @HttpCode(HttpStatus.OK)
  async claim(
    @Param('achievementKey') achievementKey: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AchievementClaimResult>> {
    return { success: true, data: await this.achievements.claim(player.id, achievementKey) };
  }
}
