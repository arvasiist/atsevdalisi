import { describe, expect, it } from 'vitest';
import { loadVfxConfig } from '@at-sevdalisi/game-config';
import { dustSpawnRate } from '../../../src/features/race-viewer/audio-vfx/dust-particle-sim';

const config = loadVfxConfig();
const ref = config.dustSpeedReferenceMps;
const near = config.dustCameraFalloff.nearMeters;

describe('toz: zemin, hız ve kamera uzaklığı (01.10.2026, 3D adım 8)', () => {
  it('kum > sentetik > çim; referans hızda yakında kum = temel oran', () => {
    const at = (surface: 'dirt' | 'synthetic' | 'grass') =>
      dustSpawnRate({ speedMps: ref, surface, cameraDistanceMeters: near }, config);
    expect(at('dirt')).toBeCloseTo(config.dustParticles.spawnRatePerSecond);
    expect(at('dirt')).toBeGreaterThan(at('synthetic'));
    expect(at('synthetic')).toBeGreaterThan(at('grass'));
  });

  it('duran at toz çıkarmaz; hız arttıkça artar (üst sınırlı)', () => {
    expect(
      dustSpawnRate({ speedMps: 0, surface: 'dirt', cameraDistanceMeters: near }, config),
    ).toBe(0);
    const slow = dustSpawnRate(
      { speedMps: ref / 2, surface: 'dirt', cameraDistanceMeters: near },
      config,
    );
    const fast = dustSpawnRate(
      { speedMps: ref, surface: 'dirt', cameraDistanceMeters: near },
      config,
    );
    const absurd = dustSpawnRate(
      { speedMps: ref * 100, surface: 'dirt', cameraDistanceMeters: near },
      config,
    );
    expect(fast).toBeGreaterThan(slow);
    expect(absurd).toBeLessThanOrEqual(fast * 1.5 + 1e-9);
  });

  it('kamera uzaklaştıkça toz seyrelir, minimum oranın altına inmez', () => {
    const close = dustSpawnRate(
      { speedMps: ref, surface: 'dirt', cameraDistanceMeters: 0 },
      config,
    );
    const far = dustSpawnRate(
      { speedMps: ref, surface: 'dirt', cameraDistanceMeters: 10_000 },
      config,
    );
    expect(far).toBeCloseTo(close * config.dustCameraFalloff.minFactor);
  });

  it('her zeminin pist rengi ve toz rengi tanımlı', () => {
    for (const surface of ['dirt', 'synthetic', 'grass'] as const) {
      expect(config.trackColorBySurface[surface]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(config.dustBySurface[surface].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
