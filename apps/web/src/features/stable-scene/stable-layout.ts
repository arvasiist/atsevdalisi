/**
 * PROSEDÜREL AHIR YERLEŞİMİ (08.10.2026) — saf veri + saf fonksiyonlar
 * (three.js İÇE AKTARMAZ; test DOM'suz koşar).
 *
 * Koordinat sözleşmesi manifestle aynıdır (`STABLE_ENVIRONMENT_REQUIRED`):
 * orijin oyuncunun atının bölmesinin zemin ortası, at +X'e bakar. Bölmenin
 * ön yüzü +Z'ye (koridora) açılır; kamera koridordan ya da bölmenin içinden
 * atı YANDAN görür. Koridor X boyunca uzanır, karşısında ikinci bölme sırası
 * vardır; çatı koridorun üstünde beşik çatıdır.
 *
 * Kamera sınırları (`STABLE_ORBIT`) yerleşimle birlikte burada durur: kamera
 * yalnızca bölmenin içinde, koridorda ya da bölme duvarlarının ÜSTÜNDE
 * gezebilir — duvarın içinden geçemez (`stable-layout.spec.ts` kilitler).
 */

export type Vec3 = [number, number, number];

export const STABLE_LAYOUT = {
  /** Oyuncunun bölmesi: x ∈ [-halfLength, halfLength], z ∈ [-halfDepth, halfDepth]. */
  stall: {
    halfLength: 2.4,
    halfDepth: 2.2,
    partitionHeight: 2.4,
    partitionSolidHeight: 1.4,
    frontBoardHeight: 1.0,
    doorHalfWidth: 0.8,
  },
  /** Bölmeler X boyunca bu aralıkla dizilir (bölme genişliği). */
  bayLength: 4.8,
  /** Bölme sırası başına bölme sayısı (oyuncunun bölmesi ortada). */
  baysPerRow: 5,
  aisle: { minZ: 2.2, maxZ: 6.6 },
  oppositeRow: { minZ: 6.6, maxZ: 11.0 },
  barn: {
    minX: -12,
    maxX: 12,
    backZ: -2.2,
    farZ: 11.0,
    eaveHeight: 3.8,
    ridgeHeight: 7.6,
    ridgeZ: 4.4,
  },
  /** Koridorun +X ucundaki açık büyük kapı (dışarısı: padok). */
  door: { minZ: 2.6, maxZ: 6.2, height: 3.6 },
  /** Bölme başına arka duvardaki pencere. */
  window: { halfWidth: 0.8, bottom: 2.6, top: 3.4 },
} as const;

export const STABLE_ORBIT = {
  target: [0, 1.1, 0] as Vec3,
  minDistance: 2.6,
  maxDistance: 5.8,
  minPolar: 0.6,
  maxPolar: 1.45,
  /** Yatay açı +Z'den ölçülür (OrbitControls kuralı); ±sınır koridor tarafıdır. */
  minAzimuth: -0.72,
  maxAzimuth: 0.72,
  autoRotateSpeed: 0.35,
  initial: { distance: 4.6, polar: 1.25, azimuth: 0.45 },
} as const;

/** OrbitControls küresel koordinatı → dünya konumu (θ: +Z'den yatay açı, φ: tepeden açı). */
export function orbitPosition(target: Vec3, distance: number, polar: number, azimuth: number): Vec3 {
  const horizontal = distance * Math.sin(polar);
  return [
    target[0] + horizontal * Math.sin(azimuth),
    target[1] + distance * Math.cos(polar),
    target[2] + horizontal * Math.cos(azimuth),
  ];
}

/** Çatının iç yüzünün z'deki yüksekliği (beşik çatı, mahya koridorun ortasında). */
export function roofHeightAt(z: number): number {
  const { backZ, farZ, eaveHeight, ridgeHeight, ridgeZ } = STABLE_LAYOUT.barn;
  const halfSpan = z <= ridgeZ ? ridgeZ - backZ : farZ - ridgeZ;
  const fromRidge = Math.abs(z - ridgeZ);
  return ridgeHeight - ((ridgeHeight - eaveHeight) * fromRidge) / halfSpan;
}

/**
 * Kamera bu noktada bir duvarın/çatının İÇİNDE değil mi? İzinli bölgeler:
 * oyuncunun bölmesinin içi, koridor ve bölme duvarlarının üstü — hepsi ahırın
 * içinde ve çatının altında. Bölmenin ön yüzü (z = halfDepth) bandında kamera
 * alçak tahtanın üstünde ve bölme genişliğinde olmalıdır.
 */
export function isCameraInOpenSpace(point: Vec3, margin = 0.15): boolean {
  const [x, y, z] = point;
  const { barn, stall, aisle } = STABLE_LAYOUT;
  if (x <= barn.minX + margin || x >= barn.maxX - margin) return false;
  if (z <= barn.backZ + margin || z >= barn.farZ - margin) return false;
  if (y <= margin || y >= roofHeightAt(z) - margin) return false;
  if (y > stall.partitionHeight + margin) return true;
  const inOwnStallWidth = Math.abs(x) < stall.halfLength - margin;
  if (Math.abs(z - stall.halfDepth) <= margin) {
    return inOwnStallWidth && y > stall.frontBoardHeight + margin;
  }
  if (z < stall.halfDepth) return inOwnStallWidth;
  return z > aisle.minZ + margin && z < aisle.maxZ - margin;
}

/** Bir sıradaki bölme merkezlerinin X'leri (oyuncunun bölmesi 0'da). */
export function bayCentersX(): number[] {
  const { baysPerRow, bayLength } = STABLE_LAYOUT;
  const half = Math.floor(baysPerRow / 2);
  return Array.from({ length: baysPerRow }, (_, index) => (index - half) * bayLength);
}

/** Bölmeleri ayıran ara duvarların X'leri (iki uçtaki dış duvarlar hariç). */
export function partitionLinesX(): number[] {
  const centers = bayCentersX();
  const half = STABLE_LAYOUT.bayLength / 2;
  return centers.slice(0, -1).map((center) => center + half);
}

/**
 * Çatı makaslarının X'leri. Oyuncunun bölmesinin üstünde makas YOK: kamera
 * |x| ≲ 3.8 içinde gezer ve ara duvar hizasındaki bir makasın dikmesinin
 * içinden geçerdi — makaslar komşu bölmelerin ortasında ve iki uçtadır.
 */
export function trussLinesX(): number[] {
  const { barn } = STABLE_LAYOUT;
  return [barn.minX + 0.25, ...bayCentersX().filter((x) => x !== 0), barn.maxX - 0.25];
}

/**
 * Asma lambaların ampul konumları: koridorun KARŞI sıraya yakın yarısında —
 * koridor ortasında asılı bir lamba kameranın yörüngesine giriyordu.
 */
export const STABLE_LAMPS: readonly Vec3[] = [-1, 0, 1].map(
  (index): Vec3 => [index * STABLE_LAYOUT.bayLength, 3.35, 6.0],
);

/** Tohumlu PRNG (mulberry32) — sahne her açılışta aynı görünür; `Math.random` YOK. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StrawStrand {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  tilt: number;
  length: number;
  shade: number;
}

/** Bölme zeminine serpiştirilmiş saman telleri (tohumlu, determinist). */
export function strawStrands(count: number, seed: number): StrawStrand[] {
  const random = seededRandom(seed);
  const { halfLength, halfDepth } = STABLE_LAYOUT.stall;
  const strands: StrawStrand[] = [];
  for (let i = 0; i < count; i += 1) {
    strands.push({
      x: (random() * 2 - 1) * (halfLength - 0.12),
      y: 0.015 + random() * 0.05,
      z: (random() * 2 - 1) * (halfDepth - 0.12),
      rotationY: random() * Math.PI,
      tilt: (random() - 0.5) * 0.5,
      length: 0.12 + random() * 0.16,
      shade: random(),
    });
  }
  return strands;
}
