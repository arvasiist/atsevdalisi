'use client';

/**
 * ANA SAYFA 3D SAHNESİ (01.10.2026, 3D yol haritası adım 3).
 *
 * Oyuncunun ilk gördüğü şey bir 3D dünya: hipodrom (pist, korkuluk, tribün +
 * kalabalık, kuleler, ağaçlar — `TrackScenery`), önde OYUNCUNUN atı (görünüş
 * ve davranış veritabanındaki gerçek kayıttan), sırtında jokey, iç sahada
 * bir ahır. Kamera `config/camera.config.json` → `homeShowcase` çekimlerini
 * sırayla, yumuşak geçişlerle oynatır.
 *
 * ⚠️ PLACEHOLDER: at, jokey, ahır ve tribün bugün prosedürel geometridir
 * (gerçek GLB yok — `PlaceholderBadge` bunu ekranda söyler). `public/models/
 * horse.glb` konunca at `GltfAssetLoader` üzerinden gerçek modele geçer.
 * Sahne hiçbir dosyayı CDN'den indirmez.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import type { GLTF } from 'three-stdlib';
import { loadCameraConfig, loadHorsePresenceConfig } from '@at-sevdalisi/game-config';
import type { PublicHorse } from '@at-sevdalisi/shared-types';
import { HorseModel } from '../race-viewer/HorseModel';
import {
  DirtTrack,
  Grandstand,
  Grass,
  Rails,
  SkyAndLighting,
  TrackFurniture,
  TreeLine,
} from '../race-viewer/TrackScenery';
import { GltfAssetLoader } from '../race-viewer/assets/GltfAssetLoader';
import { getAssetById } from '../race-viewer/assets/asset-manifest';
import {
  getQualityTierRenderSettings,
  type QualityTierRenderSettings,
} from '../race-viewer/quality-tier';
import { detectQualityTier } from '../race-viewer/detect-quality-tier';
import {
  DEFAULT_LAP_LENGTH_METERS,
  DEFAULT_TURN_RADIUS_METERS,
  createStadiumTrackGeometry,
} from '../race-viewer/track-path';
import { deriveHorseDemeanor } from '../horse-stage/horse-demeanor';
import { evaluateShowcaseCamera, fitFovToAspect, toWorld, type Vec3 } from './showcase-camera';

const CAMERA_CONFIG = loadCameraConfig().homeShowcase;
const PRESENCE_CONFIG = loadHorsePresenceConfig();
const HORSE_ASSET = getAssetById('HORSE_MODEL_REQUIRED');

const TRACK_GEOMETRY = createStadiumTrackGeometry(
  DEFAULT_LAP_LENGTH_METERS,
  DEFAULT_TURN_RADIUS_METERS,
);
/** At, alt düzlükte iç korkuluğa yakın durur (tribün arkasında kalır). */
const HORSE_INNER_OFFSET_METERS = 6;
/** Düzlük boyunca konum: iç sahadaki ışık kulelerinin (x = 0, ±0.6·yarım düzlük) ARASI — kule kadrajı kapatmasın. */
const HORSE_ALONG_STRAIGHT_METERS = 70;
const HORSE_ANCHOR: Vec3 = [
  HORSE_ALONG_STRAIGHT_METERS,
  0,
  -TRACK_GEOMETRY.turnRadiusMeters + HORSE_INNER_OFFSET_METERS,
];
const HORSE_HEADING = 0;
/** Çekim açıları 16:9 için yazıldı; dar ekranda yatay kapsam korunur (en fazla bu açıya kadar). */
const REFERENCE_ASPECT = 16 / 9;
const MAX_PORTRAIT_FOV = 72;
/** İç sahadaki ahırın ata göre konumu — `homeShowcase` "stable" çekimi buraya bakar. */
const BARN_LOCAL: Vec3 = [-28, 0, 18];

export type ShowcaseSceneHorse = Pick<
  PublicHorse,
  'id' | 'health' | 'energy' | 'fatigue' | 'morale' | 'status' | 'appearance'
>;

export interface HomeScene3DProps {
  /** Oyuncunun öne çıkan atı; yoksa (henüz oyuncu yok) sahne atsız kurulur. */
  horse: ShowcaseSceneHorse | null;
  /** Elle seçilen çekim — verilirse otomatik sıra o çekimden devam eder. */
  requestedShot: number | null;
  /** Otomatik çekim sırası açık mı (kapalıysa kamera seçili çekimde durur). */
  autoplay: boolean;
  /** Sahne görünür değilken render durur (performans). */
  active: boolean;
  onShotChange: (shotIndex: number) => void;
}

function CameraRig({
  requestedShot,
  autoplay,
  onShotChange,
}: Pick<HomeScene3DProps, 'requestedShot' | 'autoplay' | 'onShotChange'>): null {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const timeRef = useRef(0);
  const lastShotRef = useRef(-1);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (requestedShot === null) return;
    // Seçilen çekimin başına atla (geçiş karışımı da oradan başlar).
    let start = 0;
    for (let i = 0; i < requestedShot; i += 1)
      start += CAMERA_CONFIG.shots[i]?.durationSeconds ?? 0;
    timeRef.current = start;
  }, [requestedShot]);

  useFrame((_, delta) => {
    if (autoplay) {
      // Sekme arkadan döndüğünde dev bir sıçrama olmasın.
      timeRef.current += Math.min(delta, 0.1);
    } else if (requestedShot !== null) {
      // Otomatik kapalı: çekimin ortasında, kayma devam etmeden durur.
      const shot = CAMERA_CONFIG.shots[requestedShot];
      let start = 0;
      for (let i = 0; i < requestedShot; i += 1)
        start += CAMERA_CONFIG.shots[i]?.durationSeconds ?? 0;
      timeRef.current = start + (shot ? shot.durationSeconds * 0.4 : 0);
    }
    const pose = evaluateShowcaseCamera(
      timeRef.current,
      CAMERA_CONFIG.shots,
      CAMERA_CONFIG.blendSeconds,
    );
    const position = toWorld(pose.position, HORSE_ANCHOR, HORSE_HEADING);
    const target = toWorld(pose.target, HORSE_ANCHOR, HORSE_HEADING);
    camera.position.set(position[0], position[1], position[2]);
    lookAt.set(target[0], target[1], target[2]);
    camera.lookAt(lookAt);
    const fov = fitFovToAspect(pose.fov, camera.aspect, REFERENCE_ASPECT, MAX_PORTRAIT_FOV);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    if (pose.shotIndex !== lastShotRef.current) {
      lastShotRef.current = pose.shotIndex;
      onShotChange(pose.shotIndex);
    }
  });
  return null;
}

/** GLB geldiğinde: model + `idle` klibi. */
function GltfHorse({
  gltf,
  idleClip,
}: {
  gltf: GLTF;
  idleClip: string | null;
}): React.ReactElement {
  const root = useRef<THREE.Group>(null);
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

function PlayerHorse({
  horse,
  settings,
}: {
  horse: ShowcaseSceneHorse;
  settings: QualityTierRenderSettings;
}): React.ReactElement {
  const demeanor = useMemo(() => deriveHorseDemeanor(horse, PRESENCE_CONFIG), [horse]);
  const procedural = (
    <HorseModel
      horseId={horse.id}
      silkColor="#c9a227"
      saddleNumber={1}
      isMoving={false}
      castShadow={settings.shadowsEnabled}
      appearance={horse.appearance}
      demeanor={demeanor}
      showJockey
      showSaddleCloth={false}
    />
  );
  return (
    <group position={HORSE_ANCHOR} rotation={[0, -HORSE_HEADING, 0]}>
      {HORSE_ASSET ? (
        <GltfAssetLoader asset={HORSE_ASSET} fallback={procedural}>
          {(gltf, clips) => <GltfHorse gltf={gltf} idleClip={clips.idle ?? null} />}
        </GltfAssetLoader>
      ) : (
        procedural
      )}
    </group>
  );
}

/**
 * PLACEHOLDER ahır (gerçek `stable-environment.glb` yok): ahşap gövde,
 * beşik çatı, iki bölme kapısı, saman balyaları. Yalnızca "Ahır" çekiminin
 * neye baktığını göstermek için; manifestte `STABLE_ENVIRONMENT_REQUIRED`.
 */
function PlaceholderBarn({ castShadow }: { castShadow: boolean }): React.ReactElement {
  const world = toWorld(BARN_LOCAL, HORSE_ANCHOR, HORSE_HEADING);
  return (
    <group position={world} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 2, 0]} castShadow={castShadow} receiveShadow>
        <boxGeometry args={[12, 4, 7]} />
        <meshStandardMaterial color="#6e4a2e" roughness={0.85} />
      </mesh>
      {/* Beşik çatı: iki eğik levha */}
      <mesh position={[0, 4.9, 1.85]} rotation={[0.62, 0, 0]} castShadow={castShadow}>
        <boxGeometry args={[12.6, 0.18, 4.4]} />
        <meshStandardMaterial color="#3b2a22" roughness={0.7} />
      </mesh>
      <mesh position={[0, 4.9, -1.85]} rotation={[-0.62, 0, 0]} castShadow={castShadow}>
        <boxGeometry args={[12.6, 0.18, 4.4]} />
        <meshStandardMaterial color="#3b2a22" roughness={0.7} />
      </mesh>
      {[-2.6, 2.6].map((x) => (
        <group key={x} position={[x, 1.4, 3.52]}>
          <mesh>
            <boxGeometry args={[2.2, 2.8, 0.08]} />
            <meshStandardMaterial color="#4a3020" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[2.2, 0.12, 0.04]} />
            <meshStandardMaterial color="#d8c9a8" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {[
        [-5, 0.45, 5],
        [-3.8, 0.45, 5.4],
        [-4.4, 1.25, 5.2],
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${y}`} position={[x!, y!, z!]} castShadow={castShadow}>
          <boxGeometry args={[1.1, 0.8, 0.8]} />
          <meshStandardMaterial color="#c9a85a" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function HomeScene3D({
  horse,
  requestedShot,
  autoplay,
  active,
  onShotChange,
}: HomeScene3DProps): React.ReactElement {
  const settings = useMemo(() => getQualityTierRenderSettings(detectQualityTier()), []);
  return (
    <Canvas
      shadows={settings.shadowsEnabled}
      dpr={[1, settings.pixelRatioCap]}
      frameloop={active ? 'always' : 'never'}
      camera={{ fov: 40, near: 0.1, far: 3000, position: [0, 3, 10] }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
    >
      <SkyAndLighting
        environmentEnabled={settings.environmentEnabled}
        shadowsEnabled={settings.shadowsEnabled}
        shadowMapSize={settings.shadowMapSize}
      />
      {/* Altın saat dolgu ışığı: güneş tribünün arkasında, atın kameraya bakan yüzü kararmasın. */}
      <directionalLight position={[40, 18, 30]} intensity={0.8} color="#ffcf8a" />
      <Grass />
      <DirtTrack geometry={TRACK_GEOMETRY} />
      <Rails geometry={TRACK_GEOMETRY} />
      <Grandstand geometry={TRACK_GEOMETRY} />
      <TrackFurniture geometry={TRACK_GEOMETRY} />
      <TreeLine geometry={TRACK_GEOMETRY} />
      <PlaceholderBarn castShadow={settings.shadowsEnabled} />
      {horse ? <PlayerHorse horse={horse} settings={settings} /> : null}
      <CameraRig requestedShot={requestedShot} autoplay={autoplay} onShotChange={onShotChange} />
    </Canvas>
  );
}

export const HOME_SHOWCASE_SHOTS = CAMERA_CONFIG.shots;
