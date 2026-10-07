'use client';

/**
 * PROSEDÜREL AVATAR FİGÜRÜ (07.10.2026, brief §49 manuel oluşturucu).
 *
 * Basit geometrilerden insan figürü; görünüş katalog seçimlerinden gelir.
 * Bu bir yedektir: AI avatar (GLB, brief §42) gelene kadar oyuncunun
 * kimliği budur ve ekranda "gerçekçi" diye sunulmaz. Animasyonlar (bekleme,
 * el sallama, tezahürat) yalnızca sunumdur.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { AvatarAppearance } from '@at-sevdalisi/shared-types';
import { avatarColors } from './avatar-catalog';

export type AvatarOutfitMode = 'social' | 'race';
export type AvatarPose = 'idle' | 'wave' | 'cheer';

const SHOE_COLORS: Record<string, string> = { boots: '#3b2616', sneakers: '#e8e8e8', loafers: '#1c1410' };

export function AvatarFigure3D({
  appearance,
  outfit,
  pose,
  castShadow,
}: {
  appearance: AvatarAppearance;
  outfit: AvatarOutfitMode;
  pose: AvatarPose;
  castShadow: boolean;
}): React.ReactElement {
  const colors = avatarColors(appearance);
  const body = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftArm = useRef<Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (body.current) body.current.position.y = Math.sin(t * 1.6) * 0.012 + (pose === 'cheer' ? Math.abs(Math.sin(t * 5)) * 0.08 : 0);
    // +x tarafındaki kol POZİTİF z dönüşüyle dışarı/yukarı kalkar (negatif
    // açı kolu başın üstünden içeri savururdu); -x tarafı simetrik.
    if (rightArm.current) {
      rightArm.current.rotation.z =
        pose === 'wave' ? 2.4 + Math.sin(t * 8) * 0.35 : pose === 'cheer' ? 2.8 : 0.12 + Math.sin(t * 1.6) * 0.03;
    }
    if (leftArm.current) leftArm.current.rotation.z = pose === 'cheer' ? -2.8 : -0.12 - Math.sin(t * 1.6) * 0.03;
  });

  const torsoColor = outfit === 'race' ? colors.silksPrimary : colors.outfit;
  const legColor = outfit === 'race' ? '#f2efe6' : appearance.socialOutfit === 'suit' ? colors.outfit : '#2c3550';
  const shoeColor = outfit === 'race' ? '#1b1410' : (SHOE_COLORS[appearance.shoes] ?? '#222');
  const shadow = { castShadow, receiveShadow: false };

  return (
    <group ref={body}>
      {/* Bacaklar + ayakkabı */}
      {[-0.11, 0.11].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.45, 0]} {...shadow}>
            <capsuleGeometry args={[0.075, 0.6, 4, 10]} />
            <meshStandardMaterial color={legColor} roughness={0.8} />
          </mesh>
          <mesh position={[0, outfit === 'race' || appearance.shoes === 'boots' ? 0.12 : 0.05, 0.04]} {...shadow}>
            <boxGeometry args={[0.13, outfit === 'race' || appearance.shoes === 'boots' ? 0.24 : 0.1, 0.24]} />
            <meshStandardMaterial color={shoeColor} roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* Gövde */}
      <mesh position={[0, 1.12, 0]} {...shadow}>
        <capsuleGeometry args={[0.2, 0.42, 6, 14]} />
        <meshStandardMaterial color={torsoColor} roughness={0.7} />
      </mesh>
      {outfit === 'race' ? <SilkPattern pattern={appearance.raceOutfit} color={colors.silksSecondary} /> : null}
      {outfit === 'social' && appearance.socialOutfit !== 'casual' ? (
        <mesh position={[0, 1.2, 0.2]}>
          <boxGeometry args={[0.07, 0.34, 0.02]} />
          <meshStandardMaterial color={appearance.socialOutfit === 'suit' ? '#f4f1ea' : '#d8cfb8'} />
        </mesh>
      ) : null}
      {/* Kollar */}
      <group ref={rightArm} position={[0.27, 1.38, 0]}>
        <mesh position={[0, -0.28, 0]} {...shadow}>
          <capsuleGeometry args={[0.06, 0.42, 4, 10]} />
          <meshStandardMaterial color={torsoColor} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.58, 0]}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshStandardMaterial color={colors.skin} roughness={0.6} />
        </mesh>
      </group>
      <group ref={leftArm} position={[-0.27, 1.38, 0]}>
        <mesh position={[0, -0.28, 0]} {...shadow}>
          <capsuleGeometry args={[0.06, 0.42, 4, 10]} />
          <meshStandardMaterial color={torsoColor} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.58, 0]}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshStandardMaterial color={colors.skin} roughness={0.6} />
        </mesh>
      </group>
      {/* Boyun + baş */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.1, 12]} />
        <meshStandardMaterial color={colors.skin} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.7, 0]} {...shadow}>
        <sphereGeometry args={[0.17, 24, 24]} />
        <meshStandardMaterial color={colors.skin} roughness={0.55} />
      </mesh>
      {[-0.06, 0.06].map((x) => (
        <mesh key={x} position={[x, 1.72, 0.155]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshStandardMaterial color="#1a1410" />
        </mesh>
      ))}
      <Hair style={appearance.hairStyle} color={colors.hair} hidden={outfit === 'race'} />
      {outfit === 'race' ? (
        <mesh position={[0, 1.76, 0]}>
          <sphereGeometry args={[0.185, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={colors.silksPrimary} roughness={0.4} />
        </mesh>
      ) : (
        <Hat kind={appearance.hat} color={colors.outfit} />
      )}
      <Accessory kind={appearance.accessory} color={colors.outfit} />
    </group>
  );
}

function SilkPattern({ pattern, color }: { pattern: string; color: string }): React.ReactElement | null {
  if (pattern === 'solid') return null;
  if (pattern === 'halves') {
    return (
      // Sağ yarı: gövdenin sağ tarafını saran ince kutu (sol yarı ana renkte kalır).
      <mesh position={[0.105, 1.12, 0]}>
        <boxGeometry args={[0.2, 0.62, 0.41]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    );
  }
  const bands = pattern === 'hoops' ? [0.95, 1.12, 1.29] : [-0.1, 0, 0.1];
  return (
    <group>
      {bands.map((v) =>
        pattern === 'hoops' ? (
          <mesh key={v} position={[0, v, 0]}>
            <cylinderGeometry args={[0.207, 0.207, 0.06, 20]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        ) : (
          <mesh key={v} position={[v, 1.12, 0.19]}>
            <boxGeometry args={[0.04, 0.55, 0.03]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        ),
      )}
    </group>
  );
}

function Hair({ style, color, hidden }: { style: string; color: string; hidden: boolean }): React.ReactElement | null {
  if (hidden || style === 'bald') return null;
  const cap = (
    <mesh position={[0, 1.75, -0.01]}>
      <sphereGeometry args={[0.178, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2.1]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
  if (style === 'short') return cap;
  if (style === 'curly') {
    return (
      <group>
        {cap}
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.15, 1.8, Math.sin(a) * 0.15 - 0.01]}>
              <sphereGeometry args={[0.06, 10, 10]} />
              <meshStandardMaterial color={color} roughness={0.95} />
            </mesh>
          );
        })}
      </group>
    );
  }
  if (style === 'ponytail') {
    return (
      <group>
        {cap}
        <mesh position={[0, 1.62, -0.2]} rotation={[0.4, 0, 0]}>
          <capsuleGeometry args={[0.045, 0.22, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      </group>
    );
  }
  // long
  return (
    <group>
      {cap}
      <mesh position={[0, 1.55, -0.07]}>
        <boxGeometry args={[0.34, 0.36, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Hat({ kind, color }: { kind: string; color: string }): React.ReactElement | null {
  if (kind === 'none') return null;
  if (kind === 'fedora') {
    return (
      <group position={[0, 1.84, 0]}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.28, 0.02, 24]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.15, 0.17, 0.16, 20]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      </group>
    );
  }
  // cap / flatcap: kubbe + siperlik
  return (
    <group position={[0, 1.78, 0]}>
      <mesh>
        <sphereGeometry args={[0.185, 20, 12, 0, Math.PI * 2, 0, kind === 'flatcap' ? Math.PI / 3 : Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.02, 0.17]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[0.24, 0.015, kind === 'flatcap' ? 0.09 : 0.14]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Accessory({ kind, color }: { kind: string; color: string }): React.ReactElement | null {
  if (kind === 'glasses') {
    return (
      <group position={[0, 1.72, 0.165]}>
        {[-0.06, 0.06].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <torusGeometry args={[0.035, 0.008, 8, 16]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        ))}
      </group>
    );
  }
  if (kind === 'scarf') {
    return (
      <mesh position={[0, 1.47, 0]}>
        <torusGeometry args={[0.12, 0.045, 10, 20]} />
        <meshStandardMaterial color={color === '#e8dcc0' ? '#6b1f2a' : '#e8dcc0'} roughness={0.9} />
      </mesh>
    );
  }
  if (kind === 'medal') {
    return (
      <mesh position={[0, 1.18, 0.21]}>
        <cylinderGeometry args={[0.045, 0.045, 0.012, 20]} />
        <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.3} />
      </mesh>
    );
  }
  return null;
}
