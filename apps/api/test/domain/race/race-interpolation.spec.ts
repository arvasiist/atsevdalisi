import { describe, expect, it } from 'vitest';
import { interpolateHorsePositionAtTime } from '../../../src/domain/race/race-interpolation';
import type { RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';

function segment(overrides: Partial<RaceSegmentSnapshot> = {}): RaceSegmentSnapshot {
  return {
    raceEntryId: 'h1',
    segmentDistanceMeters: 200,
    timestampMs: 10000,
    positionMeters: 200,
    speed: 20,
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

describe('interpolateHorsePositionAtTime', () => {
  it('hiç segment yoksa (0,0) döner', () => {
    const result = interpolateHorsePositionAtTime([], 'ghost', 5000);
    expect(result).toEqual({ positionMeters: 0, speedMps: 0 });
  });

  it('ilk kontrol noktasından önceki bir zamanda başlangıçtan orantılı ara değer döner', () => {
    const segments = [segment({ timestampMs: 10000, positionMeters: 200 })];
    const result = interpolateHorsePositionAtTime(segments, 'h1', 5000);
    expect(result.positionMeters).toBeCloseTo(100, 0);
  });

  it('iki kontrol noktası arasında lineer ara değer üretir', () => {
    const segments = [
      segment({ timestampMs: 10000, positionMeters: 200 }),
      segment({ timestampMs: 20000, positionMeters: 400 }),
    ];
    const result = interpolateHorsePositionAtTime(segments, 'h1', 15000);
    expect(result.positionMeters).toBeCloseTo(300, 0);
  });

  it('tam bir kontrol noktasında o noktanın değerini döner', () => {
    const segments = [
      segment({ timestampMs: 10000, positionMeters: 200 }),
      segment({ timestampMs: 20000, positionMeters: 400 }),
    ];
    const result = interpolateHorsePositionAtTime(segments, 'h1', 20000);
    expect(result.positionMeters).toBeCloseTo(400, 0);
  });

  it('son kontrol noktasından sonraki bir zamanda sabit kalır (ileri taşmaz)', () => {
    const segments = [segment({ timestampMs: 10000, positionMeters: 200 })];
    const result = interpolateHorsePositionAtTime(segments, 'h1', 99999);
    expect(result.positionMeters).toBe(200);
  });

  it('yalnızca istenen atın segmentlerini dikkate alır', () => {
    const segments = [
      segment({ raceEntryId: 'h1', timestampMs: 10000, positionMeters: 200 }),
      segment({ raceEntryId: 'h2', timestampMs: 5000, positionMeters: 900 }),
    ];
    const result = interpolateHorsePositionAtTime(segments, 'h1', 10000);
    expect(result.positionMeters).toBeCloseTo(200, 0);
  });
});
