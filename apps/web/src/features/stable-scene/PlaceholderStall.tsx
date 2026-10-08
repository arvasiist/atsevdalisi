'use client';

/**
 * PROSEDÜREL AHIR (08.10.2026 — 01.10.2026'daki tek bölmelik yer tutucunun
 * yerine). Sahibinin isteği: "ahıra gerçekçilik kat". Gerçek
 * `stable-environment.glb` gelene kadar sahne bütünüyle KODLA kurulur — dosya
 * indirilmez, depoya görsel konmaz; dokular çalışma anında `<canvas>`a çizilir
 * (`stable-textures.ts`). Ekranda yine PLACEHOLDER rozeti vardır: bu nihai
 * görüntü değildir ve öyle sunulmaz.
 *
 * İçerik: koridorlu ahır binası (iki sıra bölme, ahşap ara duvarlar + demir
 * parmaklık, sürgülü kapılar), beşik çatı + ahşap makaslar, arka duvarda
 * pencereler (gün ışığı içeri bu boşluklardan girer), asma lambalar, beton
 * koridor, oyuncunun bölmesinde saman yatak + yemlik + suluk + tuz taşı +
 * isim levhası (atın GERÇEK adı), koridorda el arabası, saman balyaları,
 * kovalar, eyer askısı, yaba; koridor ucundaki açık kapıdan padok görünür.
 *
 * Yerleşim ve kamera sınırları `stable-layout.ts`tedir (orijin = bölme
 * zemini, at +X'e bakar — manifest `STABLE_ENVIRONMENT_REQUIRED` sözleşmesi).
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Sparkles } from '@react-three/drei';
import {
  STABLE_LAYOUT,
  STABLE_LAMPS,
  bayCentersX,
  partitionLinesX,
  roofHeightAt,
  strawStrands,
  trussLinesX,
  type Vec3,
} from './stable-layout';
import {
  createConcreteTexture,
  createNameplateTexture,
  createStrawTexture,
  createWindowViewTexture,
  createWoodTexture,
} from './stable-textures';

export type StableDetail = 'low' | 'high';

const { stall, barn, aisle, door, window: WINDOW, bayLength } = STABLE_LAYOUT;
const ROOF_THICKNESS = 0.08;
const BAR_SPACING = 0.12;
const STRAW_COUNT: Record<StableDetail, number> = { low: 450, high: 1500 };
const STRAW_PALETTE = ['#e6c879', '#d9b45f', '#c99f4b', '#f0dc9c', '#b88d3d'];
/** Pencereden giren güneşin yönü (sahnedeki güneş ışığıyla AYNI — `StableScene3D`). */
export const STABLE_SUN_POSITION: Vec3 = [2, 8, -10];

interface StableTextures {
  barnWood: THREE.CanvasTexture | null;
  boardWood: THREE.CanvasTexture | null;
  roofWood: THREE.CanvasTexture | null;
  beamWood: THREE.CanvasTexture | null;
  concrete: THREE.CanvasTexture | null;
  straw: THREE.CanvasTexture | null;
  view: THREE.CanvasTexture | null;
}

function useStableTextures(): StableTextures {
  const textures = useMemo<StableTextures>(
    () => ({
      barnWood: createWoodTexture(11, '#7a5536', [6, 1], 16),
      boardWood: createWoodTexture(23, '#6e4a2e', [1, 1], 6),
      roofWood: createWoodTexture(37, '#4a3322', [5, 2], 10),
      beamWood: createWoodTexture(41, '#5a3d27', [1, 1], 2),
      concrete: createConcreteTexture(53, [6, 3]),
      straw: createStrawTexture(67, [2, 2]),
      view: createWindowViewTexture(71),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const texture of Object.values(textures)) texture?.dispose();
    },
    [textures],
  );
  return textures;
}

interface BoxProps {
  size: Vec3;
  position: Vec3;
  rotation?: Vec3;
  color?: string;
  map?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
}

function Box({
  size,
  position,
  rotation,
  color = '#ffffff',
  map = null,
  roughness = 0.85,
  metalness = 0,
  castShadow = false,
}: BoxProps): React.ReactElement {
  return (
    <mesh position={position} rotation={rotation} castShadow={castShadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} map={map} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

/** İki nokta arasında kiriş/çubuk (kesit `width × height`). */
function Beam({
  from,
  to,
  width,
  height,
  color = '#ffffff',
  map = null,
  roughness = 0.8,
  metalness = 0,
  castShadow = false,
}: {
  from: Vec3;
  to: Vec3;
  width: number;
  height: number;
  color?: string;
  map?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
}): React.ReactElement {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const distance = direction.length();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction.normalize(),
    );
    return { position: start.add(end).multiplyScalar(0.5), quaternion: q, length: distance };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} castShadow={castShadow} receiveShadow>
      <boxGeometry args={[width, height, length]} />
      <meshStandardMaterial color={color} map={map} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

/** Bütün demir parmaklıklar tek `InstancedMesh` (tek çizim çağrısı). */
function IronBars({
  bars,
  castShadow,
}: {
  bars: ReadonlyArray<{ x: number; z: number; bottom: number; top: number }>;
  castShadow: boolean;
}): React.ReactElement {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    bars.forEach((bar, index) => {
      const height = bar.top - bar.bottom;
      matrix.makeScale(1, height, 1);
      matrix.setPosition(bar.x, bar.bottom + height / 2, bar.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [bars]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, bars.length]} castShadow={castShadow}>
      <cylinderGeometry args={[0.013, 0.013, 1, 6]} />
      <meshStandardMaterial color="#2d2f31" roughness={0.45} metalness={0.75} />
    </instancedMesh>
  );
}

/** Oyuncunun bölmesine serpiştirilmiş saman telleri (tohumlu). */
function StrawStrands({ count }: { count: number }): React.ReactElement {
  const ref = useRef<THREE.InstancedMesh>(null);
  const strands = useMemo(() => strawStrands(count, 97), [count]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const color = new THREE.Color();
    strands.forEach((strand, index) => {
      euler.set(0, strand.rotationY, strand.tilt);
      rotation.setFromEuler(euler);
      scale.set(strand.length, 1, 1);
      position.set(strand.x, strand.y, strand.z);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
      const swatch = STRAW_PALETTE[Math.floor(strand.shade * STRAW_PALETTE.length)] ?? '#d9b45f';
      mesh.setColorAt(index, color.set(swatch));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [strands]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, strands.length]} receiveShadow>
      <boxGeometry args={[1, 0.006, 0.012]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
}

/**
 * Sürgülü kapının yeri. Açık bölmenin kapısı komşu bölmenin önüne sürülür:
 * kamera bölmeden koridora ön yüzün `|x| < halfLength` kısmından geçer
 * (`stable-layout.spec.ts`), kapı orada dursaydı kamera içinden geçerdi.
 */
function doorPlacement(center: number, open: boolean): { x: number; z: number } {
  return open
    ? { x: center + bayLength / 2 + stall.doorHalfWidth + 0.05, z: stall.halfDepth + 0.11 }
    : { x: center, z: stall.halfDepth + 0.07 };
}

/** Bir bölme sırasının parmaklıkları (ara duvar üstü + kapalı kapılar). Sıra yerel çerçevede: ön yüz +Z. */
function rowBars(openBayX: number | null): Array<{ x: number; z: number; bottom: number; top: number }> {
  const bars: Array<{ x: number; z: number; bottom: number; top: number }> = [];
  for (const x of partitionLinesX()) {
    for (let z = barn.backZ + 0.12; z < stall.halfDepth - 0.08; z += BAR_SPACING) {
      bars.push({ x, z, bottom: stall.partitionSolidHeight, top: stall.partitionHeight });
    }
  }
  for (const center of bayCentersX()) {
    const { x: doorX, z: doorZ } = doorPlacement(center, center === openBayX);
    for (let x = doorX - stall.doorHalfWidth + 0.08; x < doorX + stall.doorHalfWidth - 0.06; x += 0.11) {
      bars.push({ x, z: doorZ, bottom: 1.25, top: 2.25 });
    }
  }
  return bars;
}

/**
 * Bir bölme sırası (ara duvarlar, ön tahtalar, direkler, kapılar, zemin
 * samanı). `openBayX` verilirse o bölmenin kapısı açıktır (oyuncunun bölmesi).
 */
function StallRow({
  textures,
  openBayX,
  castShadow,
}: {
  textures: StableTextures;
  openBayX: number | null;
  castShadow: boolean;
}): React.ReactElement {
  const bars = useMemo(() => rowBars(openBayX), [openBayX]);
  const halfBay = bayLength / 2;
  const depth = stall.halfDepth - barn.backZ;
  const midZ = (stall.halfDepth + barn.backZ) / 2;
  const segmentLength = halfBay - stall.doorHalfWidth;
  return (
    <group>
      {bayCentersX().map((center) => {
        const open = center === openBayX;
        const { x: doorX, z: doorZ } = doorPlacement(center, open);
        return (
          <group key={center}>
            {/* Komşu bölmelerin saman yatağı (oyuncununki ayrıca, daha ayrıntılı). */}
            {open ? null : (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center, 0.01, midZ]} receiveShadow>
                <planeGeometry args={[bayLength - 0.2, depth - 0.2]} />
                <meshStandardMaterial map={textures.straw} color="#cdb27a" roughness={1} />
              </mesh>
            )}
            {/* Ön tahta: kapının iki yanında, alçak. */}
            {[-1, 1].map((side) => (
              <Box
                key={side}
                size={[segmentLength, stall.frontBoardHeight, 0.06]}
                position={[
                  center + side * (stall.doorHalfWidth + segmentLength / 2),
                  stall.frontBoardHeight / 2,
                  stall.halfDepth,
                ]}
                map={textures.boardWood}
                castShadow={castShadow}
              />
            ))}
            {/*
              Kapı direkleri + üst kuşak + sürgü rayı. Oyuncunun bölmesinde
              kapı aralığı açıktır (direk kısa, kuşak/ray yok): kamera atı
              koridordan bu aralıktan görür, üst kuşak kadrajı ikiye bölüyordu.
            */}
            {[-1, 1].map((side) => {
              const postHeight = open ? stall.frontBoardHeight + 0.3 : stall.partitionHeight;
              return (
                <Box
                  key={`post${side}`}
                  size={[0.1, postHeight, 0.12]}
                  position={[center + side * stall.doorHalfWidth, postHeight / 2, stall.halfDepth]}
                  map={textures.beamWood}
                  castShadow={castShadow}
                />
              );
            })}
            {open ? null : (
              <>
                <Box
                  size={[bayLength, 0.12, 0.12]}
                  position={[center, stall.partitionHeight, stall.halfDepth]}
                  map={textures.beamWood}
                  castShadow={castShadow}
                />
                <Box
                  size={[bayLength, 0.04, 0.05]}
                  position={[center, stall.partitionHeight + 0.1, stall.halfDepth + 0.1]}
                  color="#3a3c3e"
                  roughness={0.4}
                  metalness={0.8}
                />
              </>
            )}
            {/* Sürgülü kapı: alt yarısı tahta, üstü parmaklık (parmaklıklar `IronBars`ta). */}
            <Box
              size={[stall.doorHalfWidth * 2, 1.15, 0.05]}
              position={[doorX, 0.675, doorZ]}
              map={textures.boardWood}
              color="#8a6440"
              castShadow={castShadow}
            />
            <Box
              size={[stall.doorHalfWidth * 2, 0.06, 0.06]}
              position={[doorX, 2.25, doorZ]}
              color="#2d2f31"
              roughness={0.45}
              metalness={0.75}
            />
            {[-1, 1].map((side) => (
              <Box
                key={`doorframe${side}`}
                size={[0.05, 1.0, 0.06]}
                position={[doorX + side * (stall.doorHalfWidth - 0.025), 1.75, doorZ]}
                color="#2d2f31"
                roughness={0.45}
                metalness={0.75}
              />
            ))}
          </group>
        );
      })}
      {/* Ara duvarlar: alt yarısı kalın tahta, üstü parmaklık. */}
      {partitionLinesX().map((x) => (
        <group key={x}>
          <Box
            size={[0.07, stall.partitionSolidHeight, depth]}
            position={[x, stall.partitionSolidHeight / 2, midZ]}
            map={textures.boardWood}
            castShadow={castShadow}
          />
          <Box
            size={[0.1, 0.08, depth]}
            position={[x, stall.partitionHeight, midZ]}
            map={textures.beamWood}
            castShadow={castShadow}
          />
          <Box
            size={[0.08, 0.06, depth]}
            position={[x, stall.partitionSolidHeight + 0.03, midZ]}
            color="#2d2f31"
            roughness={0.45}
            metalness={0.75}
          />
          {/* Taşıyıcı direk: ön yüzden saçağa. */}
          <Box
            size={[0.18, barn.eaveHeight, 0.18]}
            position={[x, barn.eaveHeight / 2, stall.halfDepth]}
            map={textures.beamWood}
            castShadow={castShadow}
          />
        </group>
      ))}
      <IronBars bars={bars} castShadow={castShadow} />
    </group>
  );
}

/** Pencereli uzun dış duvar (bölme başına bir pencere; ışık boşluktan girer). */
function WindowedWall({
  z,
  textures,
  castShadow,
}: {
  z: number;
  textures: StableTextures;
  castShadow: boolean;
}): React.ReactElement {
  const thickness = 0.14;
  const sideWidth = bayLength / 2 - WINDOW.halfWidth;
  const windowHeight = WINDOW.top - WINDOW.bottom;
  const outward = z < aisle.minZ ? -1 : 1;
  return (
    <group>
      {bayCentersX().map((center) => (
        <group key={center}>
          <Box
            size={[bayLength, WINDOW.bottom, thickness]}
            position={[center, WINDOW.bottom / 2, z]}
            map={textures.barnWood}
            castShadow={castShadow}
          />
          <Box
            size={[bayLength, barn.eaveHeight - WINDOW.top, thickness]}
            position={[center, (barn.eaveHeight + WINDOW.top) / 2, z]}
            map={textures.barnWood}
            castShadow={castShadow}
          />
          {[-1, 1].map((side) => (
            <Box
              key={side}
              size={[sideWidth, windowHeight, thickness]}
              position={[center + side * (WINDOW.halfWidth + sideWidth / 2), (WINDOW.top + WINDOW.bottom) / 2, z]}
              map={textures.barnWood}
              castShadow={castShadow}
            />
          ))}
          {/* Pencere: dış manzara (ışıksız, parlak) + kayıt + orta kayıt. */}
          <mesh position={[center, (WINDOW.top + WINDOW.bottom) / 2, z + outward * 0.09]}>
            <planeGeometry args={[WINDOW.halfWidth * 2, windowHeight]} />
            <meshBasicMaterial map={textures.view} color="#ffffff" side={THREE.DoubleSide} fog={false} />
          </mesh>
          <Box
            size={[0.06, windowHeight, 0.06]}
            position={[center, (WINDOW.top + WINDOW.bottom) / 2, z]}
            color="#3b2a1c"
          />
          <Box
            size={[WINDOW.halfWidth * 2, 0.05, 0.06]}
            position={[center, (WINDOW.top + WINDOW.bottom) / 2, z]}
            color="#3b2a1c"
          />
          <Box
            size={[WINDOW.halfWidth * 2 + 0.2, 0.08, 0.22]}
            position={[center, WINDOW.bottom - 0.04, z - outward * 0.04]}
            map={textures.beamWood}
          />
        </group>
      ))}
    </group>
  );
}

function GableTriangle({ x, textures }: { x: number; textures: StableTextures }): React.ReactElement {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(barn.backZ, barn.eaveHeight);
    s.lineTo(barn.farZ, barn.eaveHeight);
    s.lineTo(barn.ridgeZ, barn.ridgeHeight);
    s.closePath();
    return s;
  }, []);
  return (
    <mesh position={[x, 0, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial map={textures.roofWood} color="#9a7a5c" side={THREE.DoubleSide} roughness={0.9} />
    </mesh>
  );
}

/** Bina: zemin, dış duvarlar, uç duvarlar (+X ucunda açık kapı), çatı, makaslar. */
function BarnShell({
  textures,
  castShadow,
}: {
  textures: StableTextures;
  castShadow: boolean;
}): React.ReactElement {
  const width = barn.maxX - barn.minX;
  const span = barn.farZ - barn.backZ;
  const rise = barn.ridgeHeight - barn.eaveHeight;
  const halfSpanBack = barn.ridgeZ - barn.backZ;
  const halfSpanFar = barn.farZ - barn.ridgeZ;
  const slopeBack = Math.atan2(rise, halfSpanBack);
  const slopeFar = Math.atan2(rise, halfSpanFar);
  const slopeLengthBack = Math.hypot(rise, halfSpanBack);
  const slopeLengthFar = Math.hypot(rise, halfSpanFar);
  const trussXs = trussLinesX();
  const purlinZs = [barn.backZ + halfSpanBack / 3, barn.backZ + (2 * halfSpanBack) / 3, barn.ridgeZ + halfSpanFar / 3, barn.ridgeZ + (2 * halfSpanFar) / 3];
  return (
    <group>
      {/* Beton zemin (koridor + bölmelerin altı). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (barn.backZ + barn.farZ) / 2]} receiveShadow>
        <planeGeometry args={[width, span]} />
        <meshStandardMaterial map={textures.concrete} color="#b7afa3" roughness={0.95} />
      </mesh>
      {/* Koridor ortasında pis su kanalı. */}
      <Box size={[width, 0.012, 0.16]} position={[0, 0.006, (aisle.minZ + aisle.maxZ) / 2]} color="#3a3a38" roughness={0.5} metalness={0.6} />

      <WindowedWall z={barn.backZ} textures={textures} castShadow={castShadow} />
      <WindowedWall z={barn.farZ} textures={textures} castShadow={castShadow} />

      {/* -X ucu: kapalı duvar. */}
      <Box size={[0.14, barn.eaveHeight, span]} position={[barn.minX, barn.eaveHeight / 2, (barn.backZ + barn.farZ) / 2]} map={textures.barnWood} castShadow={castShadow} />
      <GableTriangle x={barn.minX} textures={textures} />
      {/* +X ucu: koridor hizasında açık büyük kapı. */}
      <Box size={[0.14, barn.eaveHeight, door.minZ - barn.backZ]} position={[barn.maxX, barn.eaveHeight / 2, (barn.backZ + door.minZ) / 2]} map={textures.barnWood} castShadow={castShadow} />
      <Box size={[0.14, barn.eaveHeight, barn.farZ - door.maxZ]} position={[barn.maxX, barn.eaveHeight / 2, (door.maxZ + barn.farZ) / 2]} map={textures.barnWood} castShadow={castShadow} />
      <Box size={[0.14, barn.eaveHeight - door.height, door.maxZ - door.minZ]} position={[barn.maxX, (barn.eaveHeight + door.height) / 2, (door.minZ + door.maxZ) / 2]} map={textures.barnWood} castShadow={castShadow} />
      <GableTriangle x={barn.maxX} textures={textures} />
      {/* Kenara sürülmüş ahır kapısı (dışarıda, kırmızı, çapraz kuşaklı). */}
      <group position={[barn.maxX + 0.14, 0, door.minZ - (door.maxZ - door.minZ) / 2]}>
        <Box size={[0.08, door.height, door.maxZ - door.minZ]} position={[0, door.height / 2, 0]} color="#7c2b22" roughness={0.8} castShadow={castShadow} />
        <Beam from={[0.06, 0.2, -(door.maxZ - door.minZ) / 2 + 0.1]} to={[0.06, door.height - 0.2, (door.maxZ - door.minZ) / 2 - 0.1]} width={0.03} height={0.14} color="#efe6d6" />
      </group>

      {/* Beşik çatı (iç yüzü ahşap). */}
      <mesh
        position={[0, (barn.eaveHeight + barn.ridgeHeight) / 2 + ROOF_THICKNESS, (barn.backZ + barn.ridgeZ) / 2]}
        rotation={[-slopeBack, 0, 0]}
        castShadow={castShadow}
        receiveShadow
      >
        <boxGeometry args={[width + 0.6, ROOF_THICKNESS, slopeLengthBack + 0.4]} />
        <meshStandardMaterial map={textures.roofWood} color="#a08566" roughness={0.9} />
      </mesh>
      <mesh
        position={[0, (barn.eaveHeight + barn.ridgeHeight) / 2 + ROOF_THICKNESS, (barn.ridgeZ + barn.farZ) / 2]}
        rotation={[slopeFar, 0, 0]}
        castShadow={castShadow}
        receiveShadow
      >
        <boxGeometry args={[width + 0.6, ROOF_THICKNESS, slopeLengthFar + 0.4]} />
        <meshStandardMaterial map={textures.roofWood} color="#a08566" roughness={0.9} />
      </mesh>

      {/* Makaslar: gergi kirişi, orta dikme, mertekler, payandalar. */}
      {trussXs.map((x) => (
        <group key={x}>
          <Box size={[0.16, 0.24, span]} position={[x, barn.eaveHeight - 0.12, (barn.backZ + barn.farZ) / 2]} map={textures.beamWood} castShadow={castShadow} />
          <Box size={[0.16, rise - 0.2, 0.16]} position={[x, barn.eaveHeight + (rise - 0.2) / 2, barn.ridgeZ]} map={textures.beamWood} castShadow={castShadow} />
          <Beam from={[x, barn.eaveHeight - 0.05, barn.backZ]} to={[x, barn.ridgeHeight - 0.12, barn.ridgeZ]} width={0.14} height={0.2} map={textures.beamWood} castShadow={castShadow} />
          <Beam from={[x, barn.ridgeHeight - 0.12, barn.ridgeZ]} to={[x, barn.eaveHeight - 0.05, barn.farZ]} width={0.14} height={0.2} map={textures.beamWood} castShadow={castShadow} />
          {[barn.backZ + halfSpanBack / 2, barn.ridgeZ + halfSpanFar / 2].map((z) => (
            <Beam key={z} from={[x, barn.eaveHeight + 0.05, barn.ridgeZ]} to={[x, roofHeightAt(z) - 0.2, z]} width={0.1} height={0.12} map={textures.beamWood} />
          ))}
        </group>
      ))}
      {/* Aşıklar + mahya kirişi (X boyunca). */}
      {[...purlinZs, barn.ridgeZ].map((z) => (
        <Box key={z} size={[width, 0.16, 0.16]} position={[0, roofHeightAt(z) - 0.16, z]} map={textures.beamWood} />
      ))}
      {/* Arka duvarlarda direkler (rölyef). */}
      {partitionLinesX().map((x) => (
        <group key={`wallpost${x}`}>
          <Box size={[0.18, barn.eaveHeight, 0.12]} position={[x, barn.eaveHeight / 2, barn.backZ + 0.12]} map={textures.beamWood} />
          <Box size={[0.18, barn.eaveHeight, 0.12]} position={[x, barn.eaveHeight / 2, barn.farZ - 0.12]} map={textures.beamWood} />
        </group>
      ))}
    </group>
  );
}

/** Koridor üstünde asma lamba (kablo + emaye abajur + akkor ampul). Işığı `StableScene3D` verir. */
function HangingLamp({ position }: { position: Vec3 }): React.ReactElement {
  const [x, bottom, z] = position;
  return (
    <group>
      <Beam from={[x, bottom + 0.12, z]} to={[x, roofHeightAt(z) - 0.1, z]} width={0.012} height={0.012} color="#111111" />
      <mesh position={[x, bottom + 0.06, z]}>
        <coneGeometry args={[0.3, 0.2, 20, 1, true]} />
        <meshStandardMaterial color="#2f4a3a" roughness={0.4} metalness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[x, bottom, z]}>
        <sphereGeometry args={[0.07, 14, 10]} />
        <meshStandardMaterial color="#fff2d0" emissive="#ffc777" emissiveIntensity={3} />
      </mesh>
    </group>
  );
}

/** Pencereden içeri düşen ışık hüzmesi (saydam, toplamalı). */
function LightShaft({ x }: { x: number }): React.ReactElement {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(x, (WINDOW.top + WINDOW.bottom) / 2, barn.backZ);
    const sun = new THREE.Vector3(...STABLE_SUN_POSITION);
    const direction = new THREE.Vector3(0, 0, 0).sub(sun).normalize();
    const travel = start.y / -direction.y;
    const end = start.clone().addScaledVector(direction, travel);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    return { position: start.add(end).multiplyScalar(0.5), quaternion: q, length: travel };
  }, [x]);
  return (
    <mesh position={position} quaternion={quaternion}>
      <boxGeometry args={[WINDOW.halfWidth * 2, (WINDOW.top - WINDOW.bottom) * 0.8, length]} />
      <meshBasicMaterial
        color="#ffe6b8"
        transparent
        opacity={0.06}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        fog={false}
      />
    </mesh>
  );
}

/** Oyuncunun bölmesinin içi: saman yatak, yemlik, suluk, tuz taşı, battaniye, isim levhası. */
function OwnStallInterior({
  textures,
  horseName,
  detail,
  castShadow,
}: {
  textures: StableTextures;
  horseName: string;
  detail: StableDetail;
  castShadow: boolean;
}): React.ReactElement {
  const nameplate = useMemo(() => createNameplateTexture(horseName), [horseName]);
  useEffect(() => () => nameplate?.dispose(), [nameplate]);
  const { halfLength, halfDepth } = stall;
  const backZ = barn.backZ;
  return (
    <group>
      {/* Kauçuk paspas + saman yatak + duvar diplerinde saman yığını. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <planeGeometry args={[halfLength * 2 - 0.1, halfDepth * 2 - 0.1]} />
        <meshStandardMaterial color="#2c2723" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, -0.05]} receiveShadow>
        <planeGeometry args={[halfLength * 2 - 0.2, halfDepth * 2 - 0.3]} />
        <meshStandardMaterial map={textures.straw} color="#e2c486" roughness={1} />
      </mesh>
      {/* Arka duvar dibine itilmiş saman (alçak set). */}
      <mesh position={[0, 0.01, backZ + 0.28]} scale={[2.1, 0.16, 0.3]} receiveShadow>
        <sphereGeometry args={[1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial map={textures.straw} color="#e8cc8e" roughness={1} />
      </mesh>
      <StrawStrands count={STRAW_COUNT[detail]} />

      {/* Köşe yemliği: demir çubuklu raf + içinde kuru ot + altında yem teknesi. */}
      <group>
        {[1.05, 1.35, 1.65].map((y) => (
          <Beam key={y} from={[halfLength - 0.02, y, backZ + 0.75]} to={[halfLength - 0.8, y, backZ + 0.02]} width={0.025} height={0.025} color="#2d2f31" metalness={0.75} roughness={0.45} />
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((t) => (
          <Beam
            key={t}
            from={[halfLength - 0.02 - t * 0.78, 1.0, backZ + 0.75 - t * 0.73]}
            to={[halfLength - 0.02 - t * 0.78, 1.7, backZ + 0.75 - t * 0.73]}
            width={0.02}
            height={0.02}
            color="#2d2f31"
            metalness={0.75}
            roughness={0.45}
          />
        ))}
        <mesh position={[halfLength - 0.35, 1.45, backZ + 0.33]} scale={[0.42, 0.32, 0.38]} castShadow={castShadow}>
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial map={textures.straw} color="#b8b070" roughness={1} />
        </mesh>
        <mesh position={[halfLength - 0.4, 0.78, backZ + 0.36]} castShadow={castShadow}>
          <cylinderGeometry args={[0.24, 0.19, 0.24, 20]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.7} />
        </mesh>
      </group>

      {/* Otomatik suluk: galvaniz çanak + boru. */}
      <group position={[-halfLength + 0.22, 0, backZ + 0.24]}>
        <mesh position={[0, 0.92, 0]} castShadow={castShadow}>
          <cylinderGeometry args={[0.17, 0.12, 0.14, 20]} />
          <meshStandardMaterial color="#9aa1a6" roughness={0.3} metalness={0.85} />
        </mesh>
        <Beam from={[-0.05, 0.98, -0.1]} to={[-0.05, stall.partitionHeight, -0.1]} width={0.035} height={0.035} color="#8d9398" metalness={0.8} roughness={0.35} />
      </group>

      {/* Tuz taşı tutucusu (arka duvar). */}
      <Box size={[0.2, 0.14, 0.1]} position={[-0.9, 1.15, backZ + 0.13]} color="#5d6266" metalness={0.6} roughness={0.4} />
      <Box size={[0.16, 0.12, 0.08]} position={[-0.9, 1.2, backZ + 0.15]} color="#e9d4cf" roughness={0.9} />

      {/* Ön tahtanın üstüne serilmiş at battaniyesi. */}
      <group position={[-(stall.doorHalfWidth + (halfLength - stall.doorHalfWidth) / 2), 0, halfDepth]}>
        <Box size={[1.45, 0.52, 0.03]} position={[0, stall.frontBoardHeight - 0.28, 0.05]} color="#1f2f5a" roughness={0.9} castShadow={castShadow} />
        <Box size={[1.45, 0.52, 0.03]} position={[0, stall.frontBoardHeight - 0.28, -0.05]} color="#1f2f5a" roughness={0.9} />
        <Box size={[1.45, 0.035, 0.13]} position={[0, stall.frontBoardHeight + 0.01, 0]} color="#1f2f5a" roughness={0.9} />
        <Box size={[1.45, 0.045, 0.034]} position={[0, stall.frontBoardHeight - 0.42, 0.052]} color="#c9a227" roughness={0.6} />
      </group>

      {/* Bölmeye giriş kayışı (kapı açık). */}
      <Box size={[stall.doorHalfWidth * 2 - 0.1, 0.09, 0.02]} position={[0, 1.12, halfDepth + 0.02]} color="#a8322b" roughness={0.7} />

      {/* Ön tahtada pirinç isim levhası — atın gerçek adı. */}
      {nameplate ? (
        <mesh position={[stall.doorHalfWidth + (halfLength - stall.doorHalfWidth) / 2, 0.72, halfDepth + 0.035]}>
          <planeGeometry args={[0.72, 0.18]} />
          <meshStandardMaterial map={nameplate} roughness={0.35} metalness={0.55} />
        </mesh>
      ) : null}
    </group>
  );
}

/** Koridor: el arabası, saman balyaları, kovalar, eyer askısı, yular, yaba, sandık. */
function AisleProps({
  textures,
  castShadow,
}: {
  textures: StableTextures;
  castShadow: boolean;
}): React.ReactElement {
  const front = stall.halfDepth;
  return (
    <group>
      {/* El arabası. */}
      <group position={[6.4, 0, 3.4]} rotation={[0, 0.5, 0]}>
        <mesh position={[0, 0.55, 0]} rotation={[0, Math.PI / 4, 0]} castShadow={castShadow}>
          <cylinderGeometry args={[0.5, 0.32, 0.34, 4]} />
          <meshStandardMaterial color="#2f5d3a" roughness={0.55} metalness={0.4} />
        </mesh>
        <mesh position={[0.62, 0.2, 0]} castShadow={castShadow}>
          <torusGeometry args={[0.16, 0.055, 10, 24]} />
          <meshStandardMaterial color="#151515" roughness={0.8} />
        </mesh>
        {[-0.22, 0.22].map((z) => (
          <group key={z}>
            <Beam from={[0.6, 0.22, z * 0.4]} to={[-0.95, 0.62, z]} width={0.04} height={0.04} color="#5b3f28" />
            <Beam from={[-0.25, 0.4, z]} to={[-0.3, 0, z]} width={0.035} height={0.035} color="#3a3c3e" metalness={0.6} />
          </group>
        ))}
      </group>

      {/* Saman balyaları (karşı sıranın önünde, -X tarafı). */}
      {(
        [
          [-6.0, 0.24, 6.1, 0],
          [-4.95, 0.24, 6.1, 0],
          [-5.5, 0.72, 6.12, 0.06],
          [-6.3, 0.24, 5.4, Math.PI / 2],
        ] as Array<[number, number, number, number]>
      ).map(([x, y, z, rotation]) => (
        <group key={`${x}-${y}-${z}`} position={[x, y, z]} rotation={[0, rotation, 0]}>
          <Box size={[1.0, 0.46, 0.48]} position={[0, 0, 0]} map={textures.straw} color="#e2c484" roughness={1} castShadow={castShadow} />
          {[-0.25, 0.25].map((offset) => (
            <Box key={offset} size={[0.02, 0.47, 0.49]} position={[offset, 0, 0]} color="#5a3a1c" />
          ))}
        </group>
      ))}

      {/* Kovalar (oyuncunun bölme kapısının önünde). */}
      {(
        [
          [-0.2, front + 0.45, '#2b4f8a'],
          [0.25, front + 0.6, '#8a2b2b'],
        ] as Array<[number, number, string]>
      ).map(([x, z, color]) => (
        <mesh key={x} position={[x, 0.17, z]} castShadow={castShadow}>
          <cylinderGeometry args={[0.17, 0.13, 0.34, 18]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}

      {/* Eyer askısı (sol direk) + eyer + eyer altlığı + üzengi. */}
      <group position={[-stall.halfLength, 0, front]}>
        <Beam from={[0, 1.2, 0.1]} to={[0, 1.2, 0.62]} width={0.06} height={0.06} color="#3a3c3e" metalness={0.6} />
        <mesh position={[0, 1.27, 0.38]} rotation={[Math.PI / 2, 0, 0]} castShadow={castShadow}>
          <cylinderGeometry args={[0.2, 0.2, 0.55, 16, 1, false, -Math.PI / 2, Math.PI]} />
          <meshStandardMaterial color="#5a2f1a" roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        <Box size={[0.5, 0.36, 0.58]} position={[0, 1.13, 0.38]} color="#2b3f6e" roughness={0.9} />
        <mesh position={[0.22, 0.86, 0.36]}>
          <torusGeometry args={[0.06, 0.012, 8, 16]} />
          <meshStandardMaterial color="#b9bec2" metalness={0.85} roughness={0.3} />
        </mesh>
      </group>

      {/* Yular + bağlama ipi (sağ direkte) ve kapı direğinde yular. */}
      <group position={[stall.halfLength + 0.1, 1.7, front + 0.12]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.12, 0.014, 8, 24]} />
          <meshStandardMaterial color="#3d2416" roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.18, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.2, 0.01, 8, 28]} />
          <meshStandardMaterial color="#3d2416" roughness={0.6} />
        </mesh>
      </group>

      {/* Yaba (sağ direğe yaslı). */}
      <group>
        <Beam from={[stall.halfLength + 0.32, 0.03, front + 0.42]} to={[stall.halfLength + 0.16, 1.45, front + 0.14]} width={0.03} height={0.03} color="#8a6440" castShadow={castShadow} />
        {[-0.06, 0, 0.06].map((offset) => (
          <Beam
            key={offset}
            from={[stall.halfLength + 0.32 + offset, 0.03, front + 0.42]}
            to={[stall.halfLength + 0.3 + offset, 0.3, front + 0.37]}
            width={0.012}
            height={0.012}
            color="#9aa1a6"
            metalness={0.8}
          />
        ))}
      </group>

      {/* Takım sandığı (karşı sıranın önü, +X tarafı). */}
      <group position={[5.6, 0, aisle.maxZ - 0.35]}>
        <Box size={[1.0, 0.5, 0.48]} position={[0, 0.25, 0]} map={textures.boardWood} color="#9b6b3e" castShadow={castShadow} />
        <Box size={[1.04, 0.05, 0.52]} position={[0, 0.52, 0]} color="#3a3c3e" metalness={0.6} roughness={0.4} />
      </group>
    </group>
  );
}

/** Koridor ucundaki kapıdan görünen dışarısı: padok, beyaz çit, ağaçlar, gökyüzü. */
function Outdoors({
  textures,
  detail,
}: {
  textures: StableTextures;
  detail: StableDetail;
}): React.ReactElement {
  const fenceX = barn.maxX + 9;
  const posts = Array.from({ length: 16 }, (_, i) => -14 + i * 2.6);
  const trees =
    detail === 'high'
      ? [
          [barn.maxX + 22, -6, 1.1],
          [barn.maxX + 27, 3, 1.4],
          [barn.maxX + 24, 12, 1.2],
          [barn.maxX + 32, 8, 1.6],
          [barn.maxX + 30, -2, 1.3],
        ]
      : [];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[barn.maxX + 40, -0.01, 4]}>
        <planeGeometry args={[80, 90]} />
        <meshStandardMaterial color="#6f8f4f" roughness={1} fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[barn.maxX + 4, 0.0, (door.minZ + door.maxZ) / 2]}>
        <planeGeometry args={[8, door.maxZ - door.minZ + 1]} />
        <meshStandardMaterial color="#a39276" roughness={1} fog={false} />
      </mesh>
      {posts.map((z) => (
        <mesh key={z} position={[fenceX, 0.65, z]}>
          <boxGeometry args={[0.14, 1.3, 0.14]} />
          <meshStandardMaterial color="#ece6da" roughness={0.7} fog={false} />
        </mesh>
      ))}
      {[0.55, 1.1].map((y) => (
        <mesh key={y} position={[fenceX, y, 5.5]}>
          <boxGeometry args={[0.06, 0.12, 40]} />
          <meshStandardMaterial color="#ece6da" roughness={0.7} fog={false} />
        </mesh>
      ))}
      {trees.map(([x, z, scale]) => (
        <group key={`${x}-${z}`} position={[x!, 0, z!]} scale={scale}>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.18, 0.26, 2.8, 8]} />
            <meshStandardMaterial color="#5b4330" roughness={1} fog={false} />
          </mesh>
          <mesh position={[0, 3.6, 0]}>
            <icosahedronGeometry args={[1.6, 1]} />
            <meshStandardMaterial color="#4f6b3e" roughness={1} flatShading fog={false} />
          </mesh>
          <mesh position={[0.6, 4.4, 0.3]}>
            <icosahedronGeometry args={[1.1, 1]} />
            <meshStandardMaterial color="#5d7a47" roughness={1} flatShading fog={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[barn.maxX + 70, 18, 4]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[220, 60]} />
        <meshBasicMaterial map={textures.view} color="#ffffff" fog={false} />
      </mesh>
    </group>
  );
}

export interface PlaceholderStallProps {
  castShadow: boolean;
  /** Sahnedeki atın adı (isim levhası). */
  horseName?: string;
  /** Kalite kademesi: 'low' saman telini azaltır, toz zerreciklerini ve dış ağaçları kapatır. */
  detail?: StableDetail;
}

export function PlaceholderStall({
  castShadow,
  horseName = '',
  detail = 'high',
}: PlaceholderStallProps): React.ReactElement {
  const textures = useStableTextures();
  return (
    <group>
      <BarnShell textures={textures} castShadow={castShadow} />
      <StallRow textures={textures} openBayX={0} castShadow={castShadow} />
      {/* Karşı sıra: aynı sıra, koridorun öbür yanında aynalanmış (ön yüzü -Z). */}
      <group position={[0, 0, aisle.maxZ + stall.halfDepth]} rotation={[0, Math.PI, 0]}>
        <StallRow textures={textures} openBayX={null} castShadow={castShadow} />
      </group>
      <OwnStallInterior textures={textures} horseName={horseName} detail={detail} castShadow={castShadow} />
      <AisleProps textures={textures} castShadow={castShadow} />
      {STABLE_LAMPS.map((position) => (
        <HangingLamp key={position[0]} position={position} />
      ))}
      <LightShaft x={0} />
      {detail === 'high' ? (
        <>
          <LightShaft x={-bayLength} />
          <LightShaft x={bayLength} />
          {/* Işık hüzmesinde süzülen toz zerrecikleri. */}
          <Sparkles
            position={[-0.3, 1.5, -0.4]}
            scale={[1.8, 2.6, 2.6]}
            count={70}
            size={1.4}
            speed={0.18}
            opacity={0.55}
            color="#fff1cf"
            noise={0.6}
          />
        </>
      ) : null}
      <Outdoors textures={textures} detail={detail} />
    </group>
  );
}
