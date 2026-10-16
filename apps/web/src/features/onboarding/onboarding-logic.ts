import type { OnboardingStepView, OnboardingView } from '@at-sevdalisi/shared-types';

/** Sunucunun `nextKey`i — liste dışı bir anahtar gelirse (eski/yeni sürüm farkı) ilk yapılmamış adım. */
export function nextOnboardingStep(view: OnboardingView): OnboardingStepView | null {
  if (view.nextKey === null) return null;
  return view.steps.find((step) => step.key === view.nextKey) ?? view.steps.find((step) => !step.done) ?? null;
}

/** "3/7 tamamlandı" */
export function onboardingProgressLabel(view: OnboardingView): string {
  return `${view.completedCount}/${view.totalCount} tamamlandı`;
}
