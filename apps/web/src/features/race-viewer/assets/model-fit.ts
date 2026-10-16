/**
 * MODEL UYDURMA (01.10.2026, 3D adım 4) — saf hesaplar, three.js yok.
 *
 * Satın alınan bir GLB'nin ekseni ve ölçeği bilinmez. `computeModelFit`
 * modelin sınır kutusundan (bounding box) şunları hesaplar:
 *  - `rotationY`: modelin ileri ekseni oyunun ileri eksenine (+X) döner,
 *  - `scale`: ileri uzunluk (ya da yükseklik) manifestteki hedefe eşitlenir,
 *  - `offset`: dönmüş+ölçeklenmiş modelin tabanı y=0'a, merkezi orijine oturur.
 * Uygulama sırası: önce `rotationY` + `scale`, sonra `offset` (dış grupta).
 */

import type { AssetBinding } from './asset-manifest';

export type Vec3 = [number, number, number];

export interface ModelFit {
  rotationY: number;
  scale: number;
  offset: Vec3;
}

/** Modelin ileri ekseninden oyunun +X eksenine dönüş açısı (Y ekseni etrafında, three.js sağ el kuralı). */
export function forwardAxisRotation(axis: AssetBinding['forwardAxis']): number {
  switch (axis) {
    case '+x':
      return 0;
    case '-x':
      return Math.PI;
    case '+z':
      // +Z'yi +X'e çevirmek için +90° (Y etrafında +90°: +Z → +X).
      return Math.PI / 2;
    case '-z':
      return -Math.PI / 2;
  }
}

/** Y ekseni etrafında döndürme (three.js `rotation.y` ile aynı yön). */
function rotateY([x, y, z]: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

export function computeModelFit(min: Vec3, max: Vec3, binding: AssetBinding): ModelFit {
  const rotationY = forwardAxisRotation(binding.forwardAxis);
  // Kutunun 8 köşesini döndürüp yeni sınırları bul.
  const corners: Vec3[] = [];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) corners.push(rotateY([x, y, z], rotationY));
  const rMin: Vec3 = [Infinity, Infinity, Infinity];
  const rMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const corner of corners) {
    for (let i = 0; i < 3; i += 1) {
      rMin[i] = Math.min(rMin[i]!, corner[i]!);
      rMax[i] = Math.max(rMax[i]!, corner[i]!);
    }
  }
  const length = rMax[0] - rMin[0];
  const height = rMax[1] - rMin[1];
  let scale = 1;
  if (binding.targetLengthMeters && length > 0) scale = binding.targetLengthMeters / length;
  else if (binding.targetHeightMeters && height > 0) scale = binding.targetHeightMeters / height;
  const offset: Vec3 = [
    -((rMin[0] + rMax[0]) / 2) * scale,
    -rMin[1] * scale,
    -((rMin[2] + rMax[2]) / 2) * scale,
  ];
  return { rotationY, scale, offset };
}

/** Malzeme adı bu role ait mi (büyük/küçük harf duyarsız, "içerir"). */
export function materialMatchesRole(
  materialName: string,
  binding: AssetBinding | undefined,
  role: 'coat' | 'mane' | 'silk',
): boolean {
  const keys = binding?.tintMaterials?.[role];
  if (!keys || keys.length === 0 || !materialName) return false;
  const lower = materialName.toLowerCase();
  return keys.some((key) => lower.includes(key.toLowerCase()));
}

/** İlk eşleşen kemik adı (manifest sırası öncelik). */
export function findMountBoneName(
  boneNames: readonly string[],
  binding: AssetBinding | undefined,
): string | null {
  for (const wanted of binding?.mountBoneNames ?? []) {
    const hit = boneNames.find((name) => name.toLowerCase() === wanted.toLowerCase());
    if (hit) return hit;
  }
  return null;
}
