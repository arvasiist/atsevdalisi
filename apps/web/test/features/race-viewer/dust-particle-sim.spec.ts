import { describe, expect, it } from 'vitest';
import {
  advanceDustParticle,
  getDustParticleOpacity,
  isDustParticleExpired,
  spawnDustParticle,
} from '../../../src/features/race-viewer/audio-vfx/dust-particle-sim';

describe('spawnDustParticle', () => {
  it('doğum anında konum origin ile aynıdır', () => {
    const particle = spawnDustParticle(10, 20, 'h1:0');
    expect(particle.x).toBe(10);
    expect(particle.z).toBe(20);
    expect(particle.y).toBe(0);
    expect(particle.ageMs).toBe(0);
  });

  it('aynı seed her zaman aynı lifetimeMs\'i üretir (determinizm)', () => {
    const a = spawnDustParticle(0, 0, 'h1:5');
    const b = spawnDustParticle(0, 0, 'h1:5');
    expect(a).toEqual(b);
  });

  it('farklı seed farklı bir lifetimeMs üretebilir', () => {
    const a = spawnDustParticle(0, 0, 'h1:0');
    const b = spawnDustParticle(0, 0, 'h1:1');
    // Kesin farklı olacağının MATEMATİKSEL garantisi yok (teorik çakışma
    // mümkün) ama pratikte mulberry32 + farklı seed için neredeyse KESİN
    // farklıdır — bu test rastgele bir çakışmaya karşı KIRILGAN değildir
    // çünkü sadece "aynı fonksiyon çağrısının determinizmi" (yukarıdaki
        // önceki test) asıl garanti edilen özelliktir; burada sadece seed'in
    // GERÇEKTEN KULLANILDIĞINI (sabit bir değer dönmediğini) doğruluyoruz.
    expect(a.lifetimeMs).not.toBe(b.lifetimeMs);
  });

  it('lifetimeMs her zaman [400, 900) aralığındadır', () => {
    for (let i = 0; i < 20; i += 1) {
      const particle = spawnDustParticle(0, 0, `seed-${i}`);
      expect(particle.lifetimeMs).toBeGreaterThanOrEqual(400);
      expect(particle.lifetimeMs).toBeLessThan(900);
    }
  });
});

describe('advanceDustParticle', () => {
  it('yaşı deltaMs kadar ilerletir', () => {
    const particle = spawnDustParticle(0, 0, 'h1:0');
    const advanced = advanceDustParticle(particle, 100, 'h1:0');
    expect(advanced.ageMs).toBe(100);
  });

  it('yükseklik zamanla artar', () => {
    const particle = spawnDustParticle(0, 0, 'h1:0');
    const advanced = advanceDustParticle(particle, 500, 'h1:0');
    expect(advanced.y).toBeCloseTo(0.3, 6); // 0.5s * 0.6 m/s
  });

  it('aynı seed ile tekrar tekrar ilerletildiğinde yatay konum origin\'den bir yöne doğru KAYAR (sabit kalmaz)', () => {
    const particle = spawnDustParticle(5, 5, 'h1:0');
    const advanced = advanceDustParticle(particle, particle.lifetimeMs, 'h1:0');
    const movedHorizontally = advanced.x !== 5 || advanced.z !== 5;
    expect(movedHorizontally).toBe(true);
  });

  it('farklı seed ile ilerletmek FARKLI bir yatay konum üretebilir (yön seed\'e bağlıdır)', () => {
    const particle = spawnDustParticle(5, 5, 'h1:0');
    const advancedA = advanceDustParticle(particle, particle.lifetimeMs, 'h1:0');
    const advancedB = advanceDustParticle(particle, particle.lifetimeMs, 'h1:1');
    const differs = advancedA.x !== advancedB.x || advancedA.z !== advancedB.z;
    expect(differs).toBe(true);
  });

  it('mevcut alanları (originX/originZ/lifetimeMs) korur', () => {
    const particle = spawnDustParticle(3, 4, 'h1:0');
    const advanced = advanceDustParticle(particle, 50, 'h1:0');
    expect(advanced.originX).toBe(3);
    expect(advanced.originZ).toBe(4);
    expect(advanced.lifetimeMs).toBe(particle.lifetimeMs);
  });
});

describe('isDustParticleExpired', () => {
  it('yaş lifetime\'ın altındaysa false döner', () => {
    const particle = spawnDustParticle(0, 0, 'h1:0');
    expect(isDustParticleExpired(particle)).toBe(false);
  });

  it('yaş lifetime\'a ulaştıysa veya geçtiyse true döner', () => {
    const particle = spawnDustParticle(0, 0, 'h1:0');
    const expired = advanceDustParticle(particle, particle.lifetimeMs, 'h1:0');
    expect(isDustParticleExpired(expired)).toBe(true);
    const wayExpired = advanceDustParticle(particle, particle.lifetimeMs + 1000, 'h1:0');
    expect(isDustParticleExpired(wayExpired)).toBe(true);
  });
});

describe('getDustParticleOpacity', () => {
  it('yeni doğan bir parçacık için 1 (tam opak) döner', () => {
    const particle = spawnDustParticle(0, 0, 'h1:0');
    expect(getDustParticleOpacity(particle)).toBe(1);
  });

  it('ömrünü tamamlamış bir parçacık için 0 (tam saydam) döner', () => {
    const particle = spawnDustParticle(0, 0, 'h1:0');
    const expired = advanceDustParticle(particle, particle.lifetimeMs, 'h1:0');
    expect(getDustParticleOpacity(expired)).toBeCloseTo(0, 6);
  });

  it('yarı ömründe yaklaşık 0.5 döner', () => {
    const particle = spawnDustParticle(0, 0, 'h1:0');
    const halfway = advanceDustParticle(particle, particle.lifetimeMs / 2, 'h1:0');
    expect(getDustParticleOpacity(halfway)).toBeCloseTo(0.5, 6);
  });

  it('ömrü aşan bir yaş için negatif olmayan bir değer döner (clamp)', () => {
    const particle = spawnDustParticle(0, 0, 'h1:0');
    const wayExpired = advanceDustParticle(particle, particle.lifetimeMs * 3, 'h1:0');
    expect(getDustParticleOpacity(wayExpired)).toBeGreaterThanOrEqual(0);
  });
});
