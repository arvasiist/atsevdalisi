/**
 * 15.10.2026 — S6: "Sıradaki adım" (ilk oturum yolu). Adım anahtarları
 * KAPALI kümedir: her anahtarın sunucuda bir SQL karşılığı vardır
 * (`postgres-onboarding.repository.ts` → `Record<OnboardingStepKey, …>`;
 * eksik anahtar tsc hatası). Sıra ve metin `config/onboarding.config.json`.
 */
export const ONBOARDING_STEP_KEYS = [
  'care',
  'train',
  'jockey',
  'race',
  'daily_reward',
  'quest_reward',
  'lobby_race',
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export interface OnboardingStepView {
  key: OnboardingStepKey;
  title: string;
  hint: string;
  /** Oyun içi yol (`/` ile başlar). */
  href: string;
  done: boolean;
}

/** `GET /onboarding` — yalnızca çağıranın kendi ilerlemesi. */
export interface OnboardingView {
  steps: OnboardingStepView[];
  completedCount: number;
  totalCount: number;
  /** İlk yapılmamış adım; hepsi bittiyse `null` (panel gizlenir). */
  nextKey: OnboardingStepKey | null;
}
