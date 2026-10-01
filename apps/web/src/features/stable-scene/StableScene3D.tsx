'use client';

/**
 * 3D AHIR SAHNESİ (01.10.2026, 3D yol haritası adım 6).
 *
 * `/stable`in üstünde: oyuncunun SEÇİLİ atı bölmesinde durur (görünüş ve
 * bekleme davranışı veritabanındaki gerçek kayıttan), kamera atın etrafında
 * sınırlı bir yörüngede gezilebilir. Ortam `stable-environment.glb` varsa o
 * (manifest `keepOrigin`), yoksa `PlaceholderStall` + PLACEHOLDER rozeti.
 * Sayfada TEK Canvas vardır (kartlar sahneye at seçer; her kartta ayrı WebGL
 * bağlamı tarayıcı sınırını aşardı). Sahne dışarıdan dosya indirmez.
 */

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { loadHorsePresenceConfig } from '@at-sevdalisi/game-config';
import type { PublicHorse } from '@at-sevdalisi/shared-types';
import { HorseAvatar3D } from '../race-viewer/HorseAvatar3D';
import { GltfAssetLoader } from '../race-viewer/assets/GltfAssetLoader';
import { PlaceholderBadge } from '../race-viewer/assets/PlaceholderBadge';
import { getAssetById } from '../race-viewer/assets/asset-manifest';
import { forwardAxisRotation } from '../race-viewer/assets/model-fit';
import { HdriEnvironment } from '../race-viewer/assets/HdriEnvironment';
import { assetUrl, useAssetAvailability } from '../race-viewer/assets/asset-pipeline';
import { SCENE_GL_OPTIONS, SceneRenderSettings } from '../race-viewer/SceneRenderSettings';
import { detectQualityTier } from '../race-viewer/detect-quality-tier';
import { getQualityTierRenderSettings } from '../race-viewer/quality-tier';
import { HORSE_MOOD_LABELS, deriveHorseDemeanor } from '../horse-stage/horse-demeanor';
import { PlaceholderStall } from './PlaceholderStall';
import { AudioToggle } from '../race-viewer/audio-vfx/AudioToggle';
import { useAudioMuted, useStableAmbience } from '../race-viewer/audio-vfx/use-race-audio';

const PRESENCE_CONFIG = loadHorsePresenceConfig();
const STABLE_ASSET = getAssetById('STABLE_ENVIRONMENT_REQUIRED');
const HDRI_ASSET = getAssetById('HDRI_SKY_REQUIRED');
const HDRI_URL = HDRI_ASSET ? assetUrl(HDRI_ASSET.expectedPath) : '';

export type StableSceneHorse = Pick<
  PublicHorse,
  'id' | 'name' | 'health' | 'energy' | 'fatigue' | 'morale' | 'status' | 'appearance'
>;

function StableEnvironment({ castShadow }: { castShadow: boolean }): React.ReactElement {
  const procedural = <PlaceholderStall castShadow={castShadow} />;
  if (!STABLE_ASSET) return procedural;
  const rotationY = STABLE_ASSET.binding
    ? forwardAxisRotation(STABLE_ASSET.binding.forwardAxis)
    : 0;
  return (
    <GltfAssetLoader asset={STABLE_ASSET} fallback={procedural}>
      {(gltf) => (
        <group rotation={[0, rotationY, 0]}>
          <primitive object={gltf.scene} />
        </group>
      )}
    </GltfAssetLoader>
  );
}

function StableSceneContents({
  horse,
  shadows,
}: {
  horse: StableSceneHorse;
  shadows: boolean;
}): React.ReactElement {
  const demeanor = useMemo(() => deriveHorseDemeanor(horse, PRESENCE_CONFIG), [horse]);
  return (
    <>
      <color attach="background" args={['#120d09']} />
      <fog attach="fog" args={['#120d09', 7, 18]} />
      {/* Sıcak iç mekân: fener (nokta ışık) + kapı aralığından gün ışığı. */}
      <hemisphereLight args={['#ffe2b8', '#2a1d12', 0.35]} />
      <pointLight
        position={[0.4, 2.3, -1.4]}
        intensity={9}
        distance={9}
        decay={2}
        color="#ffb965"
        castShadow={shadows}
      />
      <directionalLight
        position={[6, 5, 3]}
        intensity={1.6}
        color="#ffe6c2"
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
      />
      <StableEnvironment castShadow={shadows} />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={6} blur={2.4} far={3} />
      <HorseAvatar3D
        horseId={horse.id}
        silkColor="#c9a227"
        saddleNumber={1}
        gait="idle"
        castShadow={shadows}
        appearance={horse.appearance}
        demeanor={demeanor}
        showJockey={false}
      />
      <OrbitControls
        target={[0.2, 1.2, 0]}
        enablePan={false}
        minDistance={2.8}
        maxDistance={6.5}
        minPolarAngle={0.55}
        maxPolarAngle={1.45}
        autoRotate
        autoRotateSpeed={0.35}
      />
    </>
  );
}

export interface StableScene3DProps {
  horse: StableSceneHorse;
}

export function StableScene3D({ horse }: StableScene3DProps): React.ReactElement {
  const settings = useMemo(() => getQualityTierRenderSettings(detectQualityTier()), []);
  const mood = deriveHorseDemeanor(horse, PRESENCE_CONFIG).mood;
  // İç mekân: HDRI gökyüzü olarak GÖRÜNMEZ, yalnızca yansıma/ortam ışığı verir.
  const hdri = useAssetAvailability(HDRI_URL);
  // 01.10.2026 (3D adım 9) — ahır ortam sesi (dosya yoksa sessiz).
  const [audioMuted, setAudioMuted] = useAudioMuted();
  useStableAmbience(audioMuted);
  return (
    <div className="stable3d">
      <Canvas
        shadows={settings.shadowsEnabled}
        dpr={[1, settings.pixelRatioCap]}
        camera={{ position: [4.4, 2.1, 3.4], fov: 42 }}
        gl={SCENE_GL_OPTIONS}
      >
        <Suspense fallback={null}>
          <SceneRenderSettings settings={settings} />
          {hdri === 'available' ? (
            <HdriEnvironment url={HDRI_URL} background={false} fallback={null} />
          ) : null}
          <StableSceneContents horse={horse} shadows={settings.shadowsEnabled} />
        </Suspense>
      </Canvas>
      <PlaceholderBadge assetIds={['HORSE_MODEL_REQUIRED', 'STABLE_ENVIRONMENT_REQUIRED']} />
      <AudioToggle
        muted={audioMuted}
        onChange={setAudioMuted}
        style={{ position: 'absolute', top: 12, right: 12 }}
      />
      <div className="stable3d-caption">
        <span className="stable3d-name">{horse.name}</span>
        <span className="home3d-mood">{HORSE_MOOD_LABELS[mood]}</span>
      </div>
    </div>
  );
}
