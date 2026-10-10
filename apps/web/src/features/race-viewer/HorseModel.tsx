'use client';

/**
 * PROSEDÜREL AT + JOKEY MODELİ.
 *
 * 01.10.2026: ilk sürüm (kapsül gövde, tek parça silindir bacak).
 * 10.10.2026 (görsel gerçekçilik C1): anatomik loft gövde/boyun/baş, eklemli
 * bacaklar (omuz/kalça salınımı + diz/sekiz bükümü), eyer + kolan + yular +
 * dizgin ve kısa üzengide eğilmiş jokey. Geometri `horse-geometry.ts`te ve
 * bütün atlar arasında PAYLAŞILIR; bu bileşen yalnızca malzeme rengi ve
 * hareket uygular.
 *
 * ⚠️ PLACEHOLDER — gerçek bir `.glb` modeli gelene kadar (bkz.
 * `assets/asset-manifest.ts`, CLAUDE.md kural 8: sahte/lisanssız varlık
 * YOK). Ekrandaki rozet bunu söyler.
 *
 * Koordinatlar: ileri yön yerel +X'tir (`RaceScene3D` grubu
 * `rotation.y = -heading` ile döndürür; heading 0 = +X). Ölçek gerçeğe
 * yakındır (burun-kuyruk ~2.6 m, cidago ~1.6 m).
 *
 * Görsel çeşitlilik (don rengi) `horseId`den TÜRETİLİR — `Math.random()`
 * kullanılmaz (CLAUDE.md kural 3'ün ruhu: aynı yarış her izlemede aynı
 * görünür).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HorseAppearance } from '@at-sevdalisi/shared-types';
import type { HorseDemeanor } from '../horse-stage/horse-demeanor';
import { MARKING_WHITE, paletteFor } from './coat-palette';
import {
  EAR_PIVOT,
  HORSE_ANATOMY,
  gallopLegPose,
  getHorseGeometries,
  getJockeyGeometries,
  headTopPoint,
  pollInNeckFrame,
} from './horse-geometry';

/** Gerçekçi don renkleri: doru, koyu doru, yağız, al, kır. */
const COAT_COLORS = ['#6b3a1f', '#4a2a17', '#1d1714', '#8c4a20', '#7a726a', '#5a3320'] as const;
const MANE_COLORS = ['#1a1210', '#140e0b', '#0d0a09', '#3a1e0f', '#3d3833', '#140e0b'] as const;
const HOOF_COLOR = '#141110';
const LEATHER_COLOR = '#2a1a10';

const GALLOP_HZ = 2.3;
const TWO_PI = Math.PI * 2;
/** Dörtnal sırası: arka sol → arka sağ → ön sol → ön sağ (faz, tur oranı). */
const LEG_PHASES = { hindLeft: 0, hindRight: 0.12, foreLeft: 0.42, foreRight: 0.54 } as const;
/** Dörtnalda boyun öne uzanır (yan düzlemde aşağı dönüş, radyan). */
const NECK_GALLOP_ANGLE = -0.22;
/** Dörtnalda kuyruk hafif kalkar. */
const TAIL_GALLOP_LIFT = 0.45;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/** Eyer örtüsü numarası — çalışma anında çizilen doku (dosya değil). */
function useNumberTexture(saddleNumber: number, silkColor: string): THREE.CanvasTexture | null {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#f4f1ea';
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = silkColor;
    context.fillRect(0, 0, 128, 14);
    context.fillRect(0, 114, 128, 14);
    context.fillStyle = '#11151f';
    context.font = 'bold 72px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(saddleNumber), 64, 68);
    const created = new THREE.CanvasTexture(canvas);
    created.colorSpace = THREE.SRGBColorSpace;
    return created;
  }, [saddleNumber, silkColor]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

/** Atın malzemeleri (renk başına bir kez; parçalar paylaşır). */
function useHorseMaterials(coat: string, mane: string, lowerLeg: string) {
  const materials = useMemo(
    () => ({
      coat: new THREE.MeshStandardMaterial({ color: coat, roughness: 0.5, metalness: 0.04 }),
      mane: new THREE.MeshStandardMaterial({ color: mane, roughness: 0.85, metalness: 0 }),
      lowerLeg: new THREE.MeshStandardMaterial({ color: lowerLeg, roughness: 0.6, metalness: 0.02 }),
      white: new THREE.MeshStandardMaterial({ color: MARKING_WHITE, roughness: 0.7 }),
      hoof: new THREE.MeshStandardMaterial({ color: HOOF_COLOR, roughness: 0.5 }),
      dark: new THREE.MeshStandardMaterial({ color: '#0b0908', roughness: 0.3 }),
      leather: new THREE.MeshStandardMaterial({ color: LEATHER_COLOR, roughness: 0.55, metalness: 0.05 }),
    }),
    [coat, mane, lowerLeg],
  );
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );
  return materials;
}

export interface HorseModelProps {
  horseId: string;
  /** Jokey forması rengi (yarışçıya özgü). */
  silkColor: string;
  saddleNumber: number;
  isMoving: boolean;
  castShadow: boolean;
  /**
   * 01.10.2026 — veritabanındaki görünüş (don + işaretler). Verilmezse don
   * `horseId`den türetilir (yarış ekranındaki eski davranış).
   */
  appearance?: HorseAppearance;
  /**
   * 01.10.2026 — dururken (isMoving=false) bekleme davranışı: nefes, baş
   * yüksekliği, kuyruk, ağırlık aktarma, kulaklar. Verilmezse at dururken
   * tamamen hareketsizdir (eski davranış).
   */
  demeanor?: HorseDemeanor;
  /** Jokey çizilsin mi (ahır/vitrin sahnesinde at yalnız durabilir). Varsayılan: evet. */
  showJockey?: boolean;
  /** Numaralı eyer örtüsü — yalnızca yarışta anlamlı. Varsayılan: `showJockey`. */
  showSaddleCloth?: boolean;
}

interface LegRefs {
  upper: React.RefObject<THREE.Group | null>;
  lower: React.RefObject<THREE.Group | null>;
}

function useLegRefs(): LegRefs {
  return { upper: useRef<THREE.Group>(null), lower: useRef<THREE.Group>(null) };
}

export function HorseModel({
  horseId,
  silkColor,
  saddleNumber,
  isMoving,
  castShadow,
  appearance,
  demeanor,
  showJockey = true,
  showSaddleCloth,
}: HorseModelProps): React.ReactElement {
  const coatIndex = hashString(horseId) % COAT_COLORS.length;
  const palette = appearance ? paletteFor(appearance) : null;
  const coat: string = palette?.body ?? COAT_COLORS[coatIndex] ?? COAT_COLORS[0];
  const mane: string = palette?.mane ?? MANE_COLORS[coatIndex] ?? MANE_COLORS[0];
  const lowerLeg = palette?.lowerLeg ?? '#2a1c14';
  const faceMarking = appearance?.faceMarking ?? 'none';
  const legMarking = appearance?.legMarking ?? 'none';
  const phaseOffset = (hashString(`${horseId}:phase`) % 1000) / 1000;
  const numberTexture = useNumberTexture(saddleNumber, silkColor);
  const geometry = useMemo(() => getHorseGeometries(), []);
  const materials = useHorseMaterials(coat, mane, lowerLeg);

  const bodyRef = useRef<THREE.Group>(null);
  const neckRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const earsRef = useRef<THREE.Group>(null);
  const foreLeft = useLegRefs();
  const foreRight = useLegRefs();
  const hindLeft = useLegRefs();
  const hindRight = useLegRefs();

  useFrame(({ clock }) => {
    const legs: Array<[LegRefs, number, boolean]> = [
      [hindLeft, LEG_PHASES.hindLeft, true],
      [hindRight, LEG_PHASES.hindRight, true],
      [foreLeft, LEG_PHASES.foreLeft, false],
      [foreRight, LEG_PHASES.foreRight, false],
    ];
    if (!isMoving) {
      for (const [leg] of legs) {
        if (leg.upper.current) leg.upper.current.rotation.z = 0;
        if (leg.lower.current) leg.lower.current.rotation.z = 0;
      }
      if (!demeanor) return;
      // BEKLEME DAVRANIŞI — parametreler config'ten (horse-presence.config.json).
      const time = clock.elapsedTime + phaseOffset * 10;
      const breath = Math.sin(time * TWO_PI * 0.3 * demeanor.breathRate);
      const shift = Math.sin(time * TWO_PI * 0.07 * demeanor.weightShiftRate);
      // Ağırlık aktarma: sol arka bacak dinlenir (sekiz hafif bükülür).
      if (hindLeft.lower.current) hindLeft.lower.current.rotation.z = Math.max(0, shift) * 0.3;
      if (hindLeft.upper.current) hindLeft.upper.current.rotation.z = Math.max(0, shift) * 0.05;
      if (bodyRef.current) {
        bodyRef.current.position.y = breath * 0.008;
        bodyRef.current.rotation.z = 0;
        bodyRef.current.rotation.x = shift * 0.012;
      }
      if (neckRef.current) neckRef.current.rotation.z = demeanor.headLift + breath * 0.02;
      if (tailRef.current) {
        tailRef.current.rotation.z = 0;
        tailRef.current.rotation.x =
          Math.sin(time * TWO_PI * 0.25 * demeanor.tailSwishRate) * 0.25 * demeanor.tailSwishRate;
      }
      if (earsRef.current) earsRef.current.rotation.z = (demeanor.earPerk - 0.5) * 0.5;
      return;
    }
    const t = clock.elapsedTime * GALLOP_HZ + phaseOffset;
    for (const [leg, phase, hind] of legs) {
      const pose = gallopLegPose(fract(t + phase), hind);
      if (leg.upper.current) leg.upper.current.rotation.z = pose.swing;
      if (leg.lower.current) leg.lower.current.rotation.z = pose.flex;
    }
    const wave = Math.sin(t * TWO_PI);
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.abs(wave) * 0.08;
      bodyRef.current.rotation.z = wave * 0.04;
      bodyRef.current.rotation.x = 0;
    }
    if (neckRef.current) neckRef.current.rotation.z = NECK_GALLOP_ANGLE + Math.sin(t * TWO_PI + 1) * 0.06;
    if (tailRef.current) {
      tailRef.current.rotation.z = TAIL_GALLOP_LIFT + wave * 0.05;
      tailRef.current.rotation.x = Math.sin(t * TWO_PI * 0.5) * 0.08;
    }
  });

  const A = HORSE_ANATOMY;
  const poll = pollInNeckFrame();
  const shadowProps = { castShadow, dispose: null } as const;

  const leg = (refs: LegRefs, hind: boolean, side: 1 | -1) => {
    const spec = hind ? A.hindLeg : A.foreLeg;
    const pivot: [number, number, number] = [spec.pivot[0], spec.pivot[1], spec.pivot[2] * side];
    const lowerOrigin: [number, number, number] = hind
      ? [A.hindLeg.hock[0], A.hindLeg.hock[1], 0]
      : [0, -A.foreLeg.upperLength, 0];
    return (
      <group ref={refs.upper} position={pivot}>
        <mesh geometry={hind ? geometry.hindUpper : geometry.foreUpper} material={materials.coat} {...shadowProps} />
        <group ref={refs.lower} position={lowerOrigin}>
          <mesh
            geometry={hind ? geometry.hindLower : geometry.foreLower}
            material={legMarking === 'stockings' ? materials.white : materials.lowerLeg}
            {...shadowProps}
          />
          {legMarking === 'socks' ? (
            <mesh geometry={hind ? geometry.hindSock : geometry.foreSock} material={materials.white} dispose={null} />
          ) : null}
          <mesh geometry={hind ? geometry.hindHoof : geometry.foreHoof} material={materials.hoof} {...shadowProps} />
        </group>
      </group>
    );
  };

  return (
    <group>
      {leg(foreLeft, false, 1)}
      {leg(foreRight, false, -1)}
      {leg(hindLeft, true, 1)}
      {leg(hindRight, true, -1)}
      {/* Gövde grubu: dörtnalda iner-kalkar; jokey ve takım gövdeyle birlikte sallanır. */}
      <group ref={bodyRef}>
        <mesh geometry={geometry.torso} material={materials.coat} {...shadowProps} />
        <group ref={neckRef} position={A.neckPivot}>
          <mesh geometry={geometry.neck} material={materials.coat} {...shadowProps} />
          <mesh geometry={geometry.mane} material={materials.mane} dispose={null} />
          {showJockey ? <mesh geometry={geometry.reins} material={materials.leather} dispose={null} /> : null}
          <group position={poll}>
            <mesh geometry={geometry.head} material={materials.coat} {...shadowProps} />
            <mesh geometry={geometry.headDark} material={materials.dark} dispose={null} />
            <group ref={earsRef} position={EAR_PIVOT}>
              <mesh geometry={geometry.ears} material={materials.coat} dispose={null} />
            </group>
            <mesh geometry={geometry.tackHead} material={materials.leather} dispose={null} />
            <FaceMarking kind={faceMarking} material={materials.white} />
          </group>
        </group>
        <group ref={tailRef} position={A.tailRoot}>
          <mesh geometry={geometry.tail} material={materials.mane} {...shadowProps} />
        </group>
        {showJockey ? <mesh geometry={geometry.tackBody} material={materials.leather} {...shadowProps} /> : null}
        {(showSaddleCloth ?? showJockey) ? (
          // Paylaşılan geometri prop olarak verilir (R3F onu yok etmez); yalnızca
          // bu örneğin malzemesi kaldırılınca temizlenir.
          <mesh geometry={geometry.saddleCloth}>
            <meshStandardMaterial
              map={numberTexture ?? undefined}
              color={numberTexture ? '#ffffff' : '#f4f1ea'}
              roughness={0.7}
            />
          </mesh>
        ) : null}
        {showJockey ? <ProceduralJockey silkColor={silkColor} castShadow={castShadow} /> : null}
      </group>
    </group>
  );
}

/**
 * Yüz işareti — baş çerçevesinde, alnın/burnun üst yüzeyine oturur
 * (`headTopPoint`). star = alında leke, stripe = ince şerit, blaze = geniş
 * şerit, snip = burun ucunda leke.
 */
function FaceMarking({
  kind,
  material,
}: {
  kind: HorseAppearance['faceMarking'];
  material: THREE.Material;
}): React.ReactElement | null {
  if (kind === 'none') return null;
  if (kind === 'star' || kind === 'snip') {
    const point = kind === 'star' ? headTopPoint(1, 0.97) : headTopPoint(4, 0.9);
    const size = kind === 'star' ? 0.045 : 0.035;
    return (
      <mesh position={point} scale={[size, size * 0.35, size * 0.9]} material={material}>
        <sphereGeometry args={[1, 10, 6]} />
      </mesh>
    );
  }
  const from = headTopPoint(1, 0.97);
  const to = headTopPoint(3, 0.97);
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const width = kind === 'blaze' ? 0.09 : 0.035;
  return (
    <mesh
      position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0]}
      rotation={[0, 0, Math.atan2(to[1] - from[1], to[0] - from[0])]}
      material={material}
    >
      <boxGeometry args={[length, 0.012, width]} />
    </mesh>
  );
}

/** Jokeyin oturma noktası (atın gövde çerçevesinde; `HorseAvatar3D` `DEFAULT_MOUNT` ile aynı). */
const JOCKEY_MOUNT: [number, number, number] = [0.15, 1.75, 0];

export function ProceduralJockey({
  silkColor,
  castShadow,
}: {
  silkColor: string;
  castShadow: boolean;
}): React.ReactElement {
  const geometry = useMemo(() => getJockeyGeometries(), []);
  const materials = useMemo(
    () => ({
      silks: new THREE.MeshStandardMaterial({ color: silkColor, roughness: 0.35, metalness: 0.05 }),
      breeches: new THREE.MeshStandardMaterial({ color: '#eeeae2', roughness: 0.6 }),
      boots: new THREE.MeshStandardMaterial({ color: '#141110', roughness: 0.4 }),
      skin: new THREE.MeshStandardMaterial({ color: '#c99a7a', roughness: 0.7 }),
      leathers: new THREE.MeshStandardMaterial({ color: '#3a3530', roughness: 0.4, metalness: 0.4 }),
    }),
    [silkColor],
  );
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );
  return (
    <group position={JOCKEY_MOUNT}>
      <mesh geometry={geometry.silks} material={materials.silks} castShadow={castShadow} dispose={null} />
      <mesh geometry={geometry.breeches} material={materials.breeches} castShadow={castShadow} dispose={null} />
      <mesh geometry={geometry.boots} material={materials.boots} castShadow={castShadow} dispose={null} />
      <mesh geometry={geometry.skin} material={materials.skin} dispose={null} />
      <mesh geometry={geometry.leathers} material={materials.leathers} dispose={null} />
    </group>
  );
}
