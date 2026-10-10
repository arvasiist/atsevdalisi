import { describe, expect, it } from 'vitest';
import { loadCameraConfig } from '@at-sevdalisi/game-config';
import { fitFovToAspect } from '../../../src/features/home-scene/showcase-camera';

/**
 * 10.10.2026 (görsel P1-9) — ahır kamerası dar ekranda yatay kapsamı korur:
 * sabit 42° ile telefonda atın başı kadraj dışında kalıyordu.
 */
const STABLE = loadCameraConfig().stableScene;

describe('ahır kamerası görüş açısı', () => {
  it('geniş ekranda config açısı, dikey telefonda genişler ama tavanı aşmaz', () => {
    expect(fitFovToAspect(STABLE.fov, 1.9, STABLE.referenceAspect, STABLE.maxPortraitFov)).toBe(STABLE.fov);
    const phone = fitFovToAspect(STABLE.fov, 390 / 640, STABLE.referenceAspect, STABLE.maxPortraitFov);
    expect(phone).toBeGreaterThan(STABLE.fov);
    expect(phone).toBeLessThanOrEqual(STABLE.maxPortraitFov);
  });

  it('config anlamlı: tavan açıdan büyük ve 90°nin altında', () => {
    expect(STABLE.fov).toBeGreaterThan(20);
    expect(STABLE.maxPortraitFov).toBeGreaterThan(STABLE.fov);
    expect(STABLE.maxPortraitFov).toBeLessThan(90);
    expect(STABLE.referenceAspect).toBeGreaterThan(1);
  });
});
