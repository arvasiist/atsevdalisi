/**
 * AĞAÇ GEOMETRİLERİ (08.10.2026, sahibinin isteği: "ağaçları gerçekçi
 * yapalım"). Eskiden her ağaç tek bir düzgün çokyüzlü + silindirdi. Artık
 * iki tür vardır:
 *  - YAPRAKLI: birbirine geçmiş dört düzensiz küme (köşeleri konuma bağlı
 *    tohumlu gürültüyle oynatılmış — çatlak oluşmaz),
 *  - ÇAM: üst üste üç koni, aşağıdan yukarı daralır.
 * İkisinde de köşe rengi alttan üste açılır (taç içi gölgesi hissi); tür içi
 * renk farkını örnek rengi (instanceColor) verir. Doku/dosya YOK.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';

/** Konumdan türetilen deterministik gürültü (-1..1) — aynı köşe aynı değeri alır. */
function positionNoise(x: number, y: number, z: number, salt: number): number {
  const key = Math.round(x * 1000) * 73856093 ^ Math.round(y * 1000) * 19349663 ^ Math.round(z * 1000) * 83492791 ^ salt;
  let h = key | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

/** Yükseklik boyunca koyu → açık köşe rengi (çarpan; asıl ton örnek renginden). */
function applyHeightShade(geometry: THREE.BufferGeometry, dark: number, light: number): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const span = Math.max(0.001, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - box.min.y) / span;
    const shade = dark + (light - dark) * t;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function jitter(geometry: THREE.BufferGeometry, amount: number, salt: number): void {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = 1 + positionNoise(x, y, z, salt) * amount;
    position.setXYZ(i, x * n, y * n, z * n);
  }
  position.needsUpdate = true;
}

/** Yapraklı taç (yarıçap ~6 m, merkez orijinde). */
export function createDeciduousCrown(): THREE.BufferGeometry {
  const clusters: Array<[number, number, number, number]> = [
    [0, 0, 0, 5],
    [2.6, -0.8, 1.2, 3.6],
    [-2.4, -0.4, -1.4, 3.8],
    [0.4, 2.4, -0.6, 3.4],
  ];
  const parts = clusters.map(([x, y, z, radius], index) => {
    const part = new THREE.IcosahedronGeometry(radius, 1);
    jitter(part, 0.18, 101 + index);
    part.translate(x, y, z);
    return part;
  });
  const merged = mergeBufferGeometries(parts) ?? parts[0]!;
  for (const part of parts) if (part !== merged) part.dispose();
  merged.computeVertexNormals();
  applyHeightShade(merged, 0.55, 1.15);
  return merged;
}

/** Çam tacı (taban yarıçapı ~4 m, yükseklik ~12 m, merkez orijinde). */
export function createConiferCrown(): THREE.BufferGeometry {
  const tiers: Array<[number, number, number]> = [
    [4.2, 5.5, -3.2],
    [3.3, 5, 0.2],
    [2.2, 4.4, 3.4],
  ];
  const parts = tiers.map(([radius, height, y], index) => {
    const part = new THREE.ConeGeometry(radius, height, 9, 2);
    jitter(part, 0.08, 211 + index);
    part.translate(0, y, 0);
    return part;
  });
  const merged = mergeBufferGeometries(parts) ?? parts[0]!;
  for (const part of parts) if (part !== merged) part.dispose();
  merged.computeVertexNormals();
  applyHeightShade(merged, 0.5, 1.1);
  return merged;
}
