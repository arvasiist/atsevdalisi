import { describe, expect, it } from 'vitest';
import type { RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';
import { mergeSegments } from '../../../src/features/race-viewer/segment-merge';

function seg(raceEntryId: string, timestampMs: number, positionMeters: number): RaceSegmentSnapshot {
  return {
    raceEntryId,
    segmentDistanceMeters: 10,
    timestampMs,
    positionMeters,
    speed: 10,
    stamina: 100,
    fatigue: 0,
    lane: 1,
    tacticalState: 'running',
    currentRank: 1,
    blocked: false,
    decision: 'hold',
  };
}

describe('mergeSegments', () => {
  it('boş bir listeye yeni segmentleri timestampMs\'e göre ARTAN sırada ekler', () => {
    const result = mergeSegments([], [seg('a', 1000, 10), seg('a', 500, 5)]);
    expect(result.map((s) => s.timestampMs)).toEqual([500, 1000]);
  });

  it('reconnection senaryosu: AYNI (raceEntryId, timestampMs) segmenti tekrar gelirse TEKİLLEŞTİRİR (yinelenmez)', () => {
    const first = mergeSegments([], [seg('a', 500, 5), seg('b', 500, 5)]);
    const afterReconnectCatchUp = mergeSegments(first, [seg('a', 500, 5), seg('b', 500, 5)]);
    expect(afterReconnectCatchUp).toHaveLength(2);
  });

  it('aynı (raceEntryId, timestampMs) anahtarında YENİ değer ESKİYİ ezer', () => {
    const stale = mergeSegments([], [seg('a', 1000, 10)]);
    const revised = mergeSegments(stale, [seg('a', 1000, 99)]);
    expect(revised).toHaveLength(1);
    expect(revised[0]?.positionMeters).toBe(99);
  });

  it('farklı raceEntryId + aynı timestampMs ÇAKIŞMAZ, ayrı segmentler olarak kalır', () => {
    const result = mergeSegments([], [seg('a', 1000, 10), seg('b', 1000, 20)]);
    expect(result).toHaveLength(2);
  });

  it('tekrarlı "reconnect" simülasyonlarında sonuç boyutu ASLA katlanmaz (bellek sızıntısı yok)', () => {
    let accumulated: RaceSegmentSnapshot[] = [];
    const catchUpBatch = [seg('a', 100, 1), seg('a', 200, 2), seg('b', 100, 1), seg('b', 200, 2)];
    for (let i = 0; i < 5; i += 1) {
      accumulated = mergeSegments(accumulated, catchUpBatch);
    }
    expect(accumulated).toHaveLength(4);
  });
});
