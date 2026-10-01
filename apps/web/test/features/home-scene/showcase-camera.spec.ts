import { describe, expect, it } from 'vitest';
import { loadCameraConfig } from '@at-sevdalisi/game-config';
import type { PublicHorse } from '@at-sevdalisi/shared-types';
import { pickFeaturedHorse } from '../../../src/features/home-scene/featured-horse';
import {
  evaluateShowcaseCamera,
  fitFovToAspect,
  shotStartTime,
  smoothstep,
  toWorld,
  totalShowcaseDuration,
  type ShowcaseShot,
} from '../../../src/features/home-scene/showcase-camera';

const { shots, blendSeconds } = loadCameraConfig().homeShowcase;

function distance(a: number[], b: number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

describe('homeShowcase config (01.10.2026)', () => {
  it("brief'in altı çekimi tanımlıdır; kimlikler tekil; geçiş süresi çekimin yarısını aşmaz", () => {
    expect(shots.map((shot) => shot.id)).toEqual([
      'wide',
      'horse_medium',
      'horse_closeup',
      'stable',
      'track',
      'jockey',
    ]);
    for (const shot of shots) {
      expect(shot.durationSeconds).toBeGreaterThan(0);
      expect(blendSeconds).toBeLessThanOrEqual(shot.durationSeconds / 2);
      expect(shot.label.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluateShowcaseCamera', () => {
  it('çekimin başında `from` konumunda ve kendi bakış noktasındadır', () => {
    for (let i = 0; i < shots.length; i += 1) {
      const pose = evaluateShowcaseCamera(shotStartTime(shots, i), shots, blendSeconds);
      expect(pose.position).toEqual(shots[i]!.from);
      expect(pose.target).toEqual(shots[i]!.target);
      expect(pose.fov).toBe(shots[i]!.fov);
      expect(pose.shotIndex).toBe(i);
    }
  });

  it('çekim sınırında SIÇRAMA yok: sınırın hemen öncesi ≈ sonraki çekimin başı', () => {
    const epsilon = 1e-4;
    for (let i = 0; i < shots.length; i += 1) {
      const boundary = shotStartTime(shots, i + 1);
      const before = evaluateShowcaseCamera(boundary - epsilon, shots, blendSeconds);
      const after = evaluateShowcaseCamera(boundary + epsilon, shots, blendSeconds);
      expect(distance(before.position, after.position)).toBeLessThan(0.01);
      expect(distance(before.target, after.target)).toBeLessThan(0.01);
      expect(Math.abs(before.fov - after.fov)).toBeLessThan(0.01);
    }
  });

  it('zaman döngüseldir; negatif zaman da geçerlidir', () => {
    const total = totalShowcaseDuration(shots);
    expect(evaluateShowcaseCamera(1.5 + total * 3, shots, blendSeconds)).toEqual(
      evaluateShowcaseCamera(1.5, shots, blendSeconds),
    );
    expect(evaluateShowcaseCamera(-1, shots, blendSeconds).shotIndex).toBe(shots.length - 1);
  });

  it('çekim içinde kamera kayar (dolly): orta an from ile to arasındadır', () => {
    const shot: ShowcaseShot = {
      id: 'a',
      label: 'A',
      durationSeconds: 10,
      from: [0, 0, 0],
      to: [10, 0, 0],
      target: [0, 0, 0],
      fov: 40,
    };
    const pose = evaluateShowcaseCamera(4, [shot], 0);
    expect(pose.position[0]).toBeGreaterThan(0);
    expect(pose.position[0]).toBeLessThan(10);
  });

  it('boş çekim listesi güvenli bir poz döner', () => {
    expect(evaluateShowcaseCamera(3, [], 1).shotIndex).toBe(0);
  });
});

describe('yardımcılar', () => {
  it('smoothstep uçlarda 0/1 ve sınırlı', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(2)).toBe(1);
  });

  it('toWorld: yön 0 iken öteleme; yön π/2 iken RaceScene3D döndürme kuralıyla (+X → +Z)', () => {
    expect(toWorld([1, 2, 3], [10, 0, -5], 0)).toEqual([11, 2, -2]);
    const rotated = toWorld([1, 0, 0], [0, 0, 0], Math.PI / 2);
    expect(rotated[0]).toBeCloseTo(0);
    expect(rotated[2]).toBeCloseTo(1);
  });

  it('pickFeaturedHorse: en kaliteli, eşitlikte en yüksek seviye', () => {
    const horse = (id: string, quality: number, level: number) =>
      ({ id, quality, level }) as PublicHorse;
    expect(pickFeaturedHorse([])).toBeNull();
    expect(pickFeaturedHorse([horse('a', 50, 9), horse('b', 70, 1), horse('c', 70, 4)])?.id).toBe(
      'c',
    );
  });
});

describe('fitFovToAspect (mobil dikey ekran)', () => {
  it('geniş ekranda değişmez; dar ekranda yatay kapsamı korumak için genişler; tavanı aşmaz', () => {
    expect(fitFovToAspect(34, 16 / 9, 16 / 9, 72)).toBe(34);
    expect(fitFovToAspect(34, 2.4, 16 / 9, 72)).toBe(34);
    const portrait = fitFovToAspect(34, 390 / 560, 16 / 9, 72);
    expect(portrait).toBeGreaterThan(34);
    expect(portrait).toBeLessThanOrEqual(72);
    // Yatay yarım açının tanjantı korunur (tavana takılmayan durumda).
    const mild = fitFovToAspect(30, 1.2, 16 / 9, 89);
    const horizontal = (fov: number, aspect: number) => Math.tan((fov * Math.PI) / 360) * aspect;
    expect(horizontal(mild, 1.2)).toBeCloseTo(horizontal(30, 16 / 9), 6);
  });
});
