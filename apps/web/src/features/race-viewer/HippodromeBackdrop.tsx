'use client';

/**
 * HİPODROM ARKA PLANI (08.10.2026) — `hippodrome-backdrop.ts`in ürettiği
 * parçaları çizer: parça türü başına tek `InstancedMesh` (tek çizim çağrısı),
 * deniz için tek düzlem + kıyı şeridi. Gölge düşürmez/almaz (gölge kamerasının
 * çok dışında). Dosya/doku YOK; renk örnek rengidir, sis uzaklığı soluklaştırır.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import type { HippodromeBackdrop as BackdropKind } from '@at-sevdalisi/game-config';
import {
  computeBackdropLayout,
  type BackdropPiece,
  type BackdropPieceKind,
} from './hippodrome-backdrop';
import type { StadiumTrackGeometry } from './track-path';

const SEA_FAR_Z = 2400;
const SEA_HALF_WIDTH = 2400;
const SHORE_WIDTH = 16;

/** Tepeyi düzensizleştiren konum tabanlı gürültü (aynı köşe aynı değeri alır → çatlak yok). */
function noise(x: number, y: number, z: number, salt: number): number {
  let h =
    (Math.round(x * 1000) * 73856093) ^
    (Math.round(y * 1000) * 19349663) ^
    (Math.round(z * 1000) * 83492791) ^
    salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

function jitterBelow(
  geometry: THREE.BufferGeometry,
  maxY: number,
  amount: number,
  salt: number,
): void {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (y >= maxY) continue;
    const n = 1 + noise(x, y, z, salt) * amount;
    position.setXYZ(i, x * n, y, z * n);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

type BackdropGeometries = Record<BackdropPieceKind, THREE.BufferGeometry> & {
  /** Palmiye tacı (gövde `palm`; ikisi aynı parça listesinden çizilir). */
  palmCrown: THREE.BufferGeometry;
};

function createPieceGeometries(): BackdropGeometries {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const dome = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const shaft = new THREE.CylinderGeometry(0.5, 0.55, 0.88, 8).translate(0, 0.44, 0);
  const cap = new THREE.ConeGeometry(0.75, 0.12, 8).translate(0, 0.94, 0);
  const spire = mergeBufferGeometries([shaft, cap]) ?? shaft;
  if (spire !== shaft) shaft.dispose();
  cap.dispose();
  const hill = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  jitterBelow(hill, 0.95, 0.14, 7);
  const peak = new THREE.ConeGeometry(1, 1, 14, 4).translate(0, 0.5, 0);
  // Yalnızca alt halkalar oynar: üst kısım tam koni kalır ki kar örtüsü otursun.
  jitterBelow(peak, 0.4, 0.22, 11);
  const snow = new THREE.ConeGeometry(1, 1, 14, 1).translate(0, 0.5, 0);
  // Palmiye: ince gövde + sekiz sarkık yaprak (taç ayrı örnek kümesidir).
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0);
  const fronds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i += 1) {
    const leaf = new THREE.BoxGeometry(3.4, 0.05, 0.55).translate(1.7, 0, 0);
    leaf.rotateZ(-0.42 - (i % 2) * 0.18);
    leaf.rotateY((i / 8) * Math.PI * 2);
    fronds.push(leaf);
  }
  const crown = mergeBufferGeometries(fronds) ?? fronds[0]!;
  for (const leaf of fronds) if (leaf !== crown) leaf.dispose();
  return { box, dome, spire, hill, peak, snow, palm: trunk, palmCrown: crown };
}

const MATERIAL_BY_KIND: Record<BackdropPieceKind, { roughness: number; flatShading: boolean }> = {
  box: { roughness: 0.9, flatShading: false },
  dome: { roughness: 0.6, flatShading: false },
  spire: { roughness: 0.8, flatShading: false },
  hill: { roughness: 1, flatShading: true },
  // Uzak dağda düz gölgeleme sert üçgenler çiziyordu; yumuşak gölge + sis daha doğal.
  peak: { roughness: 1, flatShading: false },
  snow: { roughness: 0.7, flatShading: false },
  palm: { roughness: 1, flatShading: false },
};

const PALM_TRUNK_COLOR = '#7a6248';

function PieceInstances({
  pieces,
  geometry,
  roughness,
  flatShading,
  colorOverride,
  crownOffset = false,
}: {
  pieces: BackdropPiece[];
  geometry: THREE.BufferGeometry;
  roughness: number;
  flatShading: boolean;
  /** Palmiye gövdesi: parça rengi yaprağındır. */
  colorOverride?: string;
  /** Palmiye tacı: gövdenin tepesine, sabit ölçekle. */
  crownOffset?: boolean;
}): React.ReactElement | null {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    pieces.forEach((piece, index) => {
      quaternion.setFromEuler(euler.set(0, piece.yaw, 0));
      if (crownOffset) {
        position.set(piece.x, piece.y + piece.sy, piece.z);
        scale.setScalar(0.85 + (piece.sy - 9) * 0.04);
      } else {
        position.set(piece.x, piece.y, piece.z);
        scale.set(piece.sx, piece.sy, piece.sz);
      }
      mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
      mesh.setColorAt(index, color.set(colorOverride ?? piece.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pieces, colorOverride, crownOffset]);
  if (pieces.length === 0) return null;
  return (
    <instancedMesh key={pieces.length} ref={ref} args={[geometry, undefined, pieces.length]}>
      <meshStandardMaterial roughness={roughness} flatShading={flatShading} />
    </instancedMesh>
  );
}

export function HippodromeBackdrop({
  backdrop,
  geometry,
}: {
  backdrop: BackdropKind;
  geometry: StadiumTrackGeometry;
}): React.ReactElement {
  const layout = useMemo(() => computeBackdropLayout(backdrop, geometry), [backdrop, geometry]);
  const geometries = useMemo(() => createPieceGeometries(), []);
  useEffect(
    () => () => {
      for (const part of Object.values(geometries)) part.dispose();
    },
    [geometries],
  );
  const byKind = useMemo(() => {
    const groups: Record<BackdropPieceKind, BackdropPiece[]> = {
      box: [],
      dome: [],
      spire: [],
      hill: [],
      peak: [],
      snow: [],
      palm: [],
    };
    for (const piece of layout.pieces) groups[piece.kind].push(piece);
    return groups;
  }, [layout]);

  const sea = layout.sea;
  return (
    <group>
      {(Object.keys(byKind) as BackdropPieceKind[]).map((kind) => (
        <PieceInstances
          key={kind}
          pieces={byKind[kind]}
          geometry={geometries[kind]}
          roughness={MATERIAL_BY_KIND[kind].roughness}
          flatShading={MATERIAL_BY_KIND[kind].flatShading}
          colorOverride={kind === 'palm' ? PALM_TRUNK_COLOR : undefined}
        />
      ))}
      <PieceInstances
        pieces={byKind.palm}
        geometry={geometries.palmCrown}
        roughness={0.9}
        flatShading
        crownOffset
      />
      {sea ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, (sea.minZ + SEA_FAR_Z) / 2]}>
            <planeGeometry args={[SEA_HALF_WIDTH * 2, SEA_FAR_Z - sea.minZ]} />
            <meshStandardMaterial color="#2f6f8f" roughness={0.22} metalness={0.15} />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.025, sea.minZ - SHORE_WIDTH / 2 + 2]}
          >
            <planeGeometry args={[SEA_HALF_WIDTH * 2, SHORE_WIDTH]} />
            <meshStandardMaterial color="#d9c89c" roughness={1} />
          </mesh>
        </>
      ) : null}
    </group>
  );
}
