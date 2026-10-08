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

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
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
import { SceneQualityMonitor } from '../race-viewer/SceneQualityMonitor';
import { useQualityTier } from '../race-viewer/use-quality-tier';
import { HORSE_MOOD_LABELS, deriveHorseDemeanor } from '../horse-stage/horse-demeanor';
import { PlaceholderStall, STABLE_SUN_POSITION, type StableDetail } from './PlaceholderStall';
import { STABLE_LAMPS, STABLE_ORBIT, orbitPosition } from './stable-layout';
import { AudioToggle } from '../race-viewer/audio-vfx/AudioToggle';
import { QualitySelect } from '../race-viewer/QualitySelect';
import { useAudioMuted, useStableAmbience } from '../race-viewer/audio-vfx/use-race-audio';

const PRESENCE_CONFIG = loadHorsePresenceConfig();
const STABLE_ASSET = getAssetById('STABLE_ENVIRONMENT_REQUIRED');
const HDRI_ASSET = getAssetById('HDRI_SKY_REQUIRED');
const HDRI_URL = HDRI_ASSET ? assetUrl(HDRI_ASSET.expectedPath) : '';

export type StableSceneHorse = Pick<
  PublicHorse,
  'id' | 'name' | 'health' | 'energy' | 'fatigue' | 'morale' | 'status' | 'appearance'
>;

const INITIAL_CAMERA = orbitPosition(
  STABLE_ORBIT.target,
  STABLE_ORBIT.initial.distance,
  STABLE_ORBIT.initial.polar,
  STABLE_ORBIT.initial.azimuth,
);

function StableEnvironment({
  castShadow,
  horseName,
  detail,
}: {
  castShadow: boolean;
  horseName: string;
  detail: StableDetail;
}): React.ReactElement {
  const procedural = <PlaceholderStall castShadow={castShadow} horseName={horseName} detail={detail} />;
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

/**
 * Yörünge sınırlıdır (kamera duvara girmesin — `stable-layout.ts`); bu yüzden
 * drei'nin `autoRotate`u sınıra varınca takılırdı. Burada sınırda yön değişir:
 * kamera iki sınır arasında yavaşça gidip gelir.
 */
function SwayingOrbit(): React.ReactElement {
  const controls = useRef<OrbitControlsImpl>(null);
  const direction = useRef(1);
  useFrame(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const azimuth = orbit.getAzimuthalAngle();
    if (azimuth >= STABLE_ORBIT.maxAzimuth - 0.02) direction.current = -1;
    else if (azimuth <= STABLE_ORBIT.minAzimuth + 0.02) direction.current = 1;
    // OrbitControls'ta pozitif hız açıyı AZALTIR.
    orbit.autoRotateSpeed = -direction.current * STABLE_ORBIT.autoRotateSpeed;
  });
  return (
    <OrbitControls
      ref={controls}
      target={STABLE_ORBIT.target}
      enablePan={false}
      minDistance={STABLE_ORBIT.minDistance}
      maxDistance={STABLE_ORBIT.maxDistance}
      minPolarAngle={STABLE_ORBIT.minPolar}
      maxPolarAngle={STABLE_ORBIT.maxPolar}
      minAzimuthAngle={STABLE_ORBIT.minAzimuth}
      maxAzimuthAngle={STABLE_ORBIT.maxAzimuth}
      autoRotate
      autoRotateSpeed={STABLE_ORBIT.autoRotateSpeed}
    />
  );
}

function StableSceneContents({
  horse,
  shadows,
  shadowMapSize,
  detail,
}: {
  horse: StableSceneHorse;
  shadows: boolean;
  shadowMapSize: number;
  detail: StableDetail;
}): React.ReactElement {
  const demeanor = useMemo(() => deriveHorseDemeanor(horse, PRESENCE_CONFIG), [horse]);
  const lamps = detail === 'high' ? STABLE_LAMPS : STABLE_LAMPS.filter(([x]) => x === 0);
  return (
    <>
      <color attach="background" args={['#120d09']} />
      <fog attach="fog" args={['#1b140e', 10, 32]} />
      {/* İç mekân: zayıf ortam + asma lambalar (sıcak) + pencereden giren güneş (gölgeli). */}
      <hemisphereLight args={['#ffe9cc', '#2a1d12', 0.8]} />
      {lamps.map(([x, y, z]) => (
        <pointLight
          key={x}
          position={[x, y - 0.1, z]}
          intensity={x === 0 ? 7 : 4}
          distance={11}
          decay={2}
          color="#ffbf73"
        />
      ))}
      {/* Bölme lambası: atı önden yumuşak aydınlatır. */}
      <pointLight position={[0.9, 2.2, 1.9]} intensity={6} distance={7} decay={2} color="#ffcf8f" />
      <directionalLight
        position={STABLE_SUN_POSITION}
        intensity={2.4}
        color="#fff1d6"
        castShadow={shadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
      />
      <StableEnvironment castShadow={shadows} horseName={horse.name} detail={detail} />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.55} scale={5} blur={2.4} far={2.2} resolution={256} />
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
      <SwayingOrbit />
    </>
  );
}

export interface StableScene3DProps {
  horse: StableSceneHorse;
  /** Sahnenin üstüne yerleşen arayüz (ahır işlem simgeleri + panel). */
  children?: React.ReactNode;
}

export function StableScene3D({ horse, children }: StableScene3DProps): React.ReactElement {
  // 01.10.2026 (3D adım 10) — ortak kalite tercihi + otomatik düşürme.
  const quality = useQualityTier();
  const settings = quality.settings;
  const mood = deriveHorseDemeanor(horse, PRESENCE_CONFIG).mood;
  // İç mekân: HDRI gökyüzü olarak GÖRÜNMEZ, yalnızca yansıma/ortam ışığı verir.
  const hdri = useAssetAvailability(HDRI_URL);
  // 01.10.2026 (3D adım 9) — ahır ortam sesi (dosya yoksa sessiz).
  const [audioMuted, setAudioMuted] = useAudioMuted();
  useStableAmbience(audioMuted);
  return (
    <div className="stable3d">
      <Canvas
        key={settings.tier}
        shadows={settings.shadowsEnabled}
        dpr={[1, settings.pixelRatioCap]}
        camera={{ position: INITIAL_CAMERA, fov: 42 }}
        gl={SCENE_GL_OPTIONS}
      >
        <SceneQualityMonitor
          enabled={quality.preference === 'auto'}
          onDecline={quality.reportPerformanceDecline}
        />
        <Suspense fallback={null}>
          <SceneRenderSettings settings={settings} />
          {hdri === 'available' ? (
            <HdriEnvironment url={HDRI_URL} background={false} fallback={null} />
          ) : null}
          <StableSceneContents
            horse={horse}
            shadows={settings.shadowsEnabled}
            shadowMapSize={settings.shadowMapSize}
            detail={settings.tier === 'low' ? 'low' : 'high'}
          />
        </Suspense>
      </Canvas>
      <PlaceholderBadge assetIds={['HORSE_MODEL_REQUIRED', 'STABLE_ENVIRONMENT_REQUIRED']} />
      <div className="scene-controls" style={{ bottom: 12, right: 12 }}>
        <AudioToggle muted={audioMuted} onChange={setAudioMuted} />
        <QualitySelect />
      </div>
      <div className="stable3d-caption">
        <span className="stable3d-name">{horse.name}</span>
        <span className="home3d-mood">{HORSE_MOOD_LABELS[mood]}</span>
      </div>
      {children}
    </div>
  );
}
