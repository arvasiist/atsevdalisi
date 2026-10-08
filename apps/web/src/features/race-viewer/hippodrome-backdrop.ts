/**
 * HİPODROM ARKA PLANI (08.10.2026) — her hipodromun uzaktaki silueti:
 *  - `city` (İstanbul): apartman blokları, birkaç yüksek kule, kubbe + minareli
 *    camiler,
 *  - `steppe` (Ankara): alçak, geniş, toprak renkli tepeler,
 *  - `sea` (İzmir): arka düzlüğün ötesinde körfez + karşı kıyıdaki tepeler,
 *  - `plains` (Adana): ağaç halkasının hemen dışında palmiyeler + uzakta
 *    karsız sıradağ,
 *  - `mountains` (Bursa): arka düzlüğün ötesinde karlı zirveler (Uludağ) +
 *    yeşil eteği.
 *
 * SAF ve tohumlu (`Math.random` yok): aynı hipodrom her açılışta aynı
 * siluetle görünür. Her parçanın TABANI pist merkez çizgisinden en az
 * `BACKDROP_MIN_DISTANCE` uzaktadır — ağaç halkasına, tribüne, piste ve kamera
 * alanına giremez (`hippodromes.spec.ts` bütün hipodromlarda tarar).
 * Dosya/doku YOK; sis uzaklığı soluklaştırır.
 */
import type { HippodromeBackdrop } from '@at-sevdalisi/game-config';
import { getOutwardBoundaryPoint, type StadiumTrackGeometry } from './track-path';

export type BackdropPieceKind = 'box' | 'dome' | 'spire' | 'hill' | 'peak' | 'snow' | 'palm';

export interface BackdropPiece {
  kind: BackdropPieceKind;
  x: number;
  /** Tabanın yüksekliği (kubbe kaidenin üstünde, kar zirvenin üst kısmında). */
  y: number;
  z: number;
  /** Ölçek (metre): genişlik, yükseklik, derinlik. */
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  color: string;
}

export interface BackdropLayout {
  pieces: BackdropPiece[];
  /** Deniz: arka düzlüğün ötesi (z ≥ `minZ`); yoksa `null`. */
  sea: { minZ: number } | null;
}

/**
 * Arka plan parçasının tabanının pist MERKEZ ÇİZGİSİNE en yakın uzaklığı.
 * `TreeLine` ağaçları merkez çizgisinden 120-210 m dışarı diker (taç ~10 m);
 * arka plan bunun ötesinde başlar.
 */
export const BACKDROP_MIN_DISTANCE = 230;
/** Zemin düzlemi ±1200 m (`TrackScenery` `GROUND_SIZE_METERS`/2) — kara parçaları bunun içinde kalır. */
export const BACKDROP_GROUND_HALF = 1200;

const TURN_COUNT = 2;
/**
 * Kıyı çizgisinin arka düzlüğün merkez çizgisine uzaklığı. Kıyıda ağaç yoktur
 * (`treeLineMaxZ`); deniz yakın olmalı ki pist kamerası arka düzlüğe bakarken
 * görünsün (alçak kameradan uzak düz su ince bir çizgiye iner).
 */
export const SEA_SHORE_DISTANCE = 110;
/** Deniz kıyısında ağaçlar yalnızca virajların ön yarısında (z ≤ yarıçap + bu pay). */
const SEA_TREE_MAX_Z_OFFSET = 40;
/** Palmiye yapraklarının gövdeden yatay erişimi (metre, en büyük ölçekte). */
export const PALM_REACH_METERS = 4;

const BUILDING_COLORS = [
  '#cfc8bb',
  '#bdb5a7',
  '#d9d3c8',
  '#a9a194',
  '#929ca7',
  '#c6b69e',
  '#e0dacd',
];
const TOWER_COLORS = ['#8fa3b5', '#a6b4c0', '#7b8c9c'];
const DOME_COLOR = '#7f878e';
const MOSQUE_COLOR = '#e3ddd1';
const STEPPE_COLORS = ['#b39a64', '#a68c59', '#c0a774', '#998454', '#ad9a6a'];
const COAST_HILL_COLORS = ['#7d8a5c', '#8a8d62', '#6f7f55', '#93906a'];
const FOOTHILL_COLORS = ['#5b7a46', '#4f6f3e', '#66804c', '#58744a'];
const ROCK_COLORS = ['#6f6a62', '#7a7368', '#655f58'];
const SNOW_COLOR = '#f2f4f6';
/** Bu yüksekliğin altındaki zirvede kar yok. */
const SNOW_MIN_PEAK_HEIGHT = 280;
const PALM_COLOR = '#3f7a34';

/** Deterministik [0, 1) — anahtar + indeks + tuz. */
function seeded(index: number, salt: number): number {
  let h = (index * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pick<T>(list: readonly T[], value: number): T {
  return list[Math.min(list.length - 1, Math.floor(value * list.length))]!;
}

/** Merkez çizgisinden `distance` metre dışarıda, turun `fraction` noktasındaki konum. */
function ringPoint(
  geometry: StadiumTrackGeometry,
  fraction: number,
  distance: number,
): { x: number; z: number } {
  const p = getOutwardBoundaryPoint(
    fraction * geometry.lapLengthMeters,
    TURN_COUNT,
    geometry,
    distance,
  );
  return { x: p.x, z: p.z };
}

function insideGround(x: number, z: number, margin: number): boolean {
  return (
    Math.abs(x) + margin <= BACKDROP_GROUND_HALF && Math.abs(z) + margin <= BACKDROP_GROUND_HALF
  );
}

function cityPieces(geometry: StadiumTrackGeometry): BackdropPiece[] {
  const pieces: BackdropPiece[] = [];
  const count = 150;
  for (let i = 0; i < count; i += 1) {
    if (seeded(i, 3) < 0.12) continue; // boşluklar (parklar, yollar)
    const fraction = i / count + seeded(i, 5) * 0.004;
    // Taban yarı köşegeni ≤ 30 m → merkez en az MIN + 40.
    const { x, z } = ringPoint(geometry, fraction, BACKDROP_MIN_DISTANCE + 40 + seeded(i, 7) * 260);
    const tower = seeded(i, 11) < 0.07;
    const width = tower ? 22 + seeded(i, 13) * 14 : 18 + seeded(i, 13) * 30;
    const depth = tower ? width : 16 + seeded(i, 17) * 26;
    const height = tower ? 90 + seeded(i, 19) * 70 : 12 + seeded(i, 19) * 34;
    if (!insideGround(x, z, Math.max(width, depth))) continue;
    pieces.push({
      kind: 'box',
      x,
      y: 0,
      z,
      sx: width,
      sy: height,
      sz: depth,
      yaw: seeded(i, 23) * Math.PI,
      color: tower ? pick(TOWER_COLORS, seeded(i, 29)) : pick(BUILDING_COLORS, seeded(i, 29)),
    });
  }
  // Camiler: kaide + kubbe + dört minare; siluette öne çıksınlar diye blokların önünde.
  const mosqueFractions = [0.18, 0.52, 0.83];
  mosqueFractions.forEach((fraction, index) => {
    const radius = 18 + seeded(index, 31) * 8;
    // Kaide yarı köşegeni ~1.63 × yarıçap (≤ 43 m) → merkez MIN + 60.
    const { x, z } = ringPoint(geometry, fraction, BACKDROP_MIN_DISTANCE + 60);
    const baseHeight = radius * 0.9;
    pieces.push({
      kind: 'box',
      x,
      y: 0,
      z,
      sx: radius * 2.3,
      sy: baseHeight,
      sz: radius * 2.3,
      yaw: 0,
      color: MOSQUE_COLOR,
    });
    pieces.push({
      kind: 'dome',
      x,
      y: baseHeight,
      z,
      sx: radius,
      sy: radius * 0.95,
      sz: radius,
      yaw: 0,
      color: DOME_COLOR,
    });
    const corner = radius * 1.35;
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      pieces.push({
        kind: 'spire',
        x: x + dx * corner,
        y: 0,
        z: z + dz * corner,
        sx: 1.6,
        sy: 52 + seeded(index, 37) * 16,
        sz: 1.6,
        yaw: 0,
        color: MOSQUE_COLOR,
      });
    }
  });
  return pieces;
}

function hillRing(
  geometry: StadiumTrackGeometry,
  options: {
    count: number;
    /** Tepe eteğinin `BACKDROP_MIN_DISTANCE`ın ötesindeki en küçük payı. */
    clearance: number;
    spread: number;
    width: [number, number];
    height: [number, number];
    colors: readonly string[];
    salt: number;
    keep?: (x: number, z: number) => boolean;
  },
): BackdropPiece[] {
  const pieces: BackdropPiece[] = [];
  for (let i = 0; i < options.count; i += 1) {
    const fraction = (i + seeded(i, options.salt) * 0.6) / options.count;
    const width =
      options.width[0] + seeded(i, options.salt + 2) * (options.width[1] - options.width[0]);
    const height =
      options.height[0] + seeded(i, options.salt + 3) * (options.height[1] - options.height[0]);
    const sx = width / 2;
    const sz = sx * (0.6 + seeded(i, options.salt + 4) * 0.5);
    // Merkez, etek (en geniş yarıçap) ağaç halkasına girmeyecek kadar dışarıda.
    const distance =
      BACKDROP_MIN_DISTANCE +
      options.clearance +
      seeded(i, options.salt + 1) * options.spread +
      Math.max(sx, sz);
    const { x, z } = ringPoint(geometry, fraction, distance);
    if (!insideGround(x, z, Math.max(sx, sz))) continue;
    if (options.keep && !options.keep(x, z)) continue;
    pieces.push({
      kind: 'hill',
      x,
      y: 0,
      z,
      sx,
      sy: height,
      sz,
      yaw: seeded(i, options.salt + 5) * Math.PI,
      color: pick(options.colors, seeded(i, options.salt + 6)),
    });
  }
  return pieces;
}

/** Arka düzlüğün (+z) ötesinde düz bir sıra (körfezin karşı kıyısı); `snow` ise zirveler karlı. */
function mountainRange(
  geometry: StadiumTrackGeometry,
  options: {
    count: number;
    z: [number, number];
    height: [number, number];
    radius: [number, number];
    snow: boolean;
    salt: number;
  },
): BackdropPiece[] {
  const pieces: BackdropPiece[] = [];
  const halfLength = geometry.straightLengthMeters / 2 + geometry.turnRadiusMeters + 300;
  for (let i = 0; i < options.count; i += 1) {
    const x =
      -halfLength +
      ((i + 0.5) / options.count) * halfLength * 2 +
      (seeded(i, options.salt) - 0.5) * 120;
    const z = options.z[0] + seeded(i, options.salt + 1) * (options.z[1] - options.z[0]);
    const height =
      options.height[0] + seeded(i, options.salt + 2) * (options.height[1] - options.height[0]);
    const radius =
      options.radius[0] + seeded(i, options.salt + 3) * (options.radius[1] - options.radius[0]);
    pushPeak(pieces, {
      x,
      z,
      height,
      radius,
      yaw: seeded(i, options.salt + 4) * Math.PI * 2,
      snow: options.snow,
      colorValue: seeded(i, options.salt + 5),
    });
  }
  return pieces;
}

/** Zirve + (karlıysa ve yeterince yüksekse) kar örtüsü. */
function pushPeak(
  pieces: BackdropPiece[],
  peak: {
    x: number;
    z: number;
    height: number;
    radius: number;
    yaw: number;
    snow: boolean;
    colorValue: number;
  },
): void {
  const { x, z, height, radius, yaw } = peak;
  pieces.push({
    kind: 'peak',
    x,
    y: 0,
    z,
    sx: radius,
    sy: height,
    sz: radius * 0.85,
    yaw,
    color: pick(ROCK_COLORS, peak.colorValue),
  });
  if (peak.snow && height > SNOW_MIN_PEAK_HEIGHT) {
    // Kar örtüsü zirvenin üst %34'ü: koninin benzer üst parçası, örtme payı %4.
    const share = 0.34;
    pieces.push({
      kind: 'snow',
      x,
      y: height * (1 - share),
      z,
      sx: radius * share * 1.04,
      sy: height * share * 1.01,
      sz: radius * 0.85 * share * 1.04,
      yaw,
      color: SNOW_COLOR,
    });
  }
}

/**
 * Pistin çevresinde uzak bir dağ halkası — yayın kamerası tribüne, jokey
 * kamerası pist boyunca baktığı için zirveler her yönde görünmeli (tribünün
 * arkasındakileri tribün zaten örter). Taban yarıçapı merkez uzaklığından
 * küçüktür → etek ağaç halkasına girmez.
 */
function peakRing(
  geometry: StadiumTrackGeometry,
  options: {
    count: number;
    distance: [number, number];
    height: [number, number];
    radius: [number, number];
    snow: boolean;
    salt: number;
  },
): BackdropPiece[] {
  const pieces: BackdropPiece[] = [];
  for (let i = 0; i < options.count; i += 1) {
    const radius =
      options.radius[0] + seeded(i, options.salt + 3) * (options.radius[1] - options.radius[0]);
    const distance = Math.max(
      BACKDROP_MIN_DISTANCE + radius,
      options.distance[0] +
        seeded(i, options.salt + 1) * (options.distance[1] - options.distance[0]),
    );
    const { x, z } = ringPoint(
      geometry,
      (i + seeded(i, options.salt) * 0.7) / options.count,
      distance,
    );
    pushPeak(pieces, {
      x,
      z,
      height:
        options.height[0] + seeded(i, options.salt + 2) * (options.height[1] - options.height[0]),
      radius,
      yaw: seeded(i, options.salt + 4) * Math.PI * 2,
      snow: options.snow,
      colorValue: seeded(i, options.salt + 5),
    });
  }
  return pieces;
}

function palmRing(geometry: StadiumTrackGeometry): BackdropPiece[] {
  const pieces: BackdropPiece[] = [];
  const count = 150;
  for (let i = 0; i < count; i += 1) {
    if (seeded(i, 41) < 0.15) continue;
    const fraction = (i + seeded(i, 43) * 0.8) / count;
    const { x, z } = ringPoint(
      geometry,
      fraction,
      BACKDROP_MIN_DISTANCE + PALM_REACH_METERS + 4 + seeded(i, 47) * 65,
    );
    pieces.push({
      kind: 'palm',
      x,
      y: 0,
      z,
      sx: 1,
      sy: 9 + seeded(i, 53) * 7,
      sz: 1,
      yaw: seeded(i, 59) * Math.PI * 2,
      color: PALM_COLOR,
    });
  }
  return pieces;
}

/**
 * Ağaç halkasının arka (+z) sınırı: kıyıda ağaç dikilmez, yoksa alçak kamera
 * denizi hiç göremez (düz deniz ağaçların ardında kalır). `null` = sınır yok.
 */
export function treeLineMaxZ(
  backdrop: HippodromeBackdrop,
  geometry: StadiumTrackGeometry,
): number | null {
  return backdrop === 'sea' ? geometry.turnRadiusMeters + SEA_TREE_MAX_Z_OFFSET : null;
}

export function computeBackdropLayout(
  backdrop: HippodromeBackdrop,
  geometry: StadiumTrackGeometry,
): BackdropLayout {
  if (geometry.lapLengthMeters <= 0) return { pieces: [], sea: null };
  switch (backdrop) {
    case 'city':
      return { pieces: cityPieces(geometry), sea: null };
    case 'steppe':
      return {
        pieces: [
          ...hillRing(geometry, {
            count: 34,
            clearance: 20,
            spread: 200,
            width: [220, 420],
            height: [26, 70],
            colors: STEPPE_COLORS,
            salt: 61,
          }),
          ...hillRing(geometry, {
            count: 18,
            clearance: 260,
            spread: 160,
            width: [320, 520],
            height: [70, 130],
            colors: STEPPE_COLORS,
            salt: 71,
          }),
        ],
        sea: null,
      };
    case 'sea': {
      const minZ = geometry.turnRadiusMeters + SEA_SHORE_DISTANCE;
      return {
        pieces: [
          // Kara tarafında alçak tepeler; deniz kıyısına taşmaz.
          ...hillRing(geometry, {
            count: 30,
            clearance: 20,
            spread: 200,
            width: [200, 380],
            height: [30, 80],
            colors: COAST_HILL_COLORS,
            salt: 81,
            keep: (_x, z) => z < minZ - 60,
          }),
          // Körfezin karşı kıyısı (deniz düzleminin üstünde, zemin sınırının ötesi).
          ...mountainRange(geometry, {
            count: 9,
            z: [1350, 1600],
            height: [90, 170],
            radius: [260, 420],
            snow: false,
            salt: 91,
          }).map((piece) => ({
            ...piece,
            color: pick(COAST_HILL_COLORS, seeded(Math.round(piece.x), 97)),
          })),
        ],
        sea: { minZ },
      };
    }
    case 'plains':
      return {
        pieces: [
          ...palmRing(geometry),
          // Uzakta Toroslar: karsız, sise yarı gömülü.
          ...peakRing(geometry, {
            count: 14,
            distance: [1150, 1400],
            height: [140, 240],
            radius: [300, 440],
            snow: false,
            salt: 101,
          }),
        ],
        sea: null,
      };
    case 'mountains':
      return {
        pieces: [
          ...hillRing(geometry, {
            count: 26,
            clearance: 10,
            spread: 200,
            width: [200, 360],
            height: [40, 90],
            colors: FOOTHILL_COLORS,
            salt: 111,
          }),
          // Uludağ: dört yanda karlı zirveler.
          ...peakRing(geometry, {
            count: 18,
            distance: [1150, 1450],
            height: [320, 540],
            radius: [360, 520],
            snow: true,
            salt: 121,
          }),
        ],
        sea: null,
      };
    default:
      return { pieces: [], sea: null };
  }
}
