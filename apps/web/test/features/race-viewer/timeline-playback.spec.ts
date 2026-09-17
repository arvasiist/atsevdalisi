import { describe, expect, it } from 'vitest';
import type { RaceSegmentSnapshot, RaceTimeline } from '@at-sevdalisi/shared-types';
import {
  advancePlaybackTimeMs,
  getHorseIdsFromTimeline,
  getLiveLeaderboard,
  getRaceDurationMs,
  interpolateHorseStateAtTime,
} from '../../../src/features/race-viewer/timeline-playback';

function makeSegment(overrides: Partial<RaceSegmentSnapshot>): RaceSegmentSnapshot {
  return {
    raceEntryId: 'h1',
    segmentDistanceMeters: 200,
    timestampMs: 1000,
    positionMeters: 200,
    speed: 15,
    stamina: 70,
    fatigue: 20,
    lane: 1,
    tacticalState: 'mid_pack',
    currentRank: 1,
    blocked: false,
    decision: 'hold',
    ...overrides,
  };
}

describe('interpolateHorseStateAtTime', () => {
  const segments: RaceSegmentSnapshot[] = [
    makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 200, speed: 15 }),
    makeSegment({ raceEntryId: 'h1', timestampMs: 2000, positionMeters: 400, speed: 17 }),
  ];

  it('hiç segmenti olmayan at için sıfır döner', () => {
    const state = interpolateHorseStateAtTime(segments, 'unknown', 500);
    expect(state).toEqual({ positionMeters: 0, speedMps: 0 });
  });

  it('ilk kontrol noktasından önce, start çizgisinden orantılı ilerler', () => {
    const state = interpolateHorseStateAtTime(segments, 'h1', 500);
    expect(state.positionMeters).toBeCloseTo(100, 6);
  });

  it('iki kontrol noktası arasında lineer ara değer üretir', () => {
    const state = interpolateHorseStateAtTime(segments, 'h1', 1500);
    expect(state.positionMeters).toBeCloseTo(300, 6);
    expect(state.speedMps).toBeCloseTo(16, 6);
  });

  it('son kontrol noktasından sonra sabit kalır', () => {
    const state = interpolateHorseStateAtTime(segments, 'h1', 5000);
    expect(state.positionMeters).toBe(400);
    expect(state.speedMps).toBe(17);
  });

  it('tam kontrol noktası zamanında birebir o noktanın değerini döner', () => {
    const state = interpolateHorseStateAtTime(segments, 'h1', 2000);
    expect(state.positionMeters).toBe(400);
  });
});

describe('interpolateHorseStateAtTime — kategorik/opsiyonel alanlar (animasyon durumu için)', () => {
  const segments: RaceSegmentSnapshot[] = [
    makeSegment({
      raceEntryId: 'h1',
      timestampMs: 1000,
      positionMeters: 200,
      speed: 15,
      stamina: 80,
      fatigue: 10,
      lane: 2,
      tacticalState: 'front_runner',
      blocked: false,
      decision: 'hold',
    }),
    makeSegment({
      raceEntryId: 'h1',
      timestampMs: 2000,
      positionMeters: 400,
      speed: 17,
      stamina: 60,
      fatigue: 30,
      lane: 3,
      tacticalState: 'closer',
      blocked: true,
      decision: 'push_for_finish',
    }),
  ];

  it('ilk kontrol noktasından önce, ilk segmentin kategorik değerlerini kullanır (fraction uygulanmaz)', () => {
    const state = interpolateHorseStateAtTime(segments, 'h1', 500);
    expect(state.stamina).toBe(80);
    expect(state.fatigue).toBe(10);
    expect(state.lane).toBe(2);
    expect(state.tacticalState).toBe('front_runner');
    expect(state.blocked).toBe(false);
    expect(state.decision).toBe('hold');
  });

  it('iki kontrol noktası arasında, stamina/fatigue lineer ara değerlenir, kategorik alanlar ÖNCEKİ segmentten alınır', () => {
    const state = interpolateHorseStateAtTime(segments, 'h1', 1500);
    expect(state.stamina).toBeCloseTo(70, 6);
    expect(state.fatigue).toBeCloseTo(20, 6);
    expect(state.lane).toBe(2);
    expect(state.tacticalState).toBe('front_runner');
    expect(state.blocked).toBe(false);
    expect(state.decision).toBe('hold');
  });

  it('son kontrol noktasından sonra, son segmentin kategorik değerlerinde sabit kalır', () => {
    const state = interpolateHorseStateAtTime(segments, 'h1', 5000);
    expect(state.stamina).toBe(60);
    expect(state.fatigue).toBe(30);
    expect(state.lane).toBe(3);
    expect(state.tacticalState).toBe('closer');
    expect(state.blocked).toBe(true);
    expect(state.decision).toBe('push_for_finish');
  });

  it('hiç segmenti olmayan at için kategorik alanlar tanımsızdır', () => {
    const state = interpolateHorseStateAtTime(segments, 'unknown', 1500);
    expect(state.stamina).toBeUndefined();
    expect(state.lane).toBeUndefined();
    expect(state.decision).toBeUndefined();
  });
});

describe('getHorseIdsFromTimeline ve getRaceDurationMs', () => {
  const timeline: RaceTimeline = {
    raceId: 'race-1',
    simulationSeed: 'seed',
    segments: [],
    finalResult: [
      { horseId: 'h1', finishTimeMs: 94820, finishPosition: 1, performanceScore: 90 },
      { horseId: 'h2', finishTimeMs: 95100, finishPosition: 2, performanceScore: 85 },
    ],
    explanations: [],
  };

  it('tüm at kimliklerini döner', () => {
    expect(getHorseIdsFromTimeline(timeline).sort()).toEqual(['h1', 'h2']);
  });

  it('en yavaş atın bitiş zamanını döner', () => {
    expect(getRaceDurationMs(timeline)).toBe(95100);
  });

  it('finalResult boşsa 0 döner', () => {
    expect(getRaceDurationMs({ ...timeline, finalResult: [] })).toBe(0);
  });
});

describe('getLiveLeaderboard', () => {
  const segments: RaceSegmentSnapshot[] = [
    makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 300, speed: 15 }),
    makeSegment({ raceEntryId: 'h2', timestampMs: 1000, positionMeters: 250, speed: 14 }),
  ];

  it('pozisyona göre azalan sırada sıralar ve rank atar', () => {
    const leaderboard = getLiveLeaderboard(segments, ['h1', 'h2'], 1000);
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0]!.horseId).toBe('h1');
    expect(leaderboard[0]!.rank).toBe(1);
    expect(leaderboard[1]!.horseId).toBe('h2');
    expect(leaderboard[1]!.rank).toBe(2);
  });

  it('liderin gapToLeaderMeters değeri her zaman 0dır', () => {
    const leaderboard = getLiveLeaderboard(segments, ['h1', 'h2'], 1000);
    expect(leaderboard[0]!.gapToLeaderMeters).toBe(0);
  });

  it('geride kalan atın farkı doğru hesaplanır', () => {
    const leaderboard = getLiveLeaderboard(segments, ['h1', 'h2'], 1000);
    expect(leaderboard[1]!.gapToLeaderMeters).toBeCloseTo(50, 6);
  });
});

describe('advancePlaybackTimeMs', () => {
  it('normal ilerlemede deltaMs * speedMultiplier kadar ilerler', () => {
    const next = advancePlaybackTimeMs(1000, 16, 2, 100000);
    expect(next).toBeCloseTo(1032, 6);
  });

  it('durationMs üzerine çıkamaz (clamp)', () => {
    const next = advancePlaybackTimeMs(99990, 100, 1, 100000);
    expect(next).toBe(100000);
  });

  it('0dan küçük olamaz (clamp)', () => {
    const next = advancePlaybackTimeMs(5, -1000, 1, 100000);
    expect(next).toBeGreaterThanOrEqual(0);
  });

  it('deltaMs sıfır veya negatifse zaman değişmez', () => {
    expect(advancePlaybackTimeMs(500, 0, 1, 100000)).toBe(500);
    expect(advancePlaybackTimeMs(500, -5, 1, 100000)).toBe(500);
  });
});
