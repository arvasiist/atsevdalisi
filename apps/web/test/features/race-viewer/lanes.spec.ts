import { describe, expect, it } from 'vitest';
import { laneOffsetMeters, lanePosition, renderedPositionOf } from '../../../src/features/race-viewer/lanes';
import { computeCameraPose } from '../../../src/features/race-viewer/camera-presets';
import { loadCameraConfig } from '@at-sevdalisi/game-config';

/**
 * 08.10.2026 — Jokey Kamerası düzeltmesi. Sahne atı şeride kaydırılmış
 * konumda çizer; kamera ESKİDEN merkez çizgiyi izliyordu ve takip edilen at
 * kadrajın kenarına düşüyordu. Artık ikisi aynı fonksiyondan geçer.
 */
describe('şeritler + jokey kamerası', () => {
  const horses = [
    { horseId: 'a', x: 10, z: 0, headingRadians: 0 },
    { horseId: 'b', x: 10, z: 0, headingRadians: 0 },
    { horseId: 'c', x: 10, z: 0, headingRadians: 0 },
  ];

  it('şeritler simetrik ve kamera çizilen konumu kullanır', () => {
    expect(laneOffsetMeters(0, 3)).toBeCloseTo(-laneOffsetMeters(2, 3));
    expect(laneOffsetMeters(1, 3)).toBe(0);
    const drawn = renderedPositionOf(horses, 'a')!;
    expect(drawn).toEqual({ ...lanePosition(horses[0]!, 0, 3), headingRadians: 0 });
    // İlk at merkez çizgide DEĞİL — eskiden kamera tam burada yanılıyordu.
    expect(drawn.z).not.toBe(0);
    expect(renderedPositionOf(horses, 'yok')).toBeNull();
    expect(renderedPositionOf(horses, undefined)).toBeNull();
  });

  it('jokey kamerası atın arkasında ve üstünde, atın İLERİSİNE bakar; takip sıkı', () => {
    const config = loadCameraConfig().jockeyCamera;
    const focus = { x: 10, y: 1, z: 2 };
    const pose = computeCameraPose('jockey', {
      leaderPosition: focus,
      focusHorsePosition: focus,
      trackCenter: { x: 0, y: 0, z: 0 },
      finishLinePosition: { x: 0, y: 0, z: 0 },
      focusHeadingRadians: 0,
    });
    expect(pose.position.x).toBeCloseTo(focus.x - config.backMeters);
    expect(pose.position.z).toBeCloseTo(focus.z);
    expect(pose.position.y).toBe(config.heightMeters);
    expect(pose.lookAt.x).toBeCloseTo(focus.x + config.lookAheadMeters);
    expect(pose.lookAt.z).toBeCloseTo(focus.z);
    expect(pose.followSeconds).toBe(config.followSeconds);
    expect(config.followSeconds).toBeLessThan(loadCameraConfig().defaultFollowSeconds);
  });
});
