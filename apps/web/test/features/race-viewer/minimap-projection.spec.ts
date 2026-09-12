import { describe, expect, it } from 'vitest';
import { projectToMiniMap } from '../../../src/features/race-viewer/minimap-projection';
import { createStadiumTrackGeometry, getPointOnStadiumTrack } from '../../../src/features/race-viewer/track-path';

describe('projectToMiniMap', () => {
  const geometry = createStadiumTrackGeometry(2000, 60);

  it('pist üzerindeki her nokta [0, 100] yüzde aralığında kalır', () => {
    for (let distance = 0; distance < geometry.lapLengthMeters; distance += 37) {
      const point = getPointOnStadiumTrack(distance, geometry);
      const projected = projectToMiniMap(point, geometry);
      expect(projected.xPercent).toBeGreaterThanOrEqual(0);
      expect(projected.xPercent).toBeLessThanOrEqual(100);
      expect(projected.yPercent).toBeGreaterThanOrEqual(0);
      expect(projected.yPercent).toBeLessThanOrEqual(100);
    }
  });

  it('pist merkezi (0,0) mini haritanın merkezine (50,50) denk gelir', () => {
    const projected = projectToMiniMap({ x: 0, z: 0, headingRadians: 0 }, geometry);
    expect(projected.xPercent).toBeCloseTo(50, 6);
    expect(projected.yPercent).toBeCloseTo(50, 6);
  });

  it('geometri sıfır genişlikte olsa bile (divisor 0) hata vermez', () => {
    const degenerate = createStadiumTrackGeometry(0, 0);
    const projected = projectToMiniMap({ x: 5, z: 5, headingRadians: 0 }, degenerate);
    expect(projected.xPercent).toBe(50);
    expect(projected.yPercent).toBe(50);
  });

  it('padding arttıkça kullanılabilir alan daralır', () => {
    const point = getPointOnStadiumTrack(geometry.straightLengthMeters + Math.PI * geometry.turnRadiusMeters * 0.5, geometry);
    const tightPadding = projectToMiniMap(point, geometry, 5);
    const widePadding = projectToMiniMap(point, geometry, 40);
    const tightDistance = Math.abs(tightPadding.xPercent - 50);
    const wideDistance = Math.abs(widePadding.xPercent - 50);
    expect(wideDistance).toBeLessThanOrEqual(tightDistance);
  });
});
