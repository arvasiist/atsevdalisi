'use client';

/**
 * OYUNCUNUN ATI — 3D ÖNİZLEME (01.10.2026, 3D yol haritası adım 2).
 *
 * Sahnedeki at RASTGELE bir dekor DEĞİL: `horse` prop'u API'den gelen
 * gerçek kayıttır. Görünüş (don + işaretler) veritabanından
 * (`horse.appearance`, migration 0051), bekleme davranışı atın gerçek
 * durumundan (`deriveHorseDemeanor` + `horse-presence.config.json`) gelir.
 *
 * Model kaynağı:
 *  - `public/models/horse.glb` VARSA → `GltfAssetLoader` (yerel Draco/KTX2)
 *    ile gerçek model; manifestteki `idle` klibi oynatılır.
 *  - YOKSA → prosedürel `HorseModel` + ekranda "PLACEHOLDER" rozeti.
 *    Gerçekçi at iddiası KURULMAZ (CLAUDE.md kural 8).
 *
 * Sahne hiçbir dosyayı CDN'den indirmez: ışık ve gökyüzü sahnede üretilir.
 */

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls, useAnimations } from '@react-three/drei';
import type { Group } from 'three';
import type { GLTF } from 'three-stdlib';
import { loadHorsePresenceConfig } from '@at-sevdalisi/game-config';
import type { PublicHorse } from '@at-sevdalisi/shared-types';
import { HorseModel } from '../race-viewer/HorseModel';
import { GltfAssetLoader } from '../race-viewer/assets/GltfAssetLoader';
import { PlaceholderBadge } from '../race-viewer/assets/PlaceholderBadge';
import { getAssetById } from '../race-viewer/assets/asset-manifest';
import { HORSE_MOOD_LABELS, deriveHorseDemeanor } from './horse-demeanor';

const PRESENCE_CONFIG = loadHorsePresenceConfig();
const HORSE_ASSET = getAssetById('HORSE_MODEL_REQUIRED');

export type ShowcaseHorse = Pick<
  PublicHorse,
  'id' | 'name' | 'health' | 'energy' | 'fatigue' | 'morale' | 'status' | 'appearance'
>;

/** GLB geldiğinde: modeli sahneye koyar ve `idle` klibini oynatır. */
function GltfHorse({
  gltf,
  idleClip,
}: {
  gltf: GLTF;
  idleClip: string | null;
}): React.ReactElement {
  const root = useRef<Group>(null);
  const { actions } = useAnimations(gltf.animations, root);
  useEffect(() => {
    if (!idleClip) return undefined;
    const action = actions[idleClip];
    action?.reset().fadeIn(0.4).play();
    return () => {
      action?.fadeOut(0.3);
    };
  }, [actions, idleClip]);
  return (
    <group ref={root}>
      <primitive object={gltf.scene} />
    </group>
  );
}

function ShowcaseScene({ horse }: { horse: ShowcaseHorse }): React.ReactElement {
  const demeanor = useMemo(() => deriveHorseDemeanor(horse, PRESENCE_CONFIG), [horse]);
  const procedural = (
    <group position={[0.1, 0, 0]}>
      <HorseModel
        horseId={horse.id}
        silkColor="#c9a227"
        saddleNumber={1}
        isMoving={false}
        castShadow
        appearance={horse.appearance}
        demeanor={demeanor}
        showJockey={false}
      />
    </group>
  );
  return (
    <>
      <color attach="background" args={['#0d1424']} />
      <fog attach="fog" args={['#0d1424', 9, 22]} />
      <hemisphereLight args={['#f6e3c0', '#1d2a1a', 0.55]} />
      {/* Altın saat anahtar ışığı + soğuk kontur ışığı */}
      <directionalLight
        position={[-4, 6, 4]}
        intensity={2.2}
        color="#ffd9a0"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[5, 3, -4]} intensity={0.9} color="#9fc3ff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[8, 48]} />
        <meshStandardMaterial color="#3a2c1d" roughness={0.95} />
      </mesh>
      <ContactShadows position={[0, 0.01, 0]} opacity={0.55} scale={7} blur={2.2} far={3} />
      {HORSE_ASSET ? (
        <GltfAssetLoader asset={HORSE_ASSET} fallback={procedural}>
          {(gltf, clips) => <GltfHorse gltf={gltf} idleClip={clips.idle ?? null} />}
        </GltfAssetLoader>
      ) : (
        procedural
      )}
      <OrbitControls
        target={[0, 1.2, 0]}
        enablePan={false}
        minDistance={3.2}
        maxDistance={8}
        minPolarAngle={0.6}
        maxPolarAngle={1.45}
        autoRotate
        autoRotateSpeed={0.6}
      />
    </>
  );
}

export interface HorseShowcaseProps {
  horse: ShowcaseHorse;
  height?: number;
}

export function HorseShowcase({ horse, height = 260 }: HorseShowcaseProps): React.ReactElement {
  const demeanor = deriveHorseDemeanor(horse, PRESENCE_CONFIG);
  return (
    <div style={{ position: 'relative', width: '100%', height, background: '#0d1424' }}>
      <Canvas shadows dpr={[1, 1.75]} camera={{ position: [5.4, 2.4, 5.4], fov: 36 }}>
        <Suspense fallback={null}>
          <ShowcaseScene horse={horse} />
        </Suspense>
      </Canvas>
      <PlaceholderBadge assetIds={['HORSE_MODEL_REQUIRED']} />
      <div
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          padding: '4px 10px',
          borderRadius: 999,
          background: 'rgba(5, 8, 18, 0.72)',
          color: '#f3e9d2',
          fontSize: 12,
          pointerEvents: 'none',
        }}
      >
        {horse.name} · {HORSE_MOOD_LABELS[demeanor.mood]}
      </div>
    </div>
  );
}
