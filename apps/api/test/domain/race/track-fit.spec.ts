import { describe, expect, it } from 'vitest';
import type { HorseDistanceStats, HorseSurfaceStats } from '@at-sevdalisi/shared-types';
import {
  computeDistanceCompatibility,
  computeSurfaceCompatibility,
  MIDDLE_DISTANCE_MAX_METERS,
  SHORT_DISTANCE_MAX_METERS,
} from '../../../src/domain/race/track-fit';

function makeSurfaceStats(overrides: Partial<HorseSurfaceStats> = {}): HorseSurfaceStats {
  return {
    horseId: 'horse-1',
    grass: 70,
    dirt: 30,
    wet: 40,
    heavy: 20,
    dry: 60,
    mud: 10,
    ...overrides,
  };
}

function makeDistanceStats(overrides: Partial<HorseDistanceStats> = {}): HorseDistanceStats {
  return {
    horseId: 'horse-1',
    shortDistance: 80,
    middleDistance: 55,
    longDistance: 25,
    ...overrides,
  };
}

describe('computeSurfaceCompatibility (R3 — Track Fit)', () => {
  it("'grass' için stats.grass döner", () => {
    expect(computeSurfaceCompatibility(makeSurfaceStats({ grass: 88 }), 'grass')).toBe(88);
  });

  it("'dirt' için stats.dirt döner", () => {
    expect(computeSurfaceCompatibility(makeSurfaceStats({ dirt: 12 }), 'dirt')).toBe(12);
  });

  it("'synthetic' için nötr (50) döner — horse_surface_stats şemasında karşılık sütun YOK (bkz. track-fit.ts doc yorumu)", () => {
    expect(computeSurfaceCompatibility(makeSurfaceStats({ grass: 1, dirt: 1 }), 'synthetic')).toBe(50);
  });

  it("wet/heavy/dry/mud alanlarını KULLANMAZ (bilinçli kapsam dışı — pist koşulu, environment.ts'in ayrı bir mekanizmasıdır)", () => {
    const stats = makeSurfaceStats({ grass: 70, wet: 0, heavy: 0, dry: 0, mud: 0 });
    expect(computeSurfaceCompatibility(stats, 'grass')).toBe(70);
  });
});

describe('computeDistanceCompatibility (R3 — Track Fit)', () => {
  it(`${SHORT_DISTANCE_MAX_METERS}m'nin ALTI için shortDistance döner`, () => {
    expect(computeDistanceCompatibility(makeDistanceStats({ shortDistance: 91 }), SHORT_DISTANCE_MAX_METERS - 1)).toBe(91);
  });

  it(`tam ${SHORT_DISTANCE_MAX_METERS}m sınırında middleDistance döner (sınır dahil "Middle")`, () => {
    expect(computeDistanceCompatibility(makeDistanceStats({ middleDistance: 62 }), SHORT_DISTANCE_MAX_METERS)).toBe(62);
  });

  it('1600m (projedeki tek gerçek mesafe — Pratik Yarış/PvP) için middleDistance döner', () => {
    expect(computeDistanceCompatibility(makeDistanceStats({ middleDistance: 77 }), 1600)).toBe(77);
  });

  it(`tam ${MIDDLE_DISTANCE_MAX_METERS}m sınırında middleDistance döner (sınır dahil "Middle")`, () => {
    expect(computeDistanceCompatibility(makeDistanceStats({ middleDistance: 44 }), MIDDLE_DISTANCE_MAX_METERS)).toBe(44);
  });

  it(`${MIDDLE_DISTANCE_MAX_METERS}m'nin ÜSTÜ için longDistance döner`, () => {
    expect(computeDistanceCompatibility(makeDistanceStats({ longDistance: 33 }), MIDDLE_DISTANCE_MAX_METERS + 1)).toBe(33);
  });
});
