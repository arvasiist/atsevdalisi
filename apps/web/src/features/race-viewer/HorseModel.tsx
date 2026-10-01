'use client';

/**
 * PROSEDÜREL AT + JOKEY MODELİ (01.10.2026 tasarım yenilemesi).
 *
 * Eski `HorseMarker` bir kapsül + küreydi. Bu bileşen, gerçek bir `.glb`
 * modeli gelene kadar (bkz. `assets/asset-manifest.ts`, CLAUDE.md kural 8:
 * sahte/lisanssız varlık YOK) yalnızca three.js ilkel şekilleriyle bir at
 * silüeti kurar: gövde, boyun, baş, kulaklar, dört eklemli bacak, kuyruk,
 * yele, numaralı eyer örtüsü ve formalı bir jokey. Bacaklar dörtnal
 * fazlarıyla salınır.
 *
 * Koordinatlar: ileri yön yerel +X'tir (`RaceScene3D` grubu
 * `rotation.y = -heading` ile döndürür; heading 0 = +X). Ölçek gerçeğe
 * yakındır (gövde ~2.4 m, cidago ~1.6 m).
 *
 * Görsel çeşitlilik (don rengi) `horseId`den TÜRETİLİR — `Math.random()`
 * kullanılmaz (CLAUDE.md kural 3'ün ruhu: aynı yarış her izlemede aynı
 * görünür).
 */

import { forwardRef, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Gerçekçi don renkleri: doru, koyu doru, yağız, al, kır. */
const COAT_COLORS = ['#6b3a1f', '#4a2a17', '#1d1714', '#8c4a20', '#7a726a', '#5a3320'] as const;
const MANE_COLORS = ['#1a1210', '#140e0b', '#0d0a09', '#3a1e0f', '#3d3833', '#140e0b'] as const;

const GALLOP_HZ = 2.3;
const TWO_PI = Math.PI * 2;
/** Dörtnal sırası: arka sol → arka sağ → ön sol → ön sağ (faz, tur oranı). */
const LEG_PHASES = { hindLeft: 0, hindRight: 0.12, foreLeft: 0.42, foreRight: 0.54 } as const;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Eyer örtüsü numarası — çalışma anında çizilen doku (dosya değil). */
function useNumberTexture(saddleNumber: number, silkColor: string): THREE.CanvasTexture | null {
  return useMemo(() => {
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
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [saddleNumber, silkColor]);
}

export interface HorseModelProps {
  horseId: string;
  /** Jokey forması rengi (yarışçıya özgü). */
  silkColor: string;
  saddleNumber: number;
  isMoving: boolean;
  castShadow: boolean;
}

export function HorseModel({
  horseId,
  silkColor,
  saddleNumber,
  isMoving,
  castShadow,
}: HorseModelProps): React.ReactElement {
  const coatIndex = hashString(horseId) % COAT_COLORS.length;
  const coat: string = COAT_COLORS[coatIndex] ?? COAT_COLORS[0];
  const mane: string = MANE_COLORS[coatIndex] ?? MANE_COLORS[0];
  const phaseOffset = (hashString(`${horseId}:phase`) % 1000) / 1000;
  const numberTexture = useNumberTexture(saddleNumber, silkColor);

  const bodyRef = useRef<THREE.Group>(null);
  const hindLeftRef = useRef<THREE.Group>(null);
  const hindRightRef = useRef<THREE.Group>(null);
  const foreLeftRef = useRef<THREE.Group>(null);
  const foreRightRef = useRef<THREE.Group>(null);
  const neckRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * GALLOP_HZ + phaseOffset;
    const amplitude = isMoving ? 1 : 0;
    const swing = (phase: number) => Math.sin((t + phase) * TWO_PI) * 0.75 * amplitude;
    if (hindLeftRef.current) hindLeftRef.current.rotation.z = swing(LEG_PHASES.hindLeft);
    if (hindRightRef.current) hindRightRef.current.rotation.z = swing(LEG_PHASES.hindRight);
    if (foreLeftRef.current) foreLeftRef.current.rotation.z = -swing(LEG_PHASES.foreLeft);
    if (foreRightRef.current) foreRightRef.current.rotation.z = -swing(LEG_PHASES.foreRight);
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.abs(Math.sin(t * TWO_PI)) * 0.12 * amplitude;
      bodyRef.current.rotation.z = Math.sin(t * TWO_PI) * 0.05 * amplitude;
    }
    if (neckRef.current)
      neckRef.current.rotation.z = -0.7 + Math.sin(t * TWO_PI + 1) * 0.08 * amplitude;
  });

  const coatMaterial = <meshStandardMaterial color={coat} roughness={0.42} metalness={0.08} />;
  const darkMaterial = <meshStandardMaterial color={mane} roughness={0.8} metalness={0} />;

  return (
    <group ref={bodyRef}>
      {/* Gövde */}
      <mesh
        position={[0, 1.3, 0]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[1.12, 1, 0.9]}
        castShadow={castShadow}
      >
        <capsuleGeometry args={[0.36, 1.25, 6, 14]} />
        {coatMaterial}
      </mesh>
      {/* Göğüs ve sağrı dolgunluğu */}
      <mesh position={[0.62, 1.32, 0]} scale={[1, 1.08, 0.86]} castShadow={castShadow}>
        <sphereGeometry args={[0.42, 14, 12]} />
        {coatMaterial}
      </mesh>
      <mesh position={[-0.66, 1.36, 0]} scale={[1.05, 1, 0.92]} castShadow={castShadow}>
        <sphereGeometry args={[0.42, 14, 12]} />
        {coatMaterial}
      </mesh>

      {/* Boyun + baş (eklem göğüste) */}
      <group ref={neckRef} position={[0.82, 1.5, 0]} rotation={[0, 0, -0.7]}>
        <mesh position={[0, 0.45, 0]} castShadow={castShadow}>
          <cylinderGeometry args={[0.17, 0.3, 1.0, 12]} />
          {coatMaterial}
        </mesh>
        {/* Yele */}
        <mesh position={[-0.16, 0.48, 0]} rotation={[0, 0, 0.12]}>
          <boxGeometry args={[0.08, 0.95, 0.07]} />
          {darkMaterial}
        </mesh>
        {/* Baş: boyun ucundan aşağı-ileri */}
        <group position={[0, 0.95, 0]} rotation={[0, 0, 1.75]}>
          <mesh position={[0, 0.3, 0]} castShadow={castShadow}>
            <cylinderGeometry args={[0.09, 0.15, 0.62, 10]} />
            {coatMaterial}
          </mesh>
          <mesh position={[0, 0.62, 0]}>
            <sphereGeometry args={[0.1, 10, 8]} />
            {darkMaterial}
          </mesh>
          {/* Kulaklar */}
          <mesh position={[-0.06, -0.02, 0.07]} rotation={[0, 0, -1.4]}>
            <coneGeometry args={[0.04, 0.16, 6]} />
            {coatMaterial}
          </mesh>
          <mesh position={[-0.06, -0.02, -0.07]} rotation={[0, 0, -1.4]}>
            <coneGeometry args={[0.04, 0.16, 6]} />
            {coatMaterial}
          </mesh>
        </group>
      </group>

      {/* Kuyruk */}
      <mesh position={[-1.2, 1.25, 0]} rotation={[0, 0, -0.55]}>
        <cylinderGeometry args={[0.05, 0.11, 0.85, 8]} />
        {darkMaterial}
      </mesh>

      {/* Bacaklar (kalça/omuz ekleminden salınır) */}
      <Leg ref={foreLeftRef} position={[0.62, 1.05, 0.17]} coat={coat} castShadow={castShadow} />
      <Leg ref={foreRightRef} position={[0.62, 1.05, -0.17]} coat={coat} castShadow={castShadow} />
      <Leg
        ref={hindLeftRef}
        position={[-0.68, 1.08, 0.17]}
        coat={coat}
        castShadow={castShadow}
        hind
      />
      <Leg
        ref={hindRightRef}
        position={[-0.68, 1.08, -0.17]}
        coat={coat}
        castShadow={castShadow}
        hind
      />

      {/* Eyer örtüsü (numaralı) — iki yan yüz */}
      <mesh position={[-0.05, 1.42, 0.335]}>
        <planeGeometry args={[0.62, 0.42]} />
        <meshStandardMaterial
          map={numberTexture ?? undefined}
          color={numberTexture ? '#ffffff' : '#f4f1ea'}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[-0.05, 1.42, -0.335]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.62, 0.42]} />
        <meshStandardMaterial
          map={numberTexture ?? undefined}
          color={numberTexture ? '#ffffff' : '#f4f1ea'}
          roughness={0.7}
        />
      </mesh>

      <Jockey silkColor={silkColor} castShadow={castShadow} />
    </group>
  );
}

interface LegProps {
  position: [number, number, number];
  coat: string;
  castShadow: boolean;
  hind?: boolean;
}

const Leg = forwardRef<THREE.Group, LegProps>(function Leg(
  { position, coat, castShadow, hind = false },
  ref,
) {
  return (
    <group ref={ref} position={position}>
      {/* Üst bacak */}
      <mesh position={[hind ? -0.04 : 0, -0.27, 0]} castShadow={castShadow}>
        <cylinderGeometry args={[hind ? 0.1 : 0.085, 0.06, 0.55, 8]} />
        <meshStandardMaterial color={coat} roughness={0.45} metalness={0.06} />
      </mesh>
      {/* Alt bacak (koyu bilek) */}
      <mesh position={[0, -0.75, 0]} castShadow={castShadow}>
        <cylinderGeometry args={[0.05, 0.045, 0.45, 8]} />
        <meshStandardMaterial color="#2a1c14" roughness={0.6} />
      </mesh>
      {/* Toynak */}
      <mesh position={[0.02, -1.0, 0]}>
        <cylinderGeometry args={[0.055, 0.07, 0.08, 8]} />
        <meshStandardMaterial color="#141110" roughness={0.5} />
      </mesh>
    </group>
  );
});

function Jockey({
  silkColor,
  castShadow,
}: {
  silkColor: string;
  castShadow: boolean;
}): React.ReactElement {
  return (
    <group position={[0.15, 1.75, 0]}>
      {/* Beyaz pantolon (çömelmiş bacaklar) */}
      <mesh position={[-0.05, 0.02, 0.2]} rotation={[0, 0, 0.9]} castShadow={castShadow}>
        <capsuleGeometry args={[0.08, 0.32, 4, 8]} />
        <meshStandardMaterial color="#eeeae2" roughness={0.6} />
      </mesh>
      <mesh position={[-0.05, 0.02, -0.2]} rotation={[0, 0, 0.9]} castShadow={castShadow}>
        <capsuleGeometry args={[0.08, 0.32, 4, 8]} />
        <meshStandardMaterial color="#eeeae2" roughness={0.6} />
      </mesh>
      {/* Gövde — öne eğik, formalı */}
      <mesh position={[0.12, 0.28, 0]} rotation={[0, 0, -1.15]} castShadow={castShadow}>
        <capsuleGeometry args={[0.17, 0.38, 6, 10]} />
        <meshStandardMaterial color={silkColor} roughness={0.35} metalness={0.05} />
      </mesh>
      {/* Kollar dizgine uzanır */}
      <mesh position={[0.38, 0.2, 0.14]} rotation={[0, 0, -1.9]}>
        <capsuleGeometry args={[0.05, 0.32, 4, 6]} />
        <meshStandardMaterial color={silkColor} roughness={0.35} />
      </mesh>
      <mesh position={[0.38, 0.2, -0.14]} rotation={[0, 0, -1.9]}>
        <capsuleGeometry args={[0.05, 0.32, 4, 6]} />
        <meshStandardMaterial color={silkColor} roughness={0.35} />
      </mesh>
      {/* Kask */}
      <mesh position={[0.42, 0.46, 0]} castShadow={castShadow}>
        <sphereGeometry args={[0.14, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial color={silkColor} roughness={0.25} metalness={0.15} />
      </mesh>
      {/* Yüz */}
      <mesh position={[0.45, 0.41, 0]}>
        <sphereGeometry args={[0.11, 10, 8]} />
        <meshStandardMaterial color="#c99a7a" roughness={0.7} />
      </mesh>
    </group>
  );
}
