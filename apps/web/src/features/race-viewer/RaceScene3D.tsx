'use client';

/**
 * Three.js sahnesi — `docs/ARCHITECTURE.md` §5 "3D/Görsel katman": bu
 * modül SADECE zaten hesaplanmış (Race Engine çıktısı, `RaceTimeline`)
 * pozisyonları render eder, hiçbir simülasyon mantığı içermez
 * (`docs/RACE_ENGINE.md` §1 ilkesi).
 *
 * FAZ 6 kapsamı — "basit şekillerle iskelet" (bkz. proje sahibinin FAZ 6
 * kapsam kararı, bu oturum): gerçek 3D at/jokey modelleri, animasyonlar,
 * seyirci (crowd), hava efektleri (VFX) ve ses BİLİNÇLİ OLARAK bu
 * dosyanın kapsamı DIŞINDADIR (bkz. README.md "Kapsam dışı"). Bunun
 * yerine basit geometrik şekiller (kapsül gövde + küre "jokey" başı)
 * kullanılır; ileride gerçek modeller eklendiğinde sadece `HorseMarker`
 * bileşeninin içeriği değişir, `RaceViewer`/`RaceHud` arayüzü aynı kalır.
 *
 * ÖNEMLİ (bkz. `docs/ARCHITECTURE.md` §9): bu dosya `three` ve
 * `@react-three/fiber`'a bağımlı olduğu için, bu geliştirme ortamında
 * (npm registry erişimi kısıtlı) YEREL OLARAK derlenip doğrulanamamıştır.
 * Yapısal olarak doğru yazılmıştır; gerçek doğrulama GitHub Actions CI'da
 * (`npm install` + `npm run typecheck`/`build`, tam registry erişimiyle)
 * gerçekleşir.
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getHorseTrackPosition, type StadiumTrackGeometry } from './track-path';
import type { CameraPose } from './camera-presets';

export interface HorseVisual {
  horseId: string;
  x: number;
  z: number;
  headingRadians: number;
  color: string;
  isLeader: boolean;
}

export interface RaceScene3DProps {
  horses: HorseVisual[];
  cameraPose: CameraPose;
  trackGeometry: StadiumTrackGeometry;
}

const TRACK_TILE_COUNT = 96;
const TRACK_TILE_WIDTH_METERS = 18;
const TRACK_TILE_LENGTH_METERS = 6;
const TRACK_TURN_COUNT_FOR_VISUAL = 2;
const CAMERA_LERP_FACTOR = 0.06;
const GROUND_SIZE_METERS = 1200;

export function RaceScene3D({ horses, cameraPose, trackGeometry }: RaceScene3DProps): React.ReactElement {
  return (
    <Canvas shadows camera={{ fov: 50, near: 0.5, far: 2000 }}>
      <color attach="background" args={['#0b1220']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[80, 120, 40]} intensity={1.1} castShadow />
      <Ground />
      <TrackSurface geometry={trackGeometry} />
      {horses.map((horse) => (
        <HorseMarker key={horse.horseId} horse={horse} />
      ))}
      <CameraRig pose={cameraPose} />
    </Canvas>
  );
}

function Ground(): React.ReactElement {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE_METERS, GROUND_SIZE_METERS]} />
      <meshStandardMaterial color="#1c3a24" />
    </mesh>
  );
}

function TrackSurface({ geometry }: { geometry: StadiumTrackGeometry }): React.ReactElement {
  const tiles = useMemo(() => {
    const result: Array<{ x: number; z: number; rotationY: number }> = [];
    if (geometry.lapLengthMeters <= 0) {
      return result;
    }
    for (let i = 0; i < TRACK_TILE_COUNT; i += 1) {
      const distance = (i / TRACK_TILE_COUNT) * geometry.lapLengthMeters;
      const point = getHorseTrackPosition(distance, TRACK_TURN_COUNT_FOR_VISUAL, geometry);
      result.push({ x: point.x, z: point.z, rotationY: -point.headingRadians });
    }
    return result;
  }, [geometry]);

  return (
    <group>
      {tiles.map((tile, index) => (
        <mesh key={index} position={[tile.x, 0, tile.z]} rotation={[0, tile.rotationY, 0]} receiveShadow>
          <boxGeometry args={[TRACK_TILE_LENGTH_METERS, 0.05, TRACK_TILE_WIDTH_METERS]} />
          <meshStandardMaterial color="#8a6b45" />
        </mesh>
      ))}
    </group>
  );
}

function HorseMarker({ horse }: { horse: HorseVisual }): React.ReactElement {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const bob = Math.sin(clock.elapsedTime * 6 + horse.x) * 0.05;
    group.position.set(horse.x, 0.55 + bob, horse.z);
    group.rotation.y = -horse.headingRadians;
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <capsuleGeometry args={[0.35, 1.1, 4, 8]} />
        <meshStandardMaterial color={horse.color} />
      </mesh>
      <mesh position={[0, 0.75, 0.15]} castShadow>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#f5f7fa" />
      </mesh>
      {horse.isLeader ? (
        <mesh position={[0, 1.3, 0]}>
          <coneGeometry args={[0.15, 0.3, 8]} />
          <meshStandardMaterial color="#e3b341" emissive="#e3b341" emissiveIntensity={0.4} />
        </mesh>
      ) : null}
    </group>
  );
}

function CameraRig({ pose }: { pose: CameraPose }): null {
  const { camera } = useThree();
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const currentLookAt = useRef(new THREE.Vector3());

  useFrame(() => {
    targetPosition.current.set(pose.position.x, pose.position.y, pose.position.z);
    targetLookAt.current.set(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    camera.position.lerp(targetPosition.current, CAMERA_LERP_FACTOR);
    currentLookAt.current.lerp(targetLookAt.current, CAMERA_LERP_FACTOR);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
