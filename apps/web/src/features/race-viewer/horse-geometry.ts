/**
 * PROSEDÜREL AT + JOKEY GEOMETRİSİ (10.10.2026, görsel gerçekçilik C1).
 *
 * Eski model kapsül gövde + tek parça silindir bacaktı. Burada gövde, boyun,
 * baş ve kuyruk anatomik kesitlerden "loft" ile kurulur (yan düzlemde bir
 * omurga eğrisi + her istasyonda elips kesit, Catmull-Rom ile yumuşatılır);
 * bacaklar omuz/kalça + diz/sekiz eklemlidir. Eyer, kolan, yular, dizgin ve
 * kısa üzengide eğilmiş jokey eklidir.
 *
 * ⚠️ PLACEHOLDER: bu hâlâ prosedürel bir modeldir — gerçek iskeletli at
 * (`models/horse.glb`) gelince `HorseAvatar3D` ona geçer; rozet durur.
 *
 * Geometriler BÜTÜN atlar arasında PAYLAŞILIR (şekil aynı, yalnızca malzeme
 * rengi değişir) ve aynı malzemeli parçalar birleştirilir: 8-16 atlık
 * yarışta çizim çağrısı eski modelle aynı düzeyde kalır. Koordinatlar:
 * ileri +X, yukarı +Y, yan +Z; zemin y = 0; metre.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';

export interface LoftStation {
  x: number;
  y: number;
  /** Kesitin dikey yarı ekseni (omurgaya dik, yan düzlemde). */
  halfHeight: number;
  /** Kesitin yanal (Z) yarı ekseni. */
  halfWidth: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** İstasyonları Catmull-Rom ile sıklaştırır (uçlar korunur). */
export function smoothStations(stations: readonly LoftStation[], subdivisions: number): LoftStation[] {
  if (stations.length < 2 || subdivisions <= 1) return [...stations];
  const at = (index: number) => stations[Math.min(stations.length - 1, Math.max(0, index))]!;
  const result: LoftStation[] = [];
  for (let i = 0; i < stations.length - 1; i += 1) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let step = 0; step < subdivisions; step += 1) {
      const t = step / subdivisions;
      result.push({
        x: catmullRom(a.x, b.x, c.x, d.x, t),
        y: catmullRom(a.y, b.y, c.y, d.y, t),
        halfHeight: Math.max(0.001, catmullRom(a.halfHeight, b.halfHeight, c.halfHeight, d.halfHeight, t)),
        halfWidth: Math.max(0.001, catmullRom(a.halfWidth, b.halfWidth, c.halfWidth, d.halfWidth, t)),
      });
    }
  }
  result.push(stations[stations.length - 1]!);
  return result;
}

/**
 * Yan düzlemdeki omurga boyunca elips kesitli gövde. Kesit omurga teğetine
 * diktir (kıvrılan boyunda kesit eğrilir). Uçlar kapatılır. Konum + normal +
 * uv içerir (birleştirilebilir).
 */
export function buildLoftGeometry(
  input: readonly LoftStation[],
  radialSegments = 16,
  subdivisions = 4,
): THREE.BufferGeometry {
  const stations = smoothStations(input, subdivisions);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ring = radialSegments + 1;
  stations.forEach((station, i) => {
    const prev = stations[Math.max(0, i - 1)]!;
    const next = stations[Math.min(stations.length - 1, i + 1)]!;
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    // Yan düzlemde teğete dik "yukarı" yön.
    const nx = -ty;
    const ny = tx;
    for (let j = 0; j <= radialSegments; j += 1) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const up = Math.sin(theta) * station.halfHeight;
      const side = Math.cos(theta) * station.halfWidth;
      positions.push(station.x + nx * up, station.y + ny * up, side);
      uvs.push(j / radialSegments, i / (stations.length - 1));
    }
  });
  for (let i = 0; i < stations.length - 1; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * ring + j;
      const b = a + ring;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Uç kapakları (yelpaze).
  for (const [stationIndex, flip] of [
    [0, true],
    [stations.length - 1, false],
  ] as const) {
    const station = stations[stationIndex]!;
    const center = positions.length / 3;
    positions.push(station.x, station.y, 0);
    uvs.push(0.5, stationIndex === 0 ? 0 : 1);
    for (let j = 0; j < radialSegments; j += 1) {
      const a = stationIndex * ring + j;
      if (flip) indices.push(center, a + 1, a);
      else indices.push(center, a, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

type Vec3 = readonly [number, number, number];

/** `from`→`to` arası konik silindir (üst yarıçap `from` ucunda). */
function segment(from: Vec3, to: Vec3, radiusFrom: number, radiusTo: number, radial = 10): THREE.BufferGeometry {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radiusFrom, radiusTo, length, radial, 1);
  // Silindirin üstü +Y'dedir; aşağı (-Y) eksenini `from→to` yönüne çevir.
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.normalize());
  geometry.applyQuaternion(quaternion);
  const middle = start.add(end).multiplyScalar(0.5);
  geometry.translate(middle.x, middle.y, middle.z);
  return geometry;
}

function ellipsoid(center: Vec3, radii: Vec3, widthSegments = 14, heightSegments = 10): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  geometry.scale(radii[0], radii[1], radii[2]);
  geometry.translate(center[0], center[1], center[2]);
  return geometry;
}

/** Elips halka (kolan/burunluk): `axisAngle` = halkanın yan düzlemdeki eğimi. */
function ellipticRing(center: Vec3, halfHeight: number, halfWidth: number, band: number, axisAngle = 0): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(1, band, 6, 28);
  geometry.rotateY(Math.PI / 2);
  geometry.scale(1, halfHeight, halfWidth);
  geometry.rotateZ(axisAngle);
  geometry.translate(center[0], center[1], center[2]);
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Hepsi indeksli + konum/normal/uv taşır; aksi hâlde birleştirme `null` döner.
  const merged = mergeBufferGeometries(parts);
  if (!merged) throw new Error('horse-geometry: parçalar birleştirilemedi (öznitelik uyuşmazlığı).');
  for (const part of parts) part.dispose();
  return merged;
}

/** Anatomik ölçüler (metre). Cidago ~1.62 m, burun-kuyruk ~2.6 m. */
export const HORSE_ANATOMY = {
  torso: [
    { x: -0.93, y: 1.3, halfHeight: 0.19, halfWidth: 0.16 },
    { x: -0.8, y: 1.32, halfHeight: 0.29, halfWidth: 0.26 },
    { x: -0.6, y: 1.31, halfHeight: 0.31, halfWidth: 0.3 },
    { x: -0.35, y: 1.25, halfHeight: 0.32, halfWidth: 0.3 },
    { x: -0.05, y: 1.2, halfHeight: 0.34, halfWidth: 0.32 },
    { x: 0.25, y: 1.22, halfHeight: 0.38, halfWidth: 0.3 },
    { x: 0.5, y: 1.27, halfHeight: 0.36, halfWidth: 0.26 },
    { x: 0.72, y: 1.24, halfHeight: 0.27, halfWidth: 0.21 },
    { x: 0.83, y: 1.21, halfHeight: 0.15, halfWidth: 0.14 },
  ] satisfies LoftStation[],
  /** Boyun dibi (boyun grubunun dönme noktası, dünya). */
  neckPivot: [0.55, 1.42, 0] as Vec3,
  /** Boyun istasyonları — boyun dibine göre. Son istasyon = ense (poll). */
  neck: [
    { x: 0, y: 0, halfHeight: 0.26, halfWidth: 0.18 },
    { x: 0.17, y: 0.2, halfHeight: 0.22, halfWidth: 0.15 },
    { x: 0.3, y: 0.4, halfHeight: 0.17, halfWidth: 0.12 },
    { x: 0.4, y: 0.56, halfHeight: 0.13, halfWidth: 0.095 },
    { x: 0.44, y: 0.64, halfHeight: 0.11, halfWidth: 0.085 },
  ] satisfies LoftStation[],
  /** Baş istasyonları — enseye göre (ileri-aşağı). */
  head: [
    { x: -0.02, y: 0, halfHeight: 0.11, halfWidth: 0.08 },
    { x: 0.12, y: -0.08, halfHeight: 0.13, halfWidth: 0.09 },
    { x: 0.28, y: -0.2, halfHeight: 0.095, halfWidth: 0.078 },
    { x: 0.44, y: -0.32, halfHeight: 0.07, halfWidth: 0.062 },
    { x: 0.53, y: -0.39, halfHeight: 0.055, halfWidth: 0.05 },
  ] satisfies LoftStation[],
  /** Kuyruk kökü (dünya) ve istasyonları (köke göre). */
  tailRoot: [-0.9, 1.5, 0] as Vec3,
  tail: [
    { x: 0, y: 0, halfHeight: 0.055, halfWidth: 0.05 },
    { x: -0.08, y: -0.15, halfHeight: 0.06, halfWidth: 0.055 },
    { x: -0.12, y: -0.4, halfHeight: 0.075, halfWidth: 0.05 },
    { x: -0.13, y: -0.7, halfHeight: 0.06, halfWidth: 0.035 },
    { x: -0.12, y: -0.86, halfHeight: 0.025, halfWidth: 0.02 },
  ] satisfies LoftStation[],
  /** Ön bacak: omuz/dirsek dönme noktası (dünya), üst kol boyu, alt bacak. */
  foreLeg: { pivot: [0.56, 1.06, 0.16] as Vec3, upperLength: 0.5, cannonLength: 0.32 },
  /** Arka bacak: kalça/diz dönme noktası, gaskin ucu (sekiz) göreli konumu. */
  hindLeg: { pivot: [-0.6, 1.1, 0.15] as Vec3, hock: [-0.15, -0.52, 0] as Vec3, cannonLength: 0.34 },
} as const;

/** Bilekten toynak tabanına: bukağı + toynak (alt bacak grubunda, kemik ucuna göre). */
function pasternAndHoof(cannonLength: number): { pastern: THREE.BufferGeometry; hoof: THREE.BufferGeometry; fetlock: THREE.BufferGeometry } {
  const fetlockY = -cannonLength;
  const pasternEnd: Vec3 = [0.05, fetlockY - 0.15, 0];
  return {
    fetlock: ellipsoid([0, fetlockY, 0], [0.052, 0.055, 0.05], 10, 8),
    pastern: segment([0, fetlockY, 0], pasternEnd, 0.042, 0.04, 8),
    hoof: segment([0.055, fetlockY - 0.15, 0], [0.065, fetlockY - 0.24, 0], 0.05, 0.066, 10),
  };
}

export interface HorseGeometrySet {
  torso: THREE.BufferGeometry;
  neck: THREE.BufferGeometry;
  mane: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  /** Kulaklar (`EAR_PIVOT`a göre; ayrı döner). */
  ears: THREE.BufferGeometry;
  /** Göz + burun deliği (koyu). */
  headDark: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  foreUpper: THREE.BufferGeometry;
  foreLower: THREE.BufferGeometry;
  hindUpper: THREE.BufferGeometry;
  hindLower: THREE.BufferGeometry;
  /** Toynaklar (ön ve arka aynı; alt bacak grubunda). */
  foreHoof: THREE.BufferGeometry;
  hindHoof: THREE.BufferGeometry;
  /** "socks": bilekte beyaz bant (ön/arka alt bacak grubunda). */
  foreSock: THREE.BufferGeometry;
  hindSock: THREE.BufferGeometry;
  /** Eyer + kolan (gövde grubunda, deri). */
  tackBody: THREE.BufferGeometry;
  /** Yular: tepelik, yanaklık, burunluk, gem halkaları (baş grubunda). */
  tackHead: THREE.BufferGeometry;
  /** Dizginler (boyun grubunda: gemden jokeyin ellerine). */
  reins: THREE.BufferGeometry;
  /** Numaralı eyer örtüsü (iki yan; dokulu). */
  saddleCloth: THREE.BufferGeometry;
}

/** Kulakların baş çerçevesindeki dönme noktası (ensenin üstü). */
export const EAR_PIVOT: Vec3 = [0, 0.08, 0];

/** Ensenin boyun grubundaki yeri (= son boyun istasyonu). */
export function pollInNeckFrame(): Vec3 {
  const poll = HORSE_ANATOMY.neck[HORSE_ANATOMY.neck.length - 1]!;
  return [poll.x, poll.y, 0];
}

/** Baş istasyonunun üst yüzey noktası (yüz işaretleri buraya oturur). */
export function headTopPoint(index: number, lift = 1): Vec3 {
  const stations = HORSE_ANATOMY.head;
  const station = stations[index]!;
  const prev = stations[Math.max(0, index - 1)]!;
  const next = stations[Math.min(stations.length - 1, index + 1)]!;
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const length = Math.hypot(tx, ty) || 1;
  return [station.x - (ty / length) * station.halfHeight * lift, station.y + (tx / length) * station.halfHeight * lift, 0];
}

function createHorseGeometrySet(): HorseGeometrySet {
  const A = HORSE_ANATOMY;
  const torso = merge([
    buildLoftGeometry(A.torso, 20, 5),
    // Arka sağrı/but kasları ve ön omuz-kol kası (gövdeye gömülü elipsoitler).
    ellipsoid([-0.62, 1.18, 0.2], [0.26, 0.34, 0.13]),
    ellipsoid([-0.62, 1.18, -0.2], [0.26, 0.34, 0.13]),
    ellipsoid([0.5, 1.12, 0.165], [0.15, 0.27, 0.085]),
    ellipsoid([0.5, 1.12, -0.165], [0.15, 0.27, 0.085]),
  ]);

  const neck = buildLoftGeometry(A.neck, 16, 4);
  // Yele: boyun sırtında ince sırt; istasyonlar boyunun üst yüzeyine kaydırılır.
  const maneStations = A.neck.map((station, index, list) => {
    const prev = list[Math.max(0, index - 1)]!;
    const next = list[Math.min(list.length - 1, index + 1)]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const length = Math.hypot(tx, ty) || 1;
    return {
      x: station.x - (ty / length) * station.halfHeight * 0.9,
      y: station.y + (tx / length) * station.halfHeight * 0.9,
      halfHeight: 0.05,
      halfWidth: 0.03,
    };
  });
  const [pollX, pollY] = pollInNeckFrame();
  const mane = merge([
    buildLoftGeometry(maneStations, 8, 4),
    // Perçem (alında).
    ellipsoid([pollX + 0.06, pollY + 0.06, 0], [0.07, 0.03, 0.05], 8, 6),
  ]);

  const head = buildLoftGeometry(A.head, 16, 4);
  // Kulaklar AYRI (bekleme davranışında dikleşir/yatar — `earPerk`): kulak
  // dönme noktasına (`EAR_PIVOT`, baş çerçevesi) göre.
  const ears = merge([
    segment([0, 0, 0.05], [-0.03, 0.16, 0.06], 0.035, 0.008, 6),
    segment([0, 0, -0.05], [-0.03, 0.16, -0.06], 0.035, 0.008, 6),
  ]);
  const headDark = merge([
    ellipsoid([0.15, 0.0, 0.088], [0.022, 0.018, 0.012], 8, 6),
    ellipsoid([0.15, 0.0, -0.088], [0.022, 0.018, 0.012], 8, 6),
    ellipsoid([0.52, -0.36, 0.035], [0.012, 0.016, 0.008], 6, 4),
    ellipsoid([0.52, -0.36, -0.035], [0.012, 0.016, 0.008], 6, 4),
  ]);

  const tail = buildLoftGeometry(A.tail, 10, 4);

  const fore = A.foreLeg;
  const foreUpper = merge([
    segment([0, 0, 0], [0, -fore.upperLength, 0], 0.085, 0.052, 10),
    ellipsoid([0, -fore.upperLength, 0], [0.058, 0.06, 0.055], 10, 8),
  ]);
  const forePH = pasternAndHoof(fore.cannonLength);
  const foreLower = merge([segment([0, 0, 0], [0, -fore.cannonLength, 0], 0.046, 0.042, 10), forePH.fetlock, forePH.pastern]);

  const hind = A.hindLeg;
  const hindUpper = merge([
    segment([0, 0, 0], hind.hock, 0.095, 0.055, 10),
    ellipsoid(hind.hock, [0.06, 0.062, 0.055], 10, 8),
  ]);
  const hindPH = pasternAndHoof(hind.cannonLength);
  const hindLower = merge([segment([0, 0, 0], [0, -hind.cannonLength, 0], 0.046, 0.042, 10), hindPH.fetlock, hindPH.pastern]);

  const sock = (cannonLength: number) => segment([0, -cannonLength + 0.02, 0], [0.04, -cannonLength - 0.13, 0], 0.05, 0.046, 10);

  const tackBody = merge([
    // Eyer: alçak kubbe + ön kaş + arka kaş.
    (() => {
      const dome = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(0.3, 0.075, 0.25);
      dome.translate(0.1, 1.555, 0);
      return dome;
    })(),
    ellipsoid([0.3, 1.62, 0], [0.05, 0.04, 0.12], 10, 6),
    ellipsoid([-0.12, 1.6, 0], [0.05, 0.045, 0.16], 10, 6),
    ellipticRing([0.3, 1.22, 0], 0.39, 0.32, 0.045),
  ]);

  // Yular (baş çerçevesi): burunluk halkası baş eksenine dik.
  const muzzleAxis = Math.atan2(A.head[3]!.y - A.head[2]!.y, A.head[3]!.x - A.head[2]!.x);
  const tackHead = merge([
    ellipticRing([0.4, -0.29, 0], 0.08, 0.072, 0.05, muzzleAxis),
    segment([0.02, 0.1, 0.086], [0.38, -0.25, 0.074], 0.009, 0.009, 5),
    segment([0.02, 0.1, -0.086], [0.38, -0.25, -0.074], 0.009, 0.009, 5),
    segment([0.02, 0.11, -0.09], [0.02, 0.11, 0.09], 0.011, 0.011, 5),
    ellipsoid([0.48, -0.36, 0.06], [0.018, 0.018, 0.008], 8, 6),
    ellipsoid([0.48, -0.36, -0.06], [0.018, 0.018, 0.008], 8, 6),
  ]);

  // Dizginler: gem (boyun çerçevesinde) → jokeyin elleri (boyun dibine yakın).
  const bit: Vec3 = [pollX + 0.48, pollY - 0.36, 0];
  const hands: Vec3 = [0.18, 0.35, 0];
  const reins = merge([
    segment([bit[0], bit[1], 0.06], [hands[0], hands[1], 0.08], 0.008, 0.008, 5),
    segment([bit[0], bit[1], -0.06], [hands[0], hands[1], -0.08], 0.008, 0.008, 5),
  ]);

  const cloth = (side: number) => {
    const plane = new THREE.PlaneGeometry(0.62, 0.42);
    if (side < 0) plane.rotateY(Math.PI);
    plane.translate(0.05, 1.42, side * 0.335);
    return plane;
  };
  const saddleCloth = merge([cloth(1), cloth(-1)]);

  return {
    torso,
    neck,
    mane,
    head,
    ears,
    headDark,
    tail,
    foreUpper,
    foreLower,
    hindUpper,
    hindLower,
    foreHoof: forePH.hoof,
    hindHoof: hindPH.hoof,
    foreSock: sock(fore.cannonLength),
    hindSock: sock(hind.cannonLength),
    tackBody,
    tackHead,
    reins,
    saddleCloth,
  };
}

let horseGeometries: HorseGeometrySet | null = null;

/** Paylaşılan at geometrileri (ilk çağrıda kurulur, sayfa boyunca yaşar). */
export function getHorseGeometries(): HorseGeometrySet {
  horseGeometries ??= createHorseGeometrySet();
  return horseGeometries;
}

export interface JockeyGeometrySet {
  silks: THREE.BufferGeometry;
  breeches: THREE.BufferGeometry;
  boots: THREE.BufferGeometry;
  skin: THREE.BufferGeometry;
  leathers: THREE.BufferGeometry;
}

/**
 * Jokey — eyer oturma noktasına göre (`HorseAvatar3D` `DEFAULT_MOUNT`).
 * Kısa üzengi: dizler kalça hizasında, gövde öne eğik, baş yukarıda,
 * kollar dizginlere uzanır.
 */
export const JOCKEY_POSE = {
  hip: [-0.06, 0.06, 0] as Vec3,
  shoulder: [0.33, 0.27, 0] as Vec3,
  head: [0.47, 0.4, 0] as Vec3,
  knee: [0.2, 0.02, 0.21] as Vec3,
  ankle: [0.06, -0.3, 0.23] as Vec3,
  shoulderSide: [0.31, 0.25, 0.16] as Vec3,
  elbow: [0.4, 0.08, 0.2] as Vec3,
  hand: [0.56, 0.03, 0.09] as Vec3,
} as const;

function mirror(point: Vec3): Vec3 {
  return [point[0], point[1], -point[2]];
}

function createJockeyGeometrySet(): JockeyGeometrySet {
  const P = JOCKEY_POSE;
  const both = (build: (sideOf: (point: Vec3) => Vec3) => THREE.BufferGeometry[]) => [
    ...build((point) => point),
    ...build(mirror),
  ];
  const helmet = new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
  helmet.rotateZ(-0.35);
  helmet.translate(P.head[0] - 0.01, P.head[1] + 0.02, 0);
  const peak = ellipsoid([P.head[0] + 0.1, P.head[1] + 0.01, 0], [0.06, 0.012, 0.07], 8, 4);
  const silks = merge([
    segment(P.hip, P.shoulder, 0.13, 0.14, 12),
    ellipsoid(P.shoulder, [0.12, 0.1, 0.17], 12, 8),
    ...both((s) => [segment(s(P.shoulderSide), s(P.elbow), 0.045, 0.04, 8), segment(s(P.elbow), s(P.hand), 0.04, 0.034, 8)]),
    helmet,
    peak,
  ]);
  const breeches = merge([
    ellipsoid(P.hip, [0.13, 0.1, 0.15], 10, 8),
    ...both((s) => [segment(s([P.hip[0] + 0.02, P.hip[1] - 0.02, 0.11]), s(P.knee), 0.07, 0.058, 8)]),
  ]);
  const boots = merge(
    both((s) => [
      segment(s(P.knee), s(P.ankle), 0.052, 0.042, 8),
      ellipsoid(s([P.ankle[0] + 0.05, P.ankle[1] - 0.02, P.ankle[2]]), [0.08, 0.03, 0.04], 8, 6),
    ]),
  );
  const skin = merge([
    ellipsoid(P.head, [0.095, 0.1, 0.085], 12, 10),
    ...both((s) => [ellipsoid(s(P.hand), [0.035, 0.032, 0.03], 8, 6)]),
  ]);
  const leathers = merge(
    both((s) => [
      segment(s([0.0, -0.13, 0.25]), s([P.ankle[0], P.ankle[1] - 0.02, P.ankle[2]]), 0.008, 0.008, 5),
      (() => {
        const iron = new THREE.TorusGeometry(0.045, 0.008, 5, 12);
        iron.rotateY(Math.PI / 2);
        const [x, y, z] = s([P.ankle[0] + 0.04, P.ankle[1] - 0.05, P.ankle[2]]);
        iron.translate(x, y, z);
        return iron;
      })(),
    ]),
  );
  return { silks, breeches, boots, skin, leathers };
}

let jockeyGeometries: JockeyGeometrySet | null = null;

/** Paylaşılan jokey geometrileri. */
export function getJockeyGeometries(): JockeyGeometrySet {
  jockeyGeometries ??= createJockeyGeometrySet();
  return jockeyGeometries;
}

/**
 * Dörtnal bacak pozu (faz 0..1): üst bacak salınımı (`swing`, +: ayak
 * ileri) ve alt eklem bükümü (`flex`). Salınım evresinde (ayak öne
 * giderken) diz/sekiz bükülür ve toynak yerden kalkar; destek evresinde
 * bacak düz. Ön diz toynağı GERİ, arka sekiz İLERİ katlar.
 */
export const GALLOP = {
  foreSwing: 0.55,
  foreFlex: 1.25,
  hindSwing: 0.5,
  hindFlex: 0.95,
} as const;

export function gallopLegPose(phase: number, hind: boolean): { swing: number; flex: number } {
  const angle = phase * Math.PI * 2;
  const swing = (hind ? GALLOP.hindSwing : GALLOP.foreSwing) * Math.sin(angle);
  const lift = Math.max(0, Math.cos(angle));
  const flex = hind ? GALLOP.hindFlex * lift : -GALLOP.foreFlex * lift;
  return { swing, flex };
}
