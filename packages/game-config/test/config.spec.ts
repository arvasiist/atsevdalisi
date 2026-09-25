import { describe, expect, it } from 'vitest';
import {
  loadAudioConfig,
  loadCameraConfig,
  loadEconomyConfig,
  loadGeneticsConfig,
  loadHorseGrowthConfig,
  loadProgressionConfig,
  loadRaceConfig,
  loadTrainingConfig,
  loadVfxConfig,
  loadWeatherConfig,
} from '../src/index';

/**
 * FAZ 0 kapsamında config sisteminin (brief §52) doğru yüklendiğini ve
 * temel tutarlılık kurallarına uyduğunu doğrular. Bu, gelecekte config
 * dosyalarında yapılacak bir yazım hatasının (örn. ağırlıkların toplamının
 * 1'i aşması) erkenden yakalanmasını sağlar.
 */
describe('loadRaceConfig', () => {
  // AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — `version` alanı sessizce
  // silinir/boş bırakılırsa `races.config_version` sütunu (migration 0021)
  // anlamsız bir değerle (boş string) doldurulur ve replay/audit için
  // hangi denge sürümünün kullanıldığı takip edilemez hale gelir; bu test
  // o regresyonu erkenden yakalar.
  it('version alanı boş olmayan bir string olmalı', () => {
    const config = loadRaceConfig();
    expect(typeof config.version).toBe('string');
    expect(config.version.length).toBeGreaterThan(0);
  });

  it('baseAbilityWeights toplamı yaklaşık 1.0 olmalı', () => {
    const config = loadRaceConfig();
    const sum = Object.values(config.baseAbilityWeights).reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('randomFactorRange iki elemanlı ve min < max olmalı', () => {
    const config = loadRaceConfig();
    expect(config.randomFactorRange).toHaveLength(2);
    expect(config.randomFactorRange[0]).toBeLessThan(config.randomFactorRange[1]);
  });

  it('distance.shortMaxMeters < middleMaxMeters olmalı', () => {
    const config = loadRaceConfig();
    expect(config.distance.shortMaxMeters).toBeLessThan(config.distance.middleMaxMeters);
  });
});

describe('loadTrainingConfig', () => {
  it('tüm antrenman türleri için config tanımlı olmalı', () => {
    const config = loadTrainingConfig();
    const expectedTypes = ['speed', 'sprint', 'stamina', 'start', 'cornering', 'tempo', 'rest'];
    for (const type of expectedTypes) {
      expect(config.types).toHaveProperty(type);
    }
  });

  it('diminishingExponent 0 ile 1 arasında olmalı', () => {
    const config = loadTrainingConfig();
    expect(config.diminishingExponent).toBeGreaterThan(0);
    expect(config.diminishingExponent).toBeLessThanOrEqual(1);
  });
});

describe('loadGeneticsConfig', () => {
  it('inheritanceRange toplamı 1 civarında olacak şekilde simetrik olmalı', () => {
    const config = loadGeneticsConfig();
    const [min, max] = config.inheritanceRange;
    expect(min + max).toBeCloseTo(1.0, 5);
  });

  it('maxPotentialGainOverParents 1.0 üzerinde olmalı (aksi halde kalıtım hiç gelişemez)', () => {
    const config = loadGeneticsConfig();
    expect(config.maxPotentialGainOverParents).toBeGreaterThan(1.0);
  });
});

describe('loadEconomyConfig', () => {
  it('marketValueWeights toplamı yaklaşık 1.0 olmalı', () => {
    const config = loadEconomyConfig();
    const sum = Object.values(config.marketValueWeights).reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('gemShopWhitelist boş olmamalı (brief §67 - gems ile satılabilecek itemler açıkça listelenmeli)', () => {
    const config = loadEconomyConfig();
    expect(config.gemShopWhitelist.length).toBeGreaterThan(0);
  });
});

describe('loadWeatherConfig', () => {
  it('tüm kombinasyonlar 0 ile 1.2 arasında çarpan değerine sahip olmalı', () => {
    const config = loadWeatherConfig();
    for (const effect of Object.values(config.combinations)) {
      expect(effect.surfaceModifier).toBeGreaterThan(0);
      expect(effect.surfaceModifier).toBeLessThanOrEqual(1.2);
      expect(effect.weatherModifier).toBeGreaterThan(0);
      expect(effect.weatherModifier).toBeLessThanOrEqual(1.2);
    }
  });
});

describe('loadHorseGrowthConfig', () => {
  it('evreler yaş sırasına göre kesintisiz olmalı', () => {
    const config = loadHorseGrowthConfig();
    for (let i = 1; i < config.stages.length; i += 1) {
      expect(config.stages[i].minAgeMonths).toBe(config.stages[i - 1].maxAgeMonths);
    }
  });
});

describe('loadProgressionConfig', () => {
  it('unlock seviyeleri artan sırada olmalı ve maxLevel aşılmamalı', () => {
    const config = loadProgressionConfig();
    for (let i = 1; i < config.unlocks.length; i += 1) {
      expect(config.unlocks[i].level).toBeGreaterThan(config.unlocks[i - 1].level);
    }
    for (const unlock of config.unlocks) {
      expect(unlock.level).toBeLessThanOrEqual(config.maxLevel);
    }
  });
});

/**
 * Faz 6 "Config ayrımı" (bu turda EKLENDİ) — `apps/web`'in race-viewer
 * özelliğinin (`camera-director.ts`/`photo-finish.ts`/`dust-particle-sim.ts`/
 * `audio-manager.ts`) daha önce kod içinde gömülü olan sabitlerinin
 * config karşılığı.
 */
describe('loadCameraConfig', () => {
  it('version alanı boş olmayan bir string olmalı', () => {
    const config = loadCameraConfig();
    expect(typeof config.version).toBe('string');
    expect(config.version.length).toBeGreaterThan(0);
  });

  it('startPhaseMeters, finalStretchRemainingMeters\'tan küçük olmalı (aksi halde start/final_stretch event\'leri çakışır)', () => {
    const config = loadCameraConfig();
    expect(config.startPhaseMeters).toBeLessThan(config.finalStretchRemainingMeters);
  });

  it('photoFinish.slowMotionMinFactor (0, 1] aralığında olmalı (0 = tamamen dur, brief bunu istemiyor)', () => {
    const config = loadCameraConfig();
    expect(config.photoFinish.slowMotionMinFactor).toBeGreaterThan(0);
    expect(config.photoFinish.slowMotionMinFactor).toBeLessThanOrEqual(1);
  });

  it('photoFinish.closeFinishThresholdMs pozitif olmalı', () => {
    const config = loadCameraConfig();
    expect(config.photoFinish.closeFinishThresholdMs).toBeGreaterThan(0);
  });
});

describe('loadVfxConfig', () => {
  it('dustParticles.minLifetimeMs, maxLifetimeMs\'ten küçük olmalı', () => {
    const config = loadVfxConfig();
    expect(config.dustParticles.minLifetimeMs).toBeLessThan(config.dustParticles.maxLifetimeMs);
  });

  it('dustParticles.color geçerli bir hex renk formatında olmalı', () => {
    const config = loadVfxConfig();
    expect(config.dustParticles.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('dustParticles.maxActiveParticles pozitif bir tam sayı olmalı', () => {
    const config = loadVfxConfig();
    expect(config.dustParticles.maxActiveParticles).toBeGreaterThan(0);
    expect(Number.isInteger(config.dustParticles.maxActiveParticles)).toBe(true);
  });
});

describe('loadAudioConfig', () => {
  it('hoofbeat.baseVolume + maxExtraVolume 1\'i aşmamalı (aksi halde hacim taşar)', () => {
    const config = loadAudioConfig();
    expect(config.hoofbeat.baseVolume + config.hoofbeat.maxExtraVolume).toBeLessThanOrEqual(1);
  });

  it('tüm hacim değerleri [0, 1] aralığında olmalı', () => {
    const config = loadAudioConfig();
    expect(config.raceMusicVolume).toBeGreaterThanOrEqual(0);
    expect(config.raceMusicVolume).toBeLessThanOrEqual(1);
    expect(config.finishFanfareVolume).toBeGreaterThanOrEqual(0);
    expect(config.finishFanfareVolume).toBeLessThanOrEqual(1);
  });

  it('finalStretchMusicDuckFactor 1\'den küçük olmalı (aksi halde "düşürme" hiçbir şeyi düşürmez)', () => {
    const config = loadAudioConfig();
    expect(config.finalStretchMusicDuckFactor).toBeLessThan(1);
  });
});
