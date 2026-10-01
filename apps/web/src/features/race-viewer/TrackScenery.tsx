'use client';

/**
 * HİPODROM SAHNESİ (01.10.2026 tasarım yenilemesi) — gökyüzü, ışık, çim,
 * kum pist, iç/dış beyaz korkuluk, çatılı tribün + kalabalık, ışık
 * direkleri ve bayrak.
 *
 * **HİÇBİR DOSYA İNDİRİLMEZ.** Önceki sürüm aydınlatma için drei
 * `<Environment preset="sunset">` kullanıyordu; bu, çalışma anında harici
 * bir CDN'den `venice_sunset_1k.hdr` indirir ve indirme başarısız olursa
 * (çevrimdışı, engelli ağ, CDN kesintisi) yarış ekranının TAMAMI çöker.
 * Burada gökyüzü bir shader (`<Sky>`), ortam yansıması yerel
 * `<Lightformer>`larla sahnede üretilir; tribün/kalabalık/korkuluk
 * prosedürel geometridir (CLAUDE.md kural 8: sahte asset yok).
 *
 * Renk/yerleşim çeşitliliği deterministik bir karma ile üretilir —
 * `Math.random()` kullanılmaz.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Environment, Lightformer, Sky } from '@react-three/drei';
import * as THREE from 'three';
import {
  getHorseTrackPosition,
  getOutwardBoundaryPoint,
  type StadiumTrackGeometry,
} from './track-path';

export const TRACK_WIDTH_METERS = 20;
const TRACK_TURN_COUNT_FOR_VISUAL = 2;
const TRACK_SAMPLES = 320;
const RAIL_HEIGHT_METERS = 1.1;
const RAIL_POST_SPACING_METERS = 5;
const GROUND_SIZE_METERS = 2400;
const SUN_POSITION: [number, number, number] = [-300, 160, -500];

function seeded(index: number, salt: number): number {
  let h = (index * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function SkyAndLighting({
  environmentEnabled,
  shadowsEnabled,
  shadowMapSize,
}: {
  environmentEnabled: boolean;
  shadowsEnabled: boolean;
  shadowMapSize: number;
}): React.ReactElement {
  return (
    <>
      <Sky
        distance={4500}
        sunPosition={SUN_POSITION}
        turbidity={5}
        rayleigh={0.9}
        mieCoefficient={0.004}
        mieDirectionalG={0.85}
      />
      <fog attach="fog" args={['#c9dcef', 380, 1900]} />
      <hemisphereLight args={['#cfe3ff', '#4a6b35', environmentEnabled ? 0.55 : 0.9]} />
      {environmentEnabled ? (
        // Yerel ortam haritası: sahnede çizilen ışık panellerinden üretilir
        // (dosya yok). Atların ve korkulukların parlaklık yansımaları buradan gelir.
        <Environment resolution={128} frames={1}>
          <Lightformer
            intensity={1.6}
            color="#dbe9ff"
            position={[0, 40, 0]}
            rotation-x={Math.PI / 2}
            scale={[300, 300, 1]}
          />
          <Lightformer
            intensity={2.2}
            color="#fff1d6"
            position={[-60, 20, -80]}
            scale={[120, 40, 1]}
          />
          <Lightformer
            intensity={0.6}
            color="#7fae6a"
            position={[0, -10, 0]}
            rotation-x={-Math.PI / 2}
            scale={[300, 300, 1]}
          />
        </Environment>
      ) : null}
      <directionalLight
        position={[-120, 160, -200]}
        intensity={2.1}
        color="#fff4e0"
        castShadow={shadowsEnabled}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-260}
        shadow-camera-right={260}
        shadow-camera-top={260}
        shadow-camera-bottom={-260}
        shadow-camera-far={900}
        shadow-bias={-0.0004}
      />
    </>
  );
}

export function Grass(): React.ReactElement {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE_METERS, GROUND_SIZE_METERS]} />
      <meshStandardMaterial color="#4f8a3c" roughness={0.95} metalness={0} />
    </mesh>
  );
}

/** Kum pist: pist merkez çizgisinin iki yanına `TRACK_WIDTH_METERS/2` açılan sürekli bir şerit. */
export function DirtTrack({
  geometry,
}: {
  geometry: StadiumTrackGeometry;
}): React.ReactElement | null {
  const mesh = useMemo(() => {
    if (geometry.lapLengthMeters <= 0) return null;
    const half = TRACK_WIDTH_METERS / 2;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const base = new THREE.Color('#9a7550');
    for (let i = 0; i <= TRACK_SAMPLES; i += 1) {
      const distance = (i / TRACK_SAMPLES) * geometry.lapLengthMeters;
      const inner = getOutwardBoundaryPoint(distance, TRACK_TURN_COUNT_FOR_VISUAL, geometry, -half);
      const outer = getOutwardBoundaryPoint(distance, TRACK_TURN_COUNT_FOR_VISUAL, geometry, half);
      positions.push(inner.x, 0.02, inner.z, outer.x, 0.02, outer.z);
      for (let side = 0; side < 2; side += 1) {
        const shade = 0.86 + seeded(i * 2 + side, 7) * 0.2;
        colors.push(base.r * shade, base.g * shade, base.b * shade);
      }
      if (i < TRACK_SAMPLES) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bufferGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    bufferGeometry.setIndex(indices);
    bufferGeometry.computeVertexNormals();
    return bufferGeometry;
  }, [geometry]);

  useEffect(() => () => mesh?.dispose(), [mesh]);

  if (!mesh) return null;
  return (
    <mesh geometry={mesh} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** İç ve dış beyaz korkuluk: sürekli boru + aralıklı direkler. */
export function Rails({ geometry }: { geometry: StadiumTrackGeometry }): React.ReactElement | null {
  const data = useMemo(() => {
    if (geometry.lapLengthMeters <= 0) return null;
    const half = TRACK_WIDTH_METERS / 2 + 0.4;
    const curveFor = (offset: number) => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < TRACK_SAMPLES; i += 1) {
        const distance = (i / TRACK_SAMPLES) * geometry.lapLengthMeters;
        const p = getOutwardBoundaryPoint(distance, TRACK_TURN_COUNT_FOR_VISUAL, geometry, offset);
        points.push(new THREE.Vector3(p.x, RAIL_HEIGHT_METERS, p.z));
      }
      return new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points, true),
        TRACK_SAMPLES * 2,
        0.07,
        6,
        true,
      );
    };
    const posts: Array<{ x: number; z: number }> = [];
    const postCount = Math.floor(geometry.lapLengthMeters / RAIL_POST_SPACING_METERS);
    for (let i = 0; i < postCount; i += 1) {
      const distance = i * RAIL_POST_SPACING_METERS;
      for (const offset of [-half, half]) {
        const p = getOutwardBoundaryPoint(distance, TRACK_TURN_COUNT_FOR_VISUAL, geometry, offset);
        posts.push({ x: p.x, z: p.z });
      }
    }
    return { inner: curveFor(-half), outer: curveFor(half), posts };
  }, [geometry]);

  const postsRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const instanced = postsRef.current;
    if (!instanced || !data) return;
    const matrix = new THREE.Matrix4();
    data.posts.forEach((post, index) => {
      matrix.makeTranslation(post.x, RAIL_HEIGHT_METERS / 2, post.z);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [data]);

  useEffect(
    () => () => {
      data?.inner.dispose();
      data?.outer.dispose();
    },
    [data],
  );

  if (!data) return null;
  return (
    <group>
      <mesh geometry={data.inner} castShadow>
        <meshStandardMaterial color="#f7f7f2" roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh geometry={data.outer} castShadow>
        <meshStandardMaterial color="#f7f7f2" roughness={0.35} metalness={0.1} />
      </mesh>
      <instancedMesh
        key={data.posts.length}
        ref={postsRef}
        args={[undefined, undefined, data.posts.length]}
        castShadow
      >
        <cylinderGeometry args={[0.06, 0.06, RAIL_HEIGHT_METERS, 6]} />
        <meshStandardMaterial color="#f2f2ec" roughness={0.4} />
      </instancedMesh>
    </group>
  );
}

const STAND_ROWS = 14;
const STAND_ROW_DEPTH = 1.4;
const STAND_ROW_RISE = 0.75;
const STAND_SEAT_SPACING = 0.75;
// Doğal kıyafet tonları (doygunluğu düşük) — konfeti gibi görünmesin.
const CROWD_COLORS = [
  '#a8473d',
  '#2f3b4c',
  '#d9d6cf',
  '#c9a64a',
  '#3f6b94',
  '#5a4a6b',
  '#4a6b48',
  '#8a5a3b',
  '#6d7278',
  '#e8e4dc',
  '#1f2328',
  '#7a2f2f',
];

/**
 * Ana tribün: pistin alt düzlüğünün (bitiş düzlüğü, z = -yarıçap) dışında,
 * basamaklı oturma + kalabalık + çatı + kolonlar. Kalabalık tek bir
 * `InstancedMesh` (tek draw call).
 */
export function Grandstand({
  geometry,
}: {
  geometry: StadiumTrackGeometry;
}): React.ReactElement | null {
  const layout = useMemo(() => {
    if (geometry.lapLengthMeters <= 0) return null;
    const length = Math.min(geometry.straightLengthMeters * 0.75, 520);
    const frontZ = -geometry.turnRadiusMeters - TRACK_WIDTH_METERS / 2 - 14;
    const seatsPerRow = Math.floor(length / STAND_SEAT_SPACING);
    const crowd: Array<{ x: number; y: number; z: number; color: number }> = [];
    for (let row = 0; row < STAND_ROWS; row += 1) {
      for (let seat = 0; seat < seatsPerRow; seat += 1) {
        const index = row * seatsPerRow + seat;
        if (seeded(index, 3) < 0.18) continue; // boş koltuklar
        crowd.push({
          x: -length / 2 + seat * STAND_SEAT_SPACING + (seeded(index, 5) - 0.5) * 0.2,
          y: (row + 1) * STAND_ROW_RISE + 0.45,
          z: frontZ - row * STAND_ROW_DEPTH - 0.4,
          color: Math.floor(seeded(index, 11) * CROWD_COLORS.length),
        });
      }
    }
    return { length, frontZ, crowd };
  }, [geometry]);

  const crowdRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const instanced = crowdRef.current;
    if (!instanced || !layout) return;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    layout.crowd.forEach((person, index) => {
      matrix.makeTranslation(person.x, person.y, person.z);
      instanced.setMatrixAt(index, matrix);
      instanced.setColorAt(index, color.set(CROWD_COLORS[person.color] ?? '#888888'));
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [layout]);

  if (!layout) return null;
  const { length, frontZ, crowd } = layout;
  const standDepth = STAND_ROWS * STAND_ROW_DEPTH;
  const standHeight = STAND_ROWS * STAND_ROW_RISE;
  const roofHeight = standHeight + 7;

  return (
    <group>
      {/* Basamaklar */}
      {Array.from({ length: STAND_ROWS }, (_, row) => (
        <mesh
          key={row}
          position={[
            0,
            ((row + 1) * STAND_ROW_RISE) / 2,
            frontZ - row * STAND_ROW_DEPTH - STAND_ROW_DEPTH / 2,
          ]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[length, (row + 1) * STAND_ROW_RISE, STAND_ROW_DEPTH]} />
          <meshStandardMaterial color={row % 2 === 0 ? '#b9bec6' : '#a9aeb7'} roughness={0.9} />
        </mesh>
      ))}
      {/* Ön duvar */}
      <mesh position={[0, 0.9, frontZ + 0.3]} castShadow>
        <boxGeometry args={[length, 1.8, 0.5]} />
        <meshStandardMaterial color="#1f3a5f" roughness={0.6} />
      </mesh>
      {/* Arka duvar */}
      <mesh position={[0, roofHeight / 2, frontZ - standDepth - 0.5]} castShadow receiveShadow>
        <boxGeometry args={[length, roofHeight, 1]} />
        <meshStandardMaterial color="#d8dbe0" roughness={0.85} />
      </mesh>
      {/* Çatı (öne doğru eğimli konsol) */}
      <mesh
        position={[0, roofHeight, frontZ - standDepth / 2 + 3]}
        rotation={[0.08, 0, 0]}
        castShadow
      >
        <boxGeometry args={[length + 8, 0.6, standDepth + 12]} />
        <meshStandardMaterial color="#b9c0c8" roughness={0.6} metalness={0.25} />
      </mesh>
      {/* Kolonlar */}
      {Array.from({ length: Math.floor(length / 40) + 1 }, (_, i) => (
        <mesh
          key={i}
          position={[-length / 2 + i * 40, roofHeight / 2, frontZ - standDepth - 0.2]}
          castShadow
        >
          <boxGeometry args={[0.8, roofHeight, 0.8]} />
          <meshStandardMaterial color="#9aa1ab" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      {crowd.length > 0 ? (
        <instancedMesh
          key={crowd.length}
          ref={crowdRef}
          args={[undefined, undefined, crowd.length]}
          castShadow
        >
          <boxGeometry args={[0.42, 0.78, 0.34]} />
          <meshStandardMaterial roughness={0.9} />
        </instancedMesh>
      ) : null}
    </group>
  );
}

/** Işık direkleri + bayrak direği (Türk bayrağı, çalışma anında çizilen doku). */
export function TrackFurniture({
  geometry,
}: {
  geometry: StadiumTrackGeometry;
}): React.ReactElement | null {
  const flagTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#e30a17';
    context.fillRect(0, 0, 300, 200);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(113, 100, 50, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e30a17';
    context.beginPath();
    context.arc(125, 100, 40, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const x = 182 + Math.cos(angle) * 25;
      const y = 100 + Math.sin(angle) * 25;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  if (geometry.lapLengthMeters <= 0) return null;
  const half = geometry.straightLengthMeters / 2;
  const innerZ = geometry.turnRadiusMeters - TRACK_WIDTH_METERS / 2 - 8;
  const towers: Array<[number, number]> = [
    [-half * 0.6, -innerZ],
    [0, -innerZ],
    [half * 0.6, -innerZ],
    [-half * 0.6, innerZ],
    [half * 0.6, innerZ],
  ];
  const finish = getHorseTrackPosition(0, TRACK_TURN_COUNT_FOR_VISUAL, geometry);

  return (
    <group>
      {towers.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh position={[0, 16, 0]} castShadow>
            <cylinderGeometry args={[0.35, 0.5, 32, 8]} />
            <meshStandardMaterial color="#8e959f" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0, 32.5, 0]}>
            <boxGeometry args={[4, 2.2, 0.6]} />
            <meshStandardMaterial color="#e9edf2" emissive="#fffbe6" emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
      {/* Bayrak direği — tribünün ucunda */}
      <group position={[finish.x + 30, 0, -geometry.turnRadiusMeters - TRACK_WIDTH_METERS / 2 - 6]}>
        <mesh position={[0, 11, 0]}>
          <cylinderGeometry args={[0.12, 0.16, 22, 8]} />
          <meshStandardMaterial color="#d9dde2" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[2.3, 19.8, 0]}>
          <planeGeometry args={[4.5, 3]} />
          <meshStandardMaterial
            map={flagTexture ?? undefined}
            color={flagTexture ? '#ffffff' : '#e30a17'}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

const TREE_COUNT = 260;
const TREE_RING_MARGIN_METERS = 120;

/**
 * Uzak ağaç sırası — pistin çevresinde düzensiz bir halka (derinlik hissi).
 * Tek `InstancedMesh` gövde + tek `InstancedMesh` taç.
 */
export function TreeLine({
  geometry,
}: {
  geometry: StadiumTrackGeometry;
}): React.ReactElement | null {
  const trees = useMemo(() => {
    if (geometry.lapLengthMeters <= 0) return [];
    const result: Array<{ x: number; z: number; scale: number }> = [];
    for (let i = 0; i < TREE_COUNT; i += 1) {
      const distance = (i / TREE_COUNT) * geometry.lapLengthMeters;
      const offset = TREE_RING_MARGIN_METERS + seeded(i, 17) * 90;
      const p = getOutwardBoundaryPoint(distance, TRACK_TURN_COUNT_FOR_VISUAL, geometry, offset);
      result.push({ x: p.x, z: p.z, scale: 0.8 + seeded(i, 19) * 0.9 });
    }
    return result;
  }, [geometry]);

  const crownRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const crown = crownRef.current;
    const trunk = trunkRef.current;
    if (!crown || !trunk) return;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const color = new THREE.Color();
    trees.forEach((tree, index) => {
      scale.setScalar(tree.scale);
      position.set(tree.x, 9 * tree.scale, tree.z);
      crown.setMatrixAt(index, matrix.compose(position, quaternion, scale));
      crown.setColorAt(
        index,
        color.setHSL(0.27 + seeded(index, 23) * 0.06, 0.35, 0.22 + seeded(index, 29) * 0.08),
      );
      position.set(tree.x, 2.5 * tree.scale, tree.z);
      trunk.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    });
    crown.instanceMatrix.needsUpdate = true;
    trunk.instanceMatrix.needsUpdate = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    crown.computeBoundingSphere();
    trunk.computeBoundingSphere();
  }, [trees]);

  if (trees.length === 0) return null;
  return (
    <group>
      <instancedMesh
        key={`c${trees.length}`}
        ref={crownRef}
        args={[undefined, undefined, trees.length]}
        castShadow
      >
        <icosahedronGeometry args={[6, 1]} />
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh
        key={`t${trees.length}`}
        ref={trunkRef}
        args={[undefined, undefined, trees.length]}
      >
        <cylinderGeometry args={[0.4, 0.6, 5, 6]} />
        <meshStandardMaterial color="#4a3626" roughness={1} />
      </instancedMesh>
    </group>
  );
}
