import type { OnboardingStepKey } from '@at-sevdalisi/shared-types';

export const ONBOARDING_REPOSITORY = Symbol('ONBOARDING_REPOSITORY');

/** 15.10.2026 — S6: oyuncunun tamamladığı ilk oturum adımları (mevcut tablolardan TÜRETİLİR). */
export interface OnboardingRepository {
  findCompletedSteps(playerId: string): Promise<Set<OnboardingStepKey>>;
}
