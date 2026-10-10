import { describe, expect, it } from 'vitest';
import { loadLightingConfig, loadVfxConfig } from '@at-sevdalisi/game-config';
import {
  MOWING_GLSL,
  mowingStripeFactor,
  textureRepeat,
  trackCrossSection,
} from '../../../src/features/race-viewer/ground-detail';

const GROUND = loadVfxConfig().ground;

describe('zemin ayrıntısı (10.10.2026, görsel B2)', () => {
  it('config değerleri anlamlı: doku kareleri pozitif, şerit kontrastı küçük, kenar bandı pist yarısından dar', () => {
    expect(GROUND.grassTileMeters).toBeGreaterThan(0);
    expect(GROUND.trackTileMeters).toBeGreaterThan(0);
    expect(GROUND.mowingStripeMeters).toBeGreaterThan(0);
    expect(GROUND.mowingContrast).toBeGreaterThanOrEqual(0);
    expect(GROUND.mowingContrast).toBeLessThan(0.5);
    expect(GROUND.mowingFadeMeters).toBeGreaterThan(GROUND.mowingStripeMeters);
    expect(GROUND.trackEdgeBandMeters).toBeGreaterThanOrEqual(0);
  });

  it('doku tekrarı = alan / kare; en az 1, bozuk kare 1', () => {
    expect(textureRepeat(2400, 7)).toBeCloseTo(2400 / 7);
    expect(textureRepeat(3, 7)).toBe(1);
    expect(textureRepeat(100, 0)).toBe(1);
  });

  it('biçme şeritleri komşu bantta zıt, merkezden uzakta söner, kontrast 0 ise yok', () => {
    const near = mowingStripeFactor(0, GROUND.mowingStripeMeters * 0.5, GROUND);
    const next = mowingStripeFactor(0, GROUND.mowingStripeMeters * 1.5, GROUND);
    expect(near).toBeCloseTo(1 + GROUND.mowingContrast / 2);
    expect(next).toBeCloseTo(1 - GROUND.mowingContrast / 2);
    // Negatif z de aynı kuralla dönüşümlü (GLSL `mod` ile uyumlu).
    expect(mowingStripeFactor(0, -GROUND.mowingStripeMeters * 0.5, GROUND)).toBeCloseTo(next);
    expect(mowingStripeFactor(GROUND.mowingFadeMeters + 1, 0, GROUND)).toBe(1);
    expect(mowingStripeFactor(0, 4, { ...GROUND, mowingContrast: 0 })).toBe(1);
  });

  it('GLSL aynı formülü taşır (uniform adları + söndürme)', () => {
    for (const token of ['uMowingStripe', 'uMowingContrast', 'uMowingFade', 'smoothstep(uMowingFade * 0.6, uMowingFade']) {
      expect(MOWING_GLSL).toContain(token);
    }
  });

  it('pist kesiti simetrik, tam genişliği kaplar, kenarlar ortadan koyu', () => {
    const section = trackCrossSection(10, GROUND.trackEdgeBandMeters);
    expect(section[0]!.offset).toBe(-10);
    expect(section[section.length - 1]!.offset).toBe(10);
    const middle = section.find((stop) => stop.offset === 0)!;
    expect(section[0]!.shade).toBeLessThan(middle.shade);
    expect(section[section.length - 1]!.shade).toBeLessThan(middle.shade);
    expect(trackCrossSection(10, 0)).toHaveLength(2);
    // Aşırı bant yarı genişliği aşmaz (kesit sırası bozulmaz).
    const offsets = trackCrossSection(1, 5).map((stop) => stop.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it('prosedürel gökyüzü config’ten okunur ve fiziksel aralıkta', () => {
    const sky = loadLightingConfig().proceduralSky;
    expect(sky.turbidity).toBeGreaterThan(0);
    expect(sky.rayleigh).toBeGreaterThan(0);
    expect(sky.mieCoefficient).toBeGreaterThan(0);
    expect(sky.mieDirectionalG).toBeGreaterThan(0);
    expect(sky.mieDirectionalG).toBeLessThan(1);
  });
});
