import { describe, expect, it } from 'vitest';
import { loadAtmosphereConfig, loadCameraConfig } from '@at-sevdalisi/game-config';
import {
  computeCrowdExcitement,
  keepSpectator,
  spectatorArmRaise,
  spectatorLift,
} from '../../../src/features/race-viewer/race-atmosphere';

const config = loadAtmosphereConfig();
const finalStretch = loadCameraConfig().finalStretchRemainingMeters;
const base = {
  raceDistanceMeters: 2000,
  finalStretchRemainingMeters: finalStretch,
  isRaceFinished: false,
};

describe('computeCrowdExcitement (01.10.2026)', () => {
  it('yarış öncesi sakin, koşuda orta, final düzlüğünde artar, bitişte zirve', () => {
    expect(computeCrowdExcitement({ ...base, leaderPositionMeters: 0 }, config)).toBe(
      config.crowd.preRaceExcitement,
    );
    expect(computeCrowdExcitement({ ...base, leaderPositionMeters: 500 }, config)).toBe(
      config.crowd.raceExcitement,
    );
    const entering = computeCrowdExcitement(
      { ...base, leaderPositionMeters: 2000 - finalStretch + 1 },
      config,
    );
    const nearLine = computeCrowdExcitement({ ...base, leaderPositionMeters: 1990 }, config);
    expect(entering).toBeGreaterThanOrEqual(config.crowd.raceExcitement);
    expect(nearLine).toBeGreaterThan(entering);
    expect(nearLine).toBeLessThanOrEqual(config.crowd.finalStretchExcitement);
    expect(
      computeCrowdExcitement(
        { ...base, leaderPositionMeters: 2000, isRaceFinished: true, secondsSinceFinish: 0 },
        config,
      ),
    ).toBe(config.crowd.finishExcitement);
  });

  it('bitiş coşkusu `finishCelebrationSeconds` sonunda yarış seviyesine iner', () => {
    const after = computeCrowdExcitement(
      {
        ...base,
        leaderPositionMeters: 2000,
        isRaceFinished: true,
        secondsSinceFinish: config.crowd.finishCelebrationSeconds + 1,
      },
      config,
    );
    expect(after).toBeCloseTo(config.crowd.raceExcitement);
  });

  it('final eşiği kamera config ile aynı değerdir (iki eşik ayrışmasın)', () => {
    const justBefore = computeCrowdExcitement(
      { ...base, leaderPositionMeters: 2000 - finalStretch - 1 },
      config,
    );
    expect(justBefore).toBe(config.crowd.raceExcitement);
  });
});

describe('tribün hareketi', () => {
  it('sakin kalabalık oturur; eşiğin üstünde ayağa kalkar; zıplama heyecanla büyür', () => {
    expect(spectatorLift(0, 0.3, 1.2, config)).toBe(0);
    const calm = Math.max(
      ...Array.from({ length: 50 }, (_, i) => spectatorLift(0.3, 0.1, i * 0.1, config)),
    );
    const wild = Math.max(
      ...Array.from({ length: 50 }, (_, i) => spectatorLift(1, 0.1, i * 0.1, config)),
    );
    expect(wild).toBeGreaterThan(calm);
    expect(spectatorLift(config.crowd.standUpThreshold, 0, 0, config)).toBeGreaterThan(0);
  });

  it('yoğunluk oranı koltukları deterministik seyreltir', () => {
    const seeds = Array.from({ length: 1000 }, (_, i) => (i * 0.6180339887) % 1);
    const kept = seeds.filter((seed) => keepSpectator(seed, config.crowd.densityByTier.low)).length;
    expect(kept / 1000).toBeCloseTo(config.crowd.densityByTier.low, 1);
    expect(seeds.every((seed) => keepSpectator(seed, 1))).toBe(true);
  });
});

describe('spectatorArmRaise (08.10.2026)', () => {
  const atmosphere = loadAtmosphereConfig();
  const { standUpThreshold, armRaiseShare, maxArmRaiseRadians } = atmosphere.crowd;

  it('ayağa kalkılmayan heyecanda kimse kol kaldırmaz', () => {
    expect(spectatorArmRaise(standUpThreshold - 0.01, 0.1, 3, atmosphere)).toBe(0);
  });

  it('coşkuda seyircilerin yalnızca bir kısmı kol kaldırır; açı sınırı aşılmaz', () => {
    expect(spectatorArmRaise(1, armRaiseShare + 0.01, 3, atmosphere)).toBe(0);
    for (let t = 0; t < 5; t += 0.37) {
      const angle = spectatorArmRaise(1, armRaiseShare / 2, t, atmosphere);
      expect(angle).toBeGreaterThan(0);
      expect(angle).toBeLessThanOrEqual(maxArmRaiseRadians);
    }
  });
});

