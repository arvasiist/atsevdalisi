import { describe, expect, it } from 'vitest';
import type { CareerView } from '@at-sevdalisi/shared-types';
import { careerProgressPercent, describeNextGoal } from '../../../src/features/career/career-view';

const tier = (key: string, requiredPoints: number, reached: boolean, tables: string[] = []) => ({
  key,
  name: key === 'local' ? 'Yerel' : key === 'regional' ? 'Bölgesel' : 'Ulusal',
  requiredPoints,
  description: '',
  unlocksTables: tables.map((id) => ({ id, label: id })),
  unlocksHippodromes: [],
  reached,
});

const view = (points: number): CareerView => ({
  points,
  tier: { key: 'local', name: 'Yerel', index: 0 },
  next: { key: 'regional', name: 'Bölgesel', requiredPoints: 40, pointsToNext: 40 - points },
  tiers: [tier('local', 0, true, ['local']), tier('regional', 40, false, ['regional']), tier('national', 150, false)],
  racePoints: [
    { classKey: 'practice', classLabel: 'Pratik / eşleşme', points: [2, 1, 1, 0] },
    { classKey: 'local', classLabel: 'Mahalli Koşu', points: [10, 6, 4, 2] },
    { classKey: 'regional', classLabel: 'Bölgesel Koşu', points: [16, 10, 6, 3] },
  ],
  history: [],
});

describe('kariyer ekranı yardımcıları', () => {
  it('ilerleme yüzdesi mevcut kademeden sıradakine; son kademede 100', () => {
    expect(careerProgressPercent(view(0))).toBe(0);
    expect(careerProgressPercent(view(20))).toBe(50);
    expect(careerProgressPercent({ ...view(500), next: null })).toBe(100);
  });

  it('sıradaki hedef AÇIK sınıfın birinciliğiyle anlatılır (kilitli masa önerilmez)', () => {
    expect(describeNextGoal(view(17))).toBe('Bölgesel kademesine 23 puan: yaklaşık 3 Mahalli Koşu birinciliği.');
    expect(describeNextGoal({ ...view(0), next: null })).toContain('En üst kademedesin');
  });
});
