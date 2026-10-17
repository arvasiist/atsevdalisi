import { describe, expect, it } from 'vitest';
import { describeNeeds, needsTrainingPenalty } from '../../../src/features/horse-profile/horse-needs';

/** 17.10.2026 (brief §14) — yem/su ihtiyacı satırı (düzey ve çarpan sunucudan). */
describe('describeNeeds / needsTrainingPenalty', () => {
  const now = new Date('2026-10-17T12:00:00Z');

  it('tok ve susuz olmayan at: kalan süre; ceza yok', () => {
    const needs = {
      feed: { level: 'ok' as const, lastAt: '2026-10-17T06:00:00Z', dueAt: '2026-10-18T06:00:00Z' },
      water: { level: 'ok' as const, lastAt: '2026-10-17T10:30:00Z', dueAt: '2026-10-17T22:30:00Z' },
      trainingFactor: 1,
    };
    expect(describeNeeds(needs, now).map((line) => line.text)).toEqual(['Tok · 18 sa sonra yem', 'Susuz değil · 11 sa sonra su']);
    expect(needsTrainingPenalty(needs)).toBeNull();
  });

  it('aç + susuz at: düzey metni ve antrenman cezası', () => {
    const needs = {
      feed: { level: 'due' as const, lastAt: '2026-10-16T06:00:00Z', dueAt: '2026-10-17T06:00:00Z' },
      water: { level: 'urgent' as const, lastAt: '2026-10-16T06:00:00Z', dueAt: '2026-10-16T18:00:00Z' },
      trainingFactor: 0.75,
    };
    expect(describeNeeds(needs, now).map((line) => [line.level, line.text])).toEqual([
      ['due', 'Yem zamanı'],
      ['urgent', 'Susuz'],
    ]);
    expect(needsTrainingPenalty(needs)).toBe('Antrenman verimi −%25 (yem ve su ver)');
  });
});
