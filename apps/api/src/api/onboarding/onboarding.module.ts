import { Module } from '@nestjs/common';
import { ONBOARDING_REPOSITORY } from '../../application/ports/onboarding.repository';
import { OnboardingUseCase } from '../../application/use-cases/onboarding.use-case';
import { PostgresOnboardingRepository } from '../../infrastructure/onboarding/postgres-onboarding.repository';
import { OnboardingController } from './onboarding.controller';

/** 15.10.2026 — S6: "Sıradaki adım" paneli (ilk oturum yolu). */
@Module({
  controllers: [OnboardingController],
  providers: [OnboardingUseCase, { provide: ONBOARDING_REPOSITORY, useClass: PostgresOnboardingRepository }],
})
export class OnboardingModule {}
