import { describe, expect, it } from 'vitest';
import type { RaceSegmentSnapshot, RaceTimeline } from '@at-sevdalisi/shared-types';
import {
  advancePlaybackTimeMs,
  getHorseIdsFromTimeline,
  getLiveLeaderboard,
  getRaceDurationMs,
  interpolateHorseStateAtTime,
  isAnyHorseBlockedAtTime,
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

  it('Master Development Brief SS20 - stamina/fatigue/tacticalState alanlarını taşır (motor zaten üretiyor, burada yalnızca kopyalanıyor)', () => {
    const withStats: RaceSegmentSnapshot[] = [
      makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 300, speed: 15, stamina: 82, fatigue: 12, tacticalState: 'front_runner' }),
      makeSegment({ raceEntryId: 'h2', timestampMs: 1000, positionMeters: 250, speed: 14, stamina: 44, fatigue: 55, tacticalState: 'closer' }),
    ];
    const leaderboard = getLiveLeaderboard(withStats, ['h1', 'h2'], 1000);
    expect(leaderboard[0]!.stamina).toBeCloseTo(82, 6);
    expect(leaderboard[0]!.fatigue).toBeCloseTo(12, 6);
    expect(leaderboard[0]!.tacticalState).toBe('front_runner');
    expect(leaderboard[1]!.stamina).toBeCloseTo(44, 6);
    expect(leaderboard[1]!.fatigue).toBeCloseTo(55, 6);
    expect(leaderboard[1]!.tacticalState).toBe('closer');
  });

  it('hiç segmenti olmayan bir at için stamina/fatigue undefined kalır (uydurulmaz)', () => {
    const leaderboard = getLiveLeaderboard(segments, ['h1', 'unknown-horse'], 1000);
    const unknown = leaderboard.find((entry) => entry.horseId === 'unknown-horse');
    expect(unknown).toBeDefined();
    expect(unknown!.stamina).toBeUndefined();
    expect(unknown!.fatigue).toBeUndefined();
  });
});

/**
 * `RaceSegmentSnapshot.fatigueLevel` + `.paceScore` (bu turda EKLENDİ) —
 * alanların kendi doc yorumları için bkz. `packages/shared-types/src/
 * race.ts` ve `timeline-playback.ts`'teki `fatigueLevelOf`.
 *
 * Bu bloğun varlık nedeni SOMUT bir hataydı: HUD'un "Yor" çubuğu, statik
 * `fatigue` alanını (yarış ÖNCESİ değer) gösterdiği için yarış boyunca DÜZ
 * bir çizgiydi. Aşağıdaki testler hem canlı değerin AKTIĞINI hem de eski
 * kayıtlar için geriye dönük düşüşün ÇALIŞTIĞINI doğrular.
 */
describe('interpolateHorseStateAtTime — fatigueLevel / paceScore', () => {
  it('fatigueLevel taşıyan segmentlerde CANLI değer ara değerlenir ve statik `fatigue` YOK SAYILIR', () => {
    const segments: RaceSegmentSnapshot[] = [
      makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 200, fatigue: 15, fatigueLevel: 8 }),
      makeSegment({ raceEntryId: 'h1', timestampMs: 2000, positionMeters: 400, fatigue: 15, fatigueLevel: 24 }),
    ];
    const state = interpolateHorseStateAtTime(segments, 'h1', 1500);
    expect(state.fatigueLevel).toBeCloseTo(16, 6); // 8 + (24-8)*0.5
    // Statik alan hâlâ taşınır (geriye dönük uyumluluk) ama HUD'un
    // gösterdiği değer DEĞİLDİR.
    expect(state.fatigue).toBeCloseTo(15, 6);
  });

  it('GERİYE DÖNÜK UYUMLULUK: fatigueLevel taşımayan (eski) kayıtta canlı değer statik `fatigue`a düşer — çubuk KAYBOLMAZ', () => {
    const segments: RaceSegmentSnapshot[] = [
      makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 200, fatigue: 30, fatigueLevel: undefined }),
      makeSegment({ raceEntryId: 'h1', timestampMs: 2000, positionMeters: 400, fatigue: 30, fatigueLevel: undefined }),
    ];
    const state = interpolateHorseStateAtTime(segments, 'h1', 1500);
    expect(state.fatigueLevel).toBeCloseTo(30, 6);
  });

  it('paceScore iki kontrol noktası arasında ara değerlenir', () => {
    const segments: RaceSegmentSnapshot[] = [
      makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 200, paceScore: 40 }),
      makeSegment({ raceEntryId: 'h1', timestampMs: 2000, positionMeters: 400, paceScore: 60 }),
    ];
    expect(interpolateHorseStateAtTime(segments, 'h1', 1500).paceScore).toBeCloseTo(50, 6);
  });

  it('paceScore uçlardan biri taşımıyorsa `undefined` kalır — NaN ÜRETİLMEZ', () => {
    const segments: RaceSegmentSnapshot[] = [
      makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 200, paceScore: undefined }),
      makeSegment({ raceEntryId: 'h1', timestampMs: 2000, positionMeters: 400, paceScore: 60 }),
    ];
    const state = interpolateHorseStateAtTime(segments, 'h1', 1500);
    expect(state.paceScore).toBeUndefined();
    expect(Number.isNaN(state.paceScore as number)).toBe(false);
  });

  it('paceScore hiçbir segmentte yoksa (eski kayıt) undefined kalır — uydurulmaz', () => {
    const segments: RaceSegmentSnapshot[] = [
      makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 200, paceScore: undefined }),
      makeSegment({ raceEntryId: 'h1', timestampMs: 2000, positionMeters: 400, paceScore: undefined }),
    ];
    expect(interpolateHorseStateAtTime(segments, 'h1', 1500).paceScore).toBeUndefined();
  });
});

describe('getLiveLeaderboard — fatigueLevel / paceScore', () => {
  it('canlı yorgunluk ve tempo puanını sıralama satırına taşır', () => {
    const segments: RaceSegmentSnapshot[] = [
      makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 300, speed: 15, fatigue: 12, fatigueLevel: 33, paceScore: 65 }),
      makeSegment({ raceEntryId: 'h2', timestampMs: 1000, positionMeters: 250, speed: 14, fatigue: 40, fatigueLevel: 51, paceScore: 47 }),
    ];
    const leaderboard = getLiveLeaderboard(segments, ['h1', 'h2'], 1000);
    expect(leaderboard[0]!.fatigueLevel).toBeCloseTo(33, 6);
    expect(leaderboard[0]!.paceScore).toBeCloseTo(65, 6);
    // Statik alan KORUNUR ama canlıdan FARKLIDIR — ikisinin ayrı mekanizma
    // olduğunun somut kanıtı.
    expect(leaderboard[0]!.fatigue).toBeCloseTo(12, 6);
    expect(leaderboard[1]!.fatigueLevel).toBeCloseTo(51, 6);
    expect(leaderboard[1]!.paceScore).toBeCloseTo(47, 6);
  });

  it('hiç segmenti olmayan at için fatigueLevel/paceScore da undefined kalır (uydurulmaz)', () => {
    const segments: RaceSegmentSnapshot[] = [makeSegment({ raceEntryId: 'h1', timestampMs: 1000, positionMeters: 300 })];
    const unknown = getLiveLeaderboard(segments, ['h1', 'unknown-horse'], 1000).find((e) => e.horseId === 'unknown-horse');
    expect(unknown!.fatigueLevel).toBeUndefined();
    expect(unknown!.paceScore).toBeUndefined();
  });
});

describe('isAnyHorseBlockedAtTime', () => {
  it('hiçbir at bloklanmadıysa false döner', () => {
    const segs: RaceSegmentSnapshot[] = [
      makeSegment({ raceEntryId: 'h1', timestampMs: 1000, blocked: false }),
      makeSegment({ raceEntryId: 'h2', timestampMs: 1000, blocked: false }),
    ];
    expect(isAnyHorseBlockedAtTime(segs, ['h1', 'h2'], 1000)).toBe(false);
  });

  it('en az bir at bloklandıysa true döner (Camera Director OVERTAKE event\'i)', () => {
    const segs: RaceSegmentSnapshot[] = [
      makeSegment({ raceEntryId: 'h1', timestampMs: 1000, blocked: false }),
      makeSegment({ raceEntryId: 'h2', timestampMs: 1000, blocked: true }),
    ];
    expect(isAnyHorseBlockedAtTime(segs, ['h1', 'h2'], 1000)).toBe(true);
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
