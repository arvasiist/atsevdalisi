import { describe, expect, it } from 'vitest';
import { QUEST_METRICS } from '@at-sevdalisi/shared-types';
import {
  QUEST_METRIC_LABELS,
  questProgressText,
  questState,
  timeLeftText,
} from '../../../src/features/quests/quest-labels';

describe('görev ekranı kararları (Faz 11-B)', () => {
  it('her ölçütün etiketi var', () => {
    for (const metric of QUEST_METRICS) expect(QUEST_METRIC_LABELS[metric]).toBeTruthy();
  });
  it('ilerleme hedefte kırpılır', () => {
    expect(questProgressText('races_entered', 7, 5)).toBe('Yarış koş · 5/5');
    expect(questProgressText('trainings', 1, 2)).toBe('Antrenman yap · 1/2');
  });
  it('durum: alındı > hazır > sürüyor', () => {
    expect(questState({ progress: 3, target: 2, claimed: true })).toBe('claimed');
    expect(questState({ progress: 2, target: 2, claimed: false })).toBe('ready');
    expect(questState({ progress: 1, target: 2, claimed: false })).toBe('in_progress');
  });
  it('kalan süre metni', () => {
    const now = new Date('2026-10-02T12:00:00Z');
    expect(timeLeftText('2026-10-02T17:12:30Z', now)).toBe('5 sa 12 dk');
    expect(timeLeftText('2026-10-04T15:00:00Z', now)).toBe('2 gün 3 sa');
    expect(timeLeftText('2026-10-02T11:00:00Z', now)).toBe('bitti');
  });
});
