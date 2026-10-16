'use client';

/**
 * AT AVATARI (01.10.2026, 3D adım 4) — sahnelerin TEK at bileşeni.
 *
 * `public/models/horse.glb` varsa gerçek model; yoksa prosedürel
 * `HorseModel` (PLACEHOLDER). Jokey de aynı şekilde: `jockey.glb` varsa o,
 * yoksa prosedürel jokey. Dört kombinasyonun hepsi çalışır.
 *
 * Gerçek model için yapılanlar (manifestteki `binding` sözleşmesiyle):
 *  - Sahne `SkeletonUtils.clone` ile ÖRNEK BAŞINA kopyalanır (yarışta aynı
 *    GLB'den 8-16 at; tek sahne nesnesi tek yerde görünebilir),
 *  - eksen/ölçek/taban `computeModelFit` ile oyuna uydurulur,
 *  - don/yele (atta) ve forma (jokeyde) rengi `tintMaterials` adlı
 *    malzemelere uygulanır (malzemeler örnek başına kopyalanır),
 *  - yürüyüş klipleri ROL ile seçilir (`idle`/`gallop`/…), geçişler
 *    çapraz soldurmalıdır; klip yoksa bir alt role düşülür,
 *  - jokey, atın iskeletinde `mountBoneNames` kemiğine ya da yoksa
 *    `mountOffset` noktasına oturur.
 */

import { useEffect, useMemo } from 'react';
import { useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils, type GLTF } from 'three-stdlib';
import type { HorseAppearance } from '@at-sevdalisi/shared-types';
import type { HorseDemeanor } from '../horse-stage/horse-demeanor';
import { HorseModel, ProceduralJockey } from './HorseModel';
import { GltfAssetLoader } from './assets/GltfAssetLoader';
import { getAssetById, type AnimationRole, type AssetRequirement } from './assets/asset-manifest';
import { assetUrl, useAssetAvailability } from './assets/asset-pipeline';
import {
  computeModelFit,
  findMountBoneName,
  materialMatchesRole,
  type Vec3,
} from './assets/model-fit';
import { paletteFor } from './coat-palette';

const HORSE_ASSET = getAssetById('HORSE_MODEL_REQUIRED');
const JOCKEY_ASSET = getAssetById('JOCKEY_MODEL_REQUIRED');
const DEFAULT_MOUNT: Vec3 = [0.15, 1.75, 0];
const CROSSFADE_SECONDS = 0.35;

export type HorseGait = 'idle' | 'walk' | 'trot' | 'canter' | 'gallop';

/** İstenen yürüyüş yoksa düşülecek sıra (yakın tempodan uzağa). */
const GAIT_FALLBACKS: Record<HorseGait, HorseGait[]> = {
  idle: ['idle', 'walk'],
  walk: ['walk', 'trot', 'idle'],
  trot: ['trot', 'canter', 'walk'],
  canter: ['canter', 'gallop', 'trot'],
  gallop: ['gallop', 'canter', 'trot'],
};

/** Saf: eşlenmiş kliplerden istenen yürüyüşe en yakın mevcut klip adı. */
export function pickGaitClip(
  clips: Partial<Record<AnimationRole, string | null>>,
  gait: HorseGait,
): string | null {
  for (const role of GAIT_FALLBACKS[gait]) {
    const name = clips[role];
    if (name) return name;
  }
  return null;
}

export interface HorseAvatar3DProps {
  horseId: string;
  appearance?: HorseAppearance;
  demeanor?: HorseDemeanor;
  gait: HorseGait;
  /** Jokey forması rengi. */
  silkColor: string;
  saddleNumber: number;
  showJockey?: boolean;
  showSaddleCloth?: boolean;
  castShadow: boolean;
}

/** Bir GLB sahnesini örnek başına kopyalar, uydurur ve malzemeleri renklendirir. */
function useFittedClone(
  gltf: GLTF,
  asset: AssetRequirement,
  tints: Partial<Record<'coat' | 'mane' | 'silk', string>>,
  castShadow: boolean,
): { root: THREE.Object3D; fit: ReturnType<typeof computeModelFit> } {
  return useMemo(() => {
    const root = SkeletonUtils.clone(gltf.scene);
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = materials.map((material) => {
        const copy = material.clone();
        for (const role of ['coat', 'mane', 'silk'] as const) {
          const color = tints[role];
          if (color && materialMatchesRole(material.name, asset.binding, role) && 'color' in copy) {
            (copy as THREE.MeshStandardMaterial).color.set(color);
          }
        }
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]!;
    });
    const box = new THREE.Box3().setFromObject(root);
    const fit = computeModelFit(
      [box.min.x, box.min.y, box.min.z],
      [box.max.x, box.max.y, box.max.z],
      asset.binding ?? { forwardAxis: '+x' },
    );
    return { root, fit };
    // `tints` nesnesi her render'da yeni olabilir; bağımlılık içeriğidir (renk dizgileri).
  }, [gltf, asset, tints.coat, tints.mane, tints.silk, castShadow]);
}

/** Klip oynatıcı: rol değişince çapraz soldurma. */
function usePlayClip(gltf: GLTF, root: THREE.Object3D, clipName: string | null): void {
  const { actions } = useAnimations(gltf.animations, root);
  useEffect(() => {
    if (!clipName) return undefined;
    const action = actions[clipName];
    action?.reset().fadeIn(CROSSFADE_SECONDS).play();
    return () => {
      action?.fadeOut(CROSSFADE_SECONDS);
    };
  }, [actions, clipName]);
}

function FittedModel({
  root,
  fit,
  children,
}: {
  root: THREE.Object3D;
  fit: ReturnType<typeof computeModelFit>;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <group position={fit.offset}>
      <group rotation={[0, fit.rotationY, 0]} scale={fit.scale}>
        <primitive object={root} />
      </group>
      {children}
    </group>
  );
}

function GltfJockey({
  asset,
  gltf,
  clips,
  silkColor,
  castShadow,
  mount,
}: {
  asset: AssetRequirement;
  gltf: GLTF;
  clips: Partial<Record<AnimationRole, string | null>>;
  silkColor: string;
  castShadow: boolean;
  mount: Vec3;
}): React.ReactElement {
  const { root, fit } = useFittedClone(gltf, asset, { silk: silkColor }, castShadow);
  usePlayClip(gltf, root, clips.ride ?? clips.idle ?? null);
  // Jokeyin tabanı (sınır kutusunun altı) eyer noktasına oturur.
  return (
    <group position={mount}>
      <FittedModel root={root} fit={fit} />
    </group>
  );
}

/** Jokey: GLB varsa o, yoksa prosedürel. `mount` = atın sırtı (oyun ekseninde). */
function Rider({
  silkColor,
  castShadow,
  mount,
}: {
  silkColor: string;
  castShadow: boolean;
  mount: Vec3;
}): React.ReactElement {
  // Prosedürel jokey kendi içinde DEFAULT_MOUNT'a göre konumlanır; farkı ötele.
  const procedural = (
    <group
      position={[
        mount[0] - DEFAULT_MOUNT[0],
        mount[1] - DEFAULT_MOUNT[1],
        mount[2] - DEFAULT_MOUNT[2],
      ]}
    >
      <ProceduralJockey silkColor={silkColor} castShadow={castShadow} />
    </group>
  );
  if (!JOCKEY_ASSET) return procedural;
  return (
    <GltfAssetLoader asset={JOCKEY_ASSET} fallback={procedural}>
      {(gltf, clips) => (
        <GltfJockey
          asset={JOCKEY_ASSET}
          gltf={gltf}
          clips={clips}
          silkColor={silkColor}
          castShadow={castShadow}
          mount={mount}
        />
      )}
    </GltfAssetLoader>
  );
}

function GltfHorse({
  gltf,
  clips,
  props,
}: {
  gltf: GLTF;
  clips: Partial<Record<AnimationRole, string | null>>;
  props: HorseAvatar3DProps;
}): React.ReactElement | null {
  const asset = HORSE_ASSET!;
  const palette = props.appearance ? paletteFor(props.appearance) : null;
  const { root, fit } = useFittedClone(
    gltf,
    asset,
    { coat: palette?.body, mane: palette?.mane },
    props.castShadow,
  );
  usePlayClip(gltf, root, pickGaitClip(clips, props.gait));

  // Jokey montajı: önce iskeletteki kemik (manifest), yoksa sabit nokta.
  const mount = useMemo<Vec3>(() => {
    const bones: string[] = [];
    root.traverse((node) => {
      if ((node as THREE.Bone).isBone) bones.push(node.name);
    });
    const boneName = findMountBoneName(bones, JOCKEY_ASSET?.binding);
    if (!boneName) return JOCKEY_ASSET?.binding?.mountOffset ?? DEFAULT_MOUNT;
    const bone = root.getObjectByName(boneName);
    if (!bone) return JOCKEY_ASSET?.binding?.mountOffset ?? DEFAULT_MOUNT;
    root.updateWorldMatrix(true, true);
    const world = new THREE.Vector3();
    bone.getWorldPosition(world);
    // Kök uzayından oyun uzayına: döndür + ölçekle + ötele (FittedModel ile aynı sıra).
    const rotated = world
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), fit.rotationY)
      .multiplyScalar(fit.scale);
    return [rotated.x + fit.offset[0], rotated.y + fit.offset[1], rotated.z + fit.offset[2]];
  }, [root, fit]);

  return (
    <FittedModel root={root} fit={fit}>
      {(props.showJockey ?? true) ? (
        <group position={[-fit.offset[0], -fit.offset[1], -fit.offset[2]]}>
          <Rider silkColor={props.silkColor} castShadow={props.castShadow} mount={mount} />
        </group>
      ) : null}
    </FittedModel>
  );
}

export function HorseAvatar3D(props: HorseAvatar3DProps): React.ReactElement {
  const showJockey = props.showJockey ?? true;
  // Jokey GLB yoksa prosedürel jokey atın GÖVDE grubunda çizilir (dörtnalda
  // gövdeyle birlikte sallanır); GLB jokey varsa ayrı oturtulur.
  const jockeyAvailability = useAssetAvailability(
    JOCKEY_ASSET ? assetUrl(JOCKEY_ASSET.expectedPath) : '',
  );
  const gltfJockey = showJockey && jockeyAvailability === 'available';
  const procedural = (
    <>
      <HorseModel
        horseId={props.horseId}
        silkColor={props.silkColor}
        saddleNumber={props.saddleNumber}
        isMoving={props.gait !== 'idle'}
        castShadow={props.castShadow}
        appearance={props.appearance}
        demeanor={props.demeanor}
        showJockey={showJockey && !gltfJockey}
        showSaddleCloth={props.showSaddleCloth ?? showJockey}
      />
      {gltfJockey ? (
        <Rider silkColor={props.silkColor} castShadow={props.castShadow} mount={DEFAULT_MOUNT} />
      ) : null}
    </>
  );
  if (!HORSE_ASSET) return procedural;
  return (
    <GltfAssetLoader asset={HORSE_ASSET} fallback={procedural}>
      {(gltf, clips) => <GltfHorse gltf={gltf} clips={clips} props={props} />}
    </GltfAssetLoader>
  );
}
