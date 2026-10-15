import { Controller, Get, Inject } from '@nestjs/common';
import type { ApiSuccess, OnboardingView } from '@at-sevdalisi/shared-types';
import { OnboardingUseCase } from '../../application/use-cases/onboarding.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';

/**
 * 15.10.2026 — S6: `GET /onboarding`. Oyuncu kimliği YALNIZCA token'dan gelir
 * (başkasının ilerlemesi okunamaz). Salt okuma — hız sınırı gerekmez.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(@Inject(OnboardingUseCase) private readonly onboarding: OnboardingUseCase) {}

  @Get()
  async view(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<OnboardingView>> {
    return { success: true, data: await this.onboarding.view(player.id) };
  }
}
