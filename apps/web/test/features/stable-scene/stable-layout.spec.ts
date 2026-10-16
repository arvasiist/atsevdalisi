import { describe, expect, it } from 'vitest';
import {
  STABLE_LAMPS,
  STABLE_LAYOUT,
  STABLE_ORBIT,
  bayCentersX,
  isCameraInOpenSpace,
  orbitPosition,
  partitionLinesX,
  roofHeightAt,
  strawStrands,
  trussLinesX,
} from '../../../src/features/stable-scene/stable-layout';

/**
 * Prosedürel ahır (08.10.2026): kamera duvarın/çatının içine GİRMEZ. Sahne
 * kamerayı yörünge sınırlarıyla kısıtlar; sınırlar yerleşimle aynı modülde
 * durur ve bu test bütün sınır kutusunu tarar — bölme ya da kamera değişip
 * kamera duvara girerse kırılır.
 */
describe('ahır yerleşimi', () => {
  const { minDistance, maxDistance, minPolar, maxPolar, minAzimuth, maxAzimuth, target } = STABLE_ORBIT;
  const steps = (min: number, max: number, count: number) =>
    Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));

  it('yörüngenin her noktası açık alandadır (bölme içi, koridor ya da duvar üstü)', () => {
    for (const azimuth of steps(minAzimuth, maxAzimuth, 25)) {
      for (const polar of steps(minPolar, maxPolar, 15)) {
        for (const distance of steps(minDistance, maxDistance, 15)) {
          const position = orbitPosition(target, distance, polar, azimuth);
          expect(isCameraInOpenSpace(position), JSON.stringify({ azimuth, polar, distance, position })).toBe(true);
        }
      }
    }
  });

  it('bölmeden koridora geçerken kamera ön tahtanın üstünden ve bölme genişliğinden geçer', () => {
    const { halfDepth, halfLength, frontBoardHeight } = STABLE_LAYOUT.stall;
    // Ön yüzü kestiği yer: yatay doğrultu sabit, z = halfDepth'te x = z·tanθ.
    const worstX = target[0] + (halfDepth - target[2]) * Math.tan(Math.max(Math.abs(minAzimuth), maxAzimuth));
    expect(worstX).toBeLessThan(halfLength - 0.2);
    const lowestCamera = target[1] + minDistance * Math.cos(maxPolar);
    expect(lowestCamera).toBeGreaterThan(frontBoardHeight + 0.2);
  });

  it('lambalar ve çatı makasları kameranın erişemeyeceği yerdedir', () => {
    // Lamba (abajur ~0.3 m): kameranın en uzak mesafesinin dışında.
    for (const lamp of STABLE_LAMPS) {
      const distance = Math.hypot(lamp[0] - target[0], lamp[1] - target[1], lamp[2] - target[2]);
      expect(distance, JSON.stringify(lamp)).toBeGreaterThan(maxDistance + 0.4);
    }
    // Makas (kalınlık 0.16 m): kameranın ulaştığı en büyük |x|'in dışında.
    const maxCameraX = Math.abs(target[0]) + maxDistance * Math.sin(Math.max(Math.abs(minAzimuth), maxAzimuth));
    for (const x of trussLinesX()) {
      expect(Math.abs(x) - 0.1, String(x)).toBeGreaterThan(maxCameraX + 0.15);
    }
  });

  it('başlangıç açısı sınırların içindedir', () => {
    const { distance, polar, azimuth } = STABLE_ORBIT.initial;
    expect(distance).toBeGreaterThanOrEqual(minDistance);
    expect(distance).toBeLessThanOrEqual(maxDistance);
    expect(polar).toBeGreaterThanOrEqual(minPolar);
    expect(polar).toBeLessThanOrEqual(maxPolar);
    expect(azimuth).toBeGreaterThanOrEqual(minAzimuth);
    expect(azimuth).toBeLessThanOrEqual(maxAzimuth);
  });

  it('duvar içi ve çatı üstü noktalar reddedilir (kâhinin kendisi boş değil)', () => {
    const { halfLength } = STABLE_LAYOUT.stall;
    expect(isCameraInOpenSpace([halfLength + 0.4, 1.5, 0])).toBe(false); // yan bölmenin içi, duvar altı
    expect(isCameraInOpenSpace([0, 1.5, STABLE_LAYOUT.barn.backZ - 0.1])).toBe(false); // arka duvar dışı
    expect(isCameraInOpenSpace([0, roofHeightAt(4.4) + 0.1, 4.4])).toBe(false); // çatının üstü
    expect(isCameraInOpenSpace([0, 0.8, STABLE_LAYOUT.stall.halfDepth])).toBe(false); // ön tahtanın içi
    expect(isCameraInOpenSpace([3, 1.6, 4.4])).toBe(true); // koridor
  });

  it('çatı mahyada en yüksek, saçakta saçak yüksekliğindedir', () => {
    const { backZ, farZ, eaveHeight, ridgeHeight, ridgeZ } = STABLE_LAYOUT.barn;
    expect(roofHeightAt(ridgeZ)).toBeCloseTo(ridgeHeight);
    expect(roofHeightAt(backZ)).toBeCloseTo(eaveHeight);
    expect(roofHeightAt(farZ)).toBeCloseTo(eaveHeight);
  });

  it('bölmeler ahıra sığar; oyuncunun bölmesi ortadadır', () => {
    const centers = bayCentersX();
    expect(centers).toContain(0);
    expect(centers).toHaveLength(STABLE_LAYOUT.baysPerRow);
    const half = STABLE_LAYOUT.bayLength / 2;
    expect(Math.min(...centers) - half).toBeGreaterThanOrEqual(STABLE_LAYOUT.barn.minX);
    expect(Math.max(...centers) + half).toBeLessThanOrEqual(STABLE_LAYOUT.barn.maxX);
    expect(partitionLinesX()).toEqual(expect.arrayContaining([-half, half]));
  });

  it('saman telleri determinist ve bölmenin içindedir', () => {
    const first = strawStrands(200, 7);
    expect(strawStrands(200, 7)).toEqual(first);
    expect(strawStrands(200, 8)).not.toEqual(first);
    const { halfLength, halfDepth } = STABLE_LAYOUT.stall;
    for (const strand of first) {
      expect(Math.abs(strand.x)).toBeLessThan(halfLength);
      expect(Math.abs(strand.z)).toBeLessThan(halfDepth);
    }
  });
});
