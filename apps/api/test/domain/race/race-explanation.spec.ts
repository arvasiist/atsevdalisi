import { describe, expect, it } from 'vitest';
import { explainRace } from '../../../src/domain/race/race-explanation';
import type { RaceFinishEntry, RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';

function segment(overrides: Partial<RaceSegmentSnapshot> = {}): RaceSegmentSnapshot {
  return {
    raceEntryId: 'h1',
    segmentDistanceMeters: 200,
    timestampMs: 1000,
    positionMeters: 200,
    speed: 16,
    stamina: 80,
    fatigue: 10,
    lane: 1,
    tacticalState: 'mid_pack',
    currentRank: 1,
    blocked: false,
    decision: 'hold',
    ...overrides,
  };
}

function finish(overrides: Partial<RaceFinishEntry> = {}): RaceFinishEntry {
  return { horseId: 'h1', finishTimeMs: 90000, finishPosition: 1, performanceScore: 80, ...overrides };
}

describe('explainRace', () => {
  it('her at için bir açıklama üretir', () => {
    const segments = [segment({ raceEntryId: 'h1' }), segment({ raceEntryId: 'h2' })];
    const finalResult = [finish({ horseId: 'h1' }), finish({ horseId: 'h2', finishPosition: 2 })];
    const explanations = explainRace(segments, finalResult);
    expect(explanations).toHaveLength(2);
  });

  it('pozisyon iyileşmesini pozitif faktör olarak işaretler', () => {
    const segments = [
      segment({ raceEntryId: 'h1', timestampMs: 1000, currentRank: 4 }),
      segment({ raceEntryId: 'h1', timestampMs: 2000, currentRank: 1 }),
    ];
    const [explanation] = explainRace(segments, [finish({ horseId: 'h1' })]);
    expect(explanation!.positives.length).toBeGreaterThan(0);
  });

  it('pozisyon kaybını negatif faktör olarak işaretler', () => {
    const segments = [
      segment({ raceEntryId: 'h1', timestampMs: 1000, currentRank: 1 }),
      segment({ raceEntryId: 'h1', timestampMs: 2000, currentRank: 4 }),
    ];
    const [explanation] = explainRace(segments, [finish({ horseId: 'h1' })]);
    expect(explanation!.negatives.length).toBeGreaterThan(0);
  });

  it('stamina tamamen tükenmişse negatif faktör ekler', () => {
    const segments = [segment({ raceEntryId: 'h1', stamina: 0 })];
    const [explanation] = explainRace(segments, [finish({ horseId: 'h1' })]);
    expect(explanation!.negatives.some((n) => n.includes('enerjisi'))).toBe(true);
  });

  it('hiç bloklanmamışsa pozitif faktör ekler', () => {
    const segments = [segment({ raceEntryId: 'h1', blocked: false })];
    const [explanation] = explainRace(segments, [finish({ horseId: 'h1' })]);
    expect(explanation!.positives.some((p) => p.includes('temiz'))).toBe(true);
  });

  it('birden çok kez bloklanmışsa negatif faktör ekler', () => {
    const segments = [
      segment({ raceEntryId: 'h1', timestampMs: 1000, blocked: true }),
      segment({ raceEntryId: 'h1', timestampMs: 2000, blocked: true }),
    ];
    const [explanation] = explainRace(segments, [finish({ horseId: 'h1' })]);
    expect(explanation!.negatives.some((n) => n.includes('trafiğe'))).toBe(true);
  });

  it('push_for_finish kararı varsa final sprint pozitifini ekler', () => {
    const segments = [segment({ raceEntryId: 'h1', decision: 'push_for_finish' })];
    const [explanation] = explainRace(segments, [finish({ horseId: 'h1' })]);
    expect(explanation!.positives.some((p) => p.includes('sprint'))).toBe(true);
  });

  it('bir at için hiç segment yoksa boş listelerle döner (hata fırlatmaz)', () => {
    const [explanation] = explainRace([], [finish({ horseId: 'ghost' })]);
    expect(explanation!.positives).toHaveLength(0);
    expect(explanation!.negatives).toHaveLength(0);
  });
});
