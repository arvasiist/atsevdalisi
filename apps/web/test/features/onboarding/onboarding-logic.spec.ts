import { describe, expect, it } from 'vitest';
import type { OnboardingView } from '@at-sevdalisi/shared-types';
import { nextOnboardingStep, onboardingProgressLabel } from '../../../src/features/onboarding/onboarding-logic';

/** 15.10.2026 — S6: panelin saf yardımcıları (kural ve ilerleme sunucudadır). */
function view(patch: Partial<OnboardingView> = {}): OnboardingView {
  return {
    steps: [
      { key: 'care', title: 'Bakım', hint: '', href: '/stable?panel=care', done: true },
      { key: 'train', title: 'Antrenman', hint: '', href: '/training', done: false },
      { key: 'race', title: 'Yarış', hint: '', href: '/races', done: false },
    ],
    completedCount: 1,
    totalCount: 3,
    nextKey: 'train',
    ...patch,
  };
}

describe('onboarding-logic', () => {
  it('sunucunun nextKey adımını döner; hepsi bittiyse null (panel gizlenir)', () => {
    expect(nextOnboardingStep(view())?.key).toBe('train');
    expect(nextOnboardingStep(view({ nextKey: null }))).toBeNull();
  });

  it('listede olmayan bir nextKey gelirse (sürüm farkı) ilk yapılmamış adıma düşer', () => {
    expect(nextOnboardingStep(view({ nextKey: 'lobby_race' }))?.key).toBe('train');
  });

  it('ilerleme metni', () => {
    expect(onboardingProgressLabel(view())).toBe('1/3 tamamlandı');
  });
});
