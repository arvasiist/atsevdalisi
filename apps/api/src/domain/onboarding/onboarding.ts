import { ONBOARDING_STEP_KEYS, type OnboardingStepKey, type OnboardingView } from '@at-sevdalisi/shared-types';
import type { OnboardingConfig } from '@at-sevdalisi/game-config';

/**
 * 15.10.2026 — S6 (`docs/OYUN_DONGUSU_DENETIMI.md` B9): "SIRADAKİ ADIM" —
 * yeni oyuncunun ilk oturum yolu. Adımların SIRASI ve metni config'tedir
 * (`config/onboarding.config.json`); her adımın "yapıldı mı" bilgisi SAYAÇ
 * TUTULMADAN mevcut tablolardan türetilir (görev/başarımlarla aynı ilke) —
 * ikinci bir doğruluk kaynağı yoktur, ayrışamaz. Ödül YOKTUR (yalnızca yol
 * gösterir; ekonomiye para basmaz).
 */
export function isOnboardingStepKey(value: unknown): value is OnboardingStepKey {
  return (ONBOARDING_STEP_KEYS as readonly unknown[]).includes(value);
}

/** API açılışında koşar: bilinmeyen/tekrarlayan anahtar, boş metin ya da dış bağlantı reddedilir. */
export function validateOnboardingConfig(config: OnboardingConfig): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(config.steps) || config.steps.length === 0) {
    return ['onboarding.steps en az bir adım içermeli.'];
  }
  for (const step of config.steps) {
    if (!isOnboardingStepKey(step.key)) {
      problems.push(`onboarding: bilinmeyen adım "${String(step.key)}" (ONBOARDING_STEP_KEYS).`);
    }
    if (seen.has(step.key)) {
      problems.push(`onboarding: adım tekrar ediyor: "${step.key}".`);
    }
    seen.add(step.key);
    if (typeof step.title !== 'string' || step.title.trim() === '' || typeof step.hint !== 'string') {
      problems.push(`onboarding: "${step.key}" başlık ve ipucu metni olmalı.`);
    }
    // Yalnızca oyun içi yol: `//` ile başlayan ya da şemalı bağlantı açık yönlendirme olurdu.
    if (typeof step.href !== 'string' || !step.href.startsWith('/') || step.href.startsWith('//')) {
      problems.push(`onboarding: "${step.key}" bağlantısı oyun içi bir yol olmalı ("/" ile başlar).`);
    }
  }
  return problems;
}

/** Config sırası + yapılan adımlar → görünüm. `nextKey` ilk yapılmamış adımdır (hepsi bittiyse `null`). */
export function buildOnboardingView(config: OnboardingConfig, done: ReadonlySet<OnboardingStepKey>): OnboardingView {
  const steps = config.steps
    .filter((step): step is typeof step & { key: OnboardingStepKey } => isOnboardingStepKey(step.key))
    .map((step) => ({ key: step.key, title: step.title, hint: step.hint, href: step.href, done: done.has(step.key) }));
  const next = steps.find((step) => !step.done);
  return {
    steps,
    completedCount: steps.filter((step) => step.done).length,
    totalCount: steps.length,
    nextKey: next?.key ?? null,
  };
}
