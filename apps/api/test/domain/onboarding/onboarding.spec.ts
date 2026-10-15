import { describe, expect, it } from 'vitest';
import { loadOnboardingConfig } from '@at-sevdalisi/game-config';
import { ONBOARDING_STEP_KEYS } from '@at-sevdalisi/shared-types';
import { buildOnboardingView, validateOnboardingConfig } from '../../../src/domain/onboarding/onboarding';

/** 15.10.2026 — S6: "Sıradaki adım" (ilk oturum yolu) — saf kurallar. */
const CONFIG = loadOnboardingConfig();

describe('validateOnboardingConfig', () => {
  it('depodaki config geçerli ve bütün sunucu adımlarını kapsar (API açılışı aynı denetimi koşar)', () => {
    expect(validateOnboardingConfig(CONFIG)).toEqual([]);
    expect(CONFIG.steps.map((step) => step.key).sort()).toEqual([...ONBOARDING_STEP_KEYS].sort());
  });

  it('bilinmeyen/tekrarlayan anahtar, boş başlık ve oyun dışı bağlantı reddedilir', () => {
    const [first] = CONFIG.steps;
    const withStep = (patch: object) => ({ steps: [{ ...first!, ...patch }] });
    expect(validateOnboardingConfig(withStep({ key: 'uydurma' }))).not.toEqual([]);
    expect(validateOnboardingConfig({ steps: [first!, first!] })).not.toEqual([]);
    expect(validateOnboardingConfig(withStep({ title: '  ' }))).not.toEqual([]);
    for (const href of ['https://kotu.example', '//kotu.example', 'stable']) {
      expect(validateOnboardingConfig(withStep({ href }))).not.toEqual([]);
    }
    expect(validateOnboardingConfig({ steps: [] })).not.toEqual([]);
  });
});

describe('buildOnboardingView', () => {
  it('config sırası korunur; sıradaki = ilk yapılmamış; hepsi bitince null', () => {
    const none = buildOnboardingView(CONFIG, new Set());
    expect(none.steps.map((step) => step.key)).toEqual(CONFIG.steps.map((step) => step.key));
    expect(none.nextKey).toBe(CONFIG.steps[0]!.key);
    expect(none.completedCount).toBe(0);

    const firstDone = buildOnboardingView(CONFIG, new Set([CONFIG.steps[0]!.key as never]));
    expect(firstDone.nextKey).toBe(CONFIG.steps[1]!.key);
    expect(firstDone.completedCount).toBe(1);

    // Sırayla değil, atlayarak yapılan adım da sayılır; sıradaki yine ilk eksik.
    const skipped = buildOnboardingView(CONFIG, new Set([CONFIG.steps[2]!.key as never]));
    expect(skipped.nextKey).toBe(CONFIG.steps[0]!.key);

    const all = buildOnboardingView(CONFIG, new Set(ONBOARDING_STEP_KEYS));
    expect(all.nextKey).toBeNull();
    expect(all.completedCount).toBe(all.totalCount);
  });
});
