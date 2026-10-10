import { describe, expect, it } from 'vitest';
import { loadHippodromesConfig } from '@at-sevdalisi/game-config';
import { BROADCAST_CAMERA_SIDE_OFFSET_METERS } from '../../../src/features/race-viewer/camera-presets';
import { hippodromeTrackGeometry } from '../../../src/features/race-viewer/hippodrome-theme';
import { TRACK_WIDTH_METERS } from '../../../src/features/race-viewer/track-dimensions';
import { lightTowerPositions } from '../../../src/features/race-viewer/track-furniture-layout';

/**
 * 10.10.2026 (görsel P1-8): "Pist Kamerası" ışık direğinin arkasında
 * kalıyordu. Kule, liderin pistte bulunabileceği HER şeritte kameranın
 * gerisinde (iç sahanın ortasına daha yakın) olmalı.
 */
describe('iç saha ışık kuleleri', () => {
  it.each(loadHippodromesConfig().hippodromes.map((h) => [h.key, h] as const))('%s: kuleler kamera koridorunun gerisinde', (_key, hippodrome) => {
    const geometry = hippodromeTrackGeometry(hippodrome);
    const towers = lightTowerPositions(geometry);
    expect(towers.length).toBeGreaterThan(0);
    // Lider en iç şeritteyken kamera merkezden en yakın: R - genişlik/2 - ofset.
    const nearestCameraFromCenter = geometry.turnRadiusMeters - TRACK_WIDTH_METERS / 2 - BROADCAST_CAMERA_SIDE_OFFSET_METERS;
    for (const [, z] of towers) {
      expect(Math.abs(z)).toBeGreaterThan(0);
      expect(Math.abs(z)).toBeLessThan(nearestCameraFromCenter);
    }
  });
});
