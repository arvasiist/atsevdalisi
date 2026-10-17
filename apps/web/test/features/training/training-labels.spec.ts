import { describe, expect, it } from 'vitest';
import { describeTrainer } from '../../../src/features/training/training-labels';

/** 17.10.2026 (brief §13) — antrenör uzmanlığı + gelişim satırı (değerler sunucudan). */
describe('describeTrainer', () => {
  const base = { role: 'trainer' as const, bonusMultiplier: 1.16, experience: 7, sessionsToNextSkill: 13 };

  it('uzman antrenör: alan + iki çarpan + kalan seans', () => {
    expect(describeTrainer({ ...base, specialization: 'speed', trainerFocus: { matched: 1.24, other: 1.12 } })).toBe(
      'Uzmanlık: Hız (+%24; diğer antrenmanlar +%12) · Deneyim 7 · 13 seans sonra beceri +1',
    );
  });

  it('genel antrenör ve tavandaki beceri', () => {
    expect(describeTrainer({ ...base, specialization: null, trainerFocus: null, sessionsToNextSkill: null })).toBe(
      'Genel antrenör (her antrenmanda +%16) · Deneyim 7 · beceri tavanda',
    );
  });

  it('antrenör olmayan personelde satır yok', () => {
    expect(describeTrainer({ ...base, role: 'vet', specialization: null, trainerFocus: null })).toBeNull();
  });
});
