import { describe, expect, it } from 'vitest';
import {
  CAMERA_MODE_LABELS,
  CAMERA_MODE_ORDER,
  computeCameraPose,
  type CameraContext,
} from '../../../src/features/race-viewer/camera-presets';

const context: CameraContext = {
  leaderPosition: { x: 500, y: 0, z: -60 },
  focusHorsePosition: { x: 300, y: 0, z: -60 },
  trackCenter: { x: 0, y: 0, z: 0 },
  finishLinePosition: { x: 900, y: 0, z: -60 },
};

describe('computeCameraPose', () => {
  it('track modunda pist merkezine bakar ve yüksekten kuşbakışı çeker', () => {
    const pose = computeCameraPose('track', context);
    expect(pose.lookAt).toEqual(context.trackCenter);
    expect(pose.position.y).toBeGreaterThan(0);
  });

  it('jockey modunda odaklanılan atı takip eder', () => {
    const pose = computeCameraPose('jockey', context);
    expect(pose.lookAt).toEqual(context.focusHorsePosition);
    expect(pose.position.z).toBe(context.focusHorsePosition.z);
    expect(pose.position.x).toBeLessThan(context.focusHorsePosition.x);
  });

  it('final_straight modunda bitiş çizgisine bakar', () => {
    const pose = computeCameraPose('final_straight', context);
    expect(pose.lookAt).toEqual(context.finishLinePosition);
  });

  it('photo_finish modunda liderin konumuna bakar, bitiş çizgisi yakınından', () => {
    const pose = computeCameraPose('photo_finish', context);
    expect(pose.lookAt).toEqual(context.leaderPosition);
    expect(pose.position.x).toBe(context.finishLinePosition.x);
  });

  it('her mod için kamera konumu bakılan noktadan farklıdır', () => {
    for (const mode of CAMERA_MODE_ORDER) {
      const pose = computeCameraPose(mode, context);
      const samePoint =
        pose.position.x === pose.lookAt.x && pose.position.y === pose.lookAt.y && pose.position.z === pose.lookAt.z;
      expect(samePoint).toBe(false);
    }
  });

  it('aynı mod + aynı context her zaman aynı sonucu üretir (determinism)', () => {
    const pose1 = computeCameraPose('jockey', context);
    const pose2 = computeCameraPose('jockey', context);
    expect(pose2).toEqual(pose1);
  });

  it('her kamera modu için bir Türkçe etiket tanımlıdır', () => {
    for (const mode of CAMERA_MODE_ORDER) {
      expect(typeof CAMERA_MODE_LABELS[mode]).toBe('string');
      expect(CAMERA_MODE_LABELS[mode]!.length).toBeGreaterThan(0);
    }
  });
});
