import { Inject, Injectable } from '@nestjs/common';
import type { OnboardingView } from '@at-sevdalisi/shared-types';
import { buildOnboardingView } from '../../domain/onboarding/onboarding';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { ONBOARDING_REPOSITORY, type OnboardingRepository } from '../ports/onboarding.repository';

/** 15.10.2026 — S6: "Sıradaki adım". Yalnızca okur; ödül yoktur. */
@Injectable()
export class OnboardingUseCase {
  constructor(
    @Inject(ONBOARDING_REPOSITORY) private readonly repository: OnboardingRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async view(playerId: string): Promise<OnboardingView> {
    const done = await this.repository.findCompletedSteps(playerId);
    return buildOnboardingView(this.config.onboarding, done);
  }
}
