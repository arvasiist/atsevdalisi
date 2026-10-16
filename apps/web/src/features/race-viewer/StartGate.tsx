'use client';

/**
 * START KAPISI (01.10.2026, 3D adım 8).
 *
 * Atlar yarış başında (mesafe 0) kendi bölmelerinde durur; `open` olunca ön
 * kapılar `vfx.config.json` → `startGate.openSeconds` içinde açılır. Bölmeler
 * `RaceScene3D`nin şerit ofsetleriyle AYNI yanal konumdadır (atlar bölmenin
 * tam ortasında). `start-gate.glb` varsa yüksekliğe uydurulup konur ve
 * manifestteki `open` klibi oynatılır; yoksa prosedürel kapı (PLACEHOLDER).
 * Kapı salt sunumdur; start anını sunucunun zaman çizelgesi belirler.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils, type GLTF } from 'three-stdlib';
import { loadVfxConfig } from '@at-sevdalisi/game-config';
import { GltfAssetLoader } from './assets/GltfAssetLoader';
import { getAssetById, type AnimationRole } from './assets/asset-manifest';
import { computeModelFit } from './assets/model-fit';

const VFX = loadVfxConfig();
const GATE_ASSET = getAssetById('START_GATE_MODEL_REQUIRED');
/** Kapı kanadının tam açık açısı (radyan) — yaklaşık 100°. */
const DOOR_OPEN_ANGLE = 1.75;

export interface StartGateProps {
  position: { x: number; z: number };
  headingRadians: number;
  /** Her bölmenin yanal ofseti (metre) — atların şerit ofsetleriyle aynı. */
  laneOffsets: number[];
  open: boolean;
  castShadow: boolean;
}

function ProceduralGate({
  laneOffsets,
  open,
  castShadow,
}: Omit<StartGateProps, 'position' | 'headingRadians'>): React.ReactElement {
  const { stallWidthMeters: width, heightMeters: height, depthMeters: depth } = VFX.startGate;
  const doorRefs = useRef<Array<THREE.Group | null>>([]);
  const progress = useRef(open ? 1 : 0);
  useFrame((_, delta) => {
    const target = open ? 1 : 0;
    const step = delta / Math.max(0.01, VFX.startGate.openSeconds);
    progress.current =
      target > progress.current
        ? Math.min(target, progress.current + step)
        : Math.max(target, progress.current - step);
    const angle = progress.current * DOOR_OPEN_ANGLE;
    doorRefs.current.forEach((door, index) => {
      if (door) door.rotation.y = index % 2 === 0 ? angle : -angle;
    });
  });
  const minLane = Math.min(...laneOffsets, 0) - width / 2;
  const maxLane = Math.max(...laneOffsets, 0) + width / 2;
  const frontX = depth * 0.5;
  return (
    <group>
      {/* Üst kiriş + yan ayaklar */}
      <mesh position={[0, height, -(minLane + maxLane) / 2]} castShadow={castShadow}>
        <boxGeometry args={[depth, 0.25, maxLane - minLane + 0.4]} />
        <meshStandardMaterial color="#2f6b3a" roughness={0.6} metalness={0.3} />
      </mesh>
      {laneOffsets.map((lane, index) => (
        <group key={index} position={[0, 0, -lane]}>
          {/* Bölme ayırıcıları (bölmenin iki yanı) */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, height / 2, (side * width) / 2]} castShadow={castShadow}>
              <boxGeometry args={[depth, height, 0.06]} />
              <meshStandardMaterial
                color="#e9edf0"
                roughness={0.5}
                metalness={0.4}
                transparent
                opacity={0.85}
              />
            </mesh>
          ))}
          {/* Bölme numarası levhası */}
          <mesh position={[frontX + 0.02, height - 0.35, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.5, 0.4]} />
            <meshStandardMaterial color="#f4f1ea" />
          </mesh>
          {/* Ön kapılar: iki kanat, dış menteşeden açılır */}
          {[-1, 1].map((side) => (
            <group
              key={side}
              position={[frontX, 0, (side * width) / 2]}
              ref={(node) => {
                doorRefs.current[index * 2 + (side === -1 ? 0 : 1)] = node;
              }}
            >
              <mesh position={[0, 1.2, (-side * width) / 4]} castShadow={castShadow}>
                <boxGeometry args={[0.06, 1.6, width / 2 - 0.04]} />
                <meshStandardMaterial color="#c7ccd2" roughness={0.4} metalness={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function GltfGate({
  gltf,
  clips,
  open,
  castShadow,
}: {
  gltf: GLTF;
  clips: Partial<Record<AnimationRole, string | null>>;
  open: boolean;
  castShadow: boolean;
}): React.ReactElement {
  const { root, fit } = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = castShadow;
    });
    const box = new THREE.Box3().setFromObject(clone);
    return {
      root: clone,
      fit: computeModelFit(
        [box.min.x, box.min.y, box.min.z],
        [box.max.x, box.max.y, box.max.z],
        GATE_ASSET?.binding ?? { forwardAxis: '+x' },
      ),
    };
  }, [gltf, castShadow]);
  const { actions } = useAnimations(gltf.animations, root);
  useEffect(() => {
    const action = clips.open ? actions[clips.open] : undefined;
    if (!action) return;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    if (open) action.reset().play();
    else action.stop();
  }, [actions, clips.open, open]);
  return (
    <group position={fit.offset}>
      <group rotation={[0, fit.rotationY, 0]} scale={fit.scale}>
        <primitive object={root} />
      </group>
    </group>
  );
}

export function StartGate({
  position,
  headingRadians,
  laneOffsets,
  open,
  castShadow,
}: StartGateProps): React.ReactElement {
  const procedural = (
    <ProceduralGate laneOffsets={laneOffsets} open={open} castShadow={castShadow} />
  );
  return (
    <group position={[position.x, 0, position.z]} rotation={[0, -headingRadians, 0]}>
      {GATE_ASSET ? (
        <GltfAssetLoader asset={GATE_ASSET} fallback={procedural}>
          {(gltf, clips) => (
            <GltfGate gltf={gltf} clips={clips} open={open} castShadow={castShadow} />
          )}
        </GltfAssetLoader>
      ) : (
        procedural
      )}
    </group>
  );
}
