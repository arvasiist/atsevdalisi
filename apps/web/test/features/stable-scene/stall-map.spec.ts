import { describe, expect, it } from 'vitest';
import {
  allStalls,
  describeStall,
  sceneNeighbors,
  stallState,
  unlockLevelForStall,
  visibleStallCount,
  type StallContext,
} from '../../../src/features/stable-scene/stall-map';

/** 16.10.2026 — ahır bölmeleri: kilitli / boş / dolu, sahnedeki komşular. */
const levels = [
  { level: 1, capacity: 5 },
  { level: 2, capacity: 8 },
  { level: 3, capacity: 12 },
];
const context = (occupants: Array<[number, string]>, capacity = 5): StallContext => ({
  capacity,
  maxStalls: 12,
  occupants: new Map(occupants),
  levels,
});

describe('ahır bölmeleri', () => {
  it('bölme hangi ahır seviyesinde açılır', () => {
    expect(unlockLevelForStall(5, levels)).toBe(1);
    expect(unlockLevelForStall(6, levels)).toBe(2);
    expect(unlockLevelForStall(12, levels)).toBe(3);
    expect(unlockLevelForStall(13, levels)).toBeNull();
  });

  it('dolu / boş / kilitli', () => {
    const ctx = context([[1, 'a']]);
    expect(stallState(1, ctx)).toEqual({ kind: 'occupied', horseId: 'a' });
    expect(stallState(5, ctx)).toEqual({ kind: 'empty' });
    expect(stallState(6, ctx)).toEqual({ kind: 'locked', unlockLevel: 2 });
    expect(describeStall(stallState(6, ctx))).toBe('🔒 Ahır Sv. 2');
    expect(describeStall(stallState(5, ctx))).toBe('+ At al');
  });

  it('bütün bölmeler: en yüksek seviyenin kapasitesi kadar; kapasite dışı dolu bölme de görünür', () => {
    expect(allStalls(context([[1, 'a']]))).toHaveLength(12);
    expect(allStalls(context([[14, 'x']]))).toHaveLength(14);
  });

  it('sahnede komşular: ortadaki atın ±2 bölmesi; 1 altı ve toplam üstü depo kalır', () => {
    const ctx = context([[1, 'a'], [2, 'b']]);
    expect(sceneNeighbors(1, ctx).map((n) => [n.offset, n.stallNumber, n.state.kind])).toEqual([
      [1, 2, 'occupied'],
      [2, 3, 'empty'],
    ]);
    expect(sceneNeighbors(5, ctx).map((n) => [n.stallNumber, n.state.kind])).toEqual([
      [3, 'empty'],
      [4, 'empty'],
      [6, 'locked'],
      [7, 'locked'],
    ]);
    expect(sceneNeighbors(12, ctx).map((n) => n.stallNumber)).toEqual([10, 11]);
    expect(sceneNeighbors(2, ctx).find((n) => n.offset === 1)!.x).toBeGreaterThan(0);
  });

  it('panelde açık bölmeler + bir sonraki seviyenin açacağı bölmeler gösterilir', () => {
    expect(visibleStallCount(context([[1, 'a']]))).toBe(8);
    expect(visibleStallCount(context([[1, 'a']], 8))).toBe(12);
    expect(visibleStallCount(context([[1, 'a']], 12))).toBe(12);
    expect(visibleStallCount(context([[11, 'x']]))).toBe(11);
  });
});
