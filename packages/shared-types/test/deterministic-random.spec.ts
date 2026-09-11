import { describe, expect, it } from 'vitest';
import { clamp, createSeededRandom, seededRange } from '../src/deterministic-random';

/**
 * Bu test, brief §18 ve docs/RACE_ENGINE.md §7'deki en kritik kuralı doğrular:
 *
 *   aynı seed + aynı girdi = aynı sonuç
 *
 * Bu kural, Race Engine implementasyonu (FAZ 1) için temel bir sözleşmedir.
 * Bu dosya, "test edilmeden bir sonraki sisteme geçilmez" (brief §91)
 * ilkesi gereği, Race Engine'in üzerine inşa edileceği bu birimin FAZ 0'da
 * zaten doğrulanmış olmasını sağlar.
 *
 * Not: Bu dosya bu depoda `tsx` ile manuel olarak çalıştırılıp doğrulanmıştır
 * (npm registry erişimi kısıtlı olduğundan `vitest` bu ortamda kurulu
 * değildir). `npm install` sonrası `npm test` ile CI'da otomatik çalışacaktır.
 */
describe('createSeededRandom', () => {
  it('aynı seed ile çağrıldığında aynı sayı dizisini üretir (determinism)', () => {
    const rngA = createSeededRandom('race_1:horse_A:seg0:pace');
    const rngB = createSeededRandom('race_1:horse_A:seg0:pace');

    const sequenceA = [rngA(), rngA(), rngA()];
    const sequenceB = [rngB(), rngB(), rngB()];

    expect(sequenceA).toEqual(sequenceB);
  });

  it('farklı seed ile farklı bir sayı dizisi üretir', () => {
    const rngA = createSeededRandom('race_1:horse_A:seg0:pace');
    const rngC = createSeededRandom('race_1:horse_B:seg0:pace');

    expect(rngA()).not.toEqual(rngC());
  });

  it('her zaman [0, 1) aralığında değer üretir', () => {
    const rng = createSeededRandom('any-seed');
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('isim uzayı değiştiğinde (aynı at, farklı amaç) farklı sonuç üretir', () => {
    const rngPace = createSeededRandom('race_1:horse_A:seg0:pace');
    const rngInjury = createSeededRandom('race_1:horse_A:seg0:injury');

    expect(rngPace()).not.toEqual(rngInjury());
  });
});

describe('seededRange', () => {
  it('değeri [min, max) aralığında döndürür', () => {
    const rng = createSeededRandom('range-test');
    for (let i = 0; i < 200; i += 1) {
      const value = seededRange(rng, 10, 20);
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThan(20);
    }
  });
});

describe('clamp', () => {
  it('üst sınırı aşan değeri sınıra çeker', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('alt sınırın altındaki değeri sınıra çeker', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it('aralık içindeki değeri değiştirmez', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });
});
