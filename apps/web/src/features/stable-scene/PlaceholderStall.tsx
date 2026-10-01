'use client';

/**
 * PLACEHOLDER AHIR BÖLMESİ (01.10.2026, 3D adım 6). Gerçek
 * `stable-environment.glb` gelene kadar sahnenin neyi göstereceğini anlatan
 * prosedürel bölme: arka ve yan ahşap duvarlar (tahta şeritleri), ön yarım
 * kapı, saman zemin, duvara asılı yemlik, su kovası, eyer askısı, fener.
 * Ekranda PLACEHOLDER rozetiyle birlikte gösterilir; "gerçekçi" iddiası yok.
 *
 * Koordinat: orijin bölme zemininin ortası, at +X'e bakar (manifest
 * `STABLE_ENVIRONMENT_REQUIRED.binding` ile aynı sözleşme).
 */

const STALL_LENGTH = 4.4;
const STALL_WIDTH = 3.6;
const WALL_HEIGHT = 2.6;
const PLANK_HEIGHT = 0.22;
const WOOD = ['#6b4a2f', '#734f33', '#5f4229'];

function PlankWall({
  length,
  position,
  rotationY,
  castShadow,
}: {
  length: number;
  position: [number, number, number];
  rotationY: number;
  castShadow: boolean;
}): React.ReactElement {
  const count = Math.floor(WALL_HEIGHT / PLANK_HEIGHT);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {Array.from({ length: count }, (_, i) => (
        <mesh
          key={i}
          position={[0, PLANK_HEIGHT / 2 + i * PLANK_HEIGHT, 0]}
          castShadow={castShadow}
          receiveShadow
        >
          <boxGeometry args={[length, PLANK_HEIGHT * 0.94, 0.08]} />
          <meshStandardMaterial color={WOOD[i % WOOD.length]} roughness={0.9} />
        </mesh>
      ))}
      {/* Dikey kirişler */}
      {[-length / 2, 0, length / 2].map((x) => (
        <mesh key={x} position={[x, WALL_HEIGHT / 2, 0.06]} castShadow={castShadow}>
          <boxGeometry args={[0.14, WALL_HEIGHT, 0.14]} />
          <meshStandardMaterial color="#4a3220" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function PlaceholderStall({ castShadow }: { castShadow: boolean }): React.ReactElement {
  const halfL = STALL_LENGTH / 2;
  const halfW = STALL_WIDTH / 2;
  return (
    <group>
      {/* Zemin: taş + saman */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#3d3830" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[STALL_LENGTH, STALL_WIDTH]} />
        <meshStandardMaterial color="#c8a75c" roughness={1} />
      </mesh>
      {/* Arka duvar (atın arkası, -X) ve yanlar */}
      <PlankWall
        length={STALL_WIDTH}
        position={[-halfL, 0, 0]}
        rotationY={Math.PI / 2}
        castShadow={castShadow}
      />
      <PlankWall
        length={STALL_LENGTH}
        position={[0, 0, -halfW]}
        rotationY={0}
        castShadow={castShadow}
      />
      {/* Ön yarım kapı (+X, alçak) */}
      <group position={[halfL, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} position={[0, 0.12 + i * PLANK_HEIGHT, 0]} castShadow={castShadow}>
            <boxGeometry args={[STALL_WIDTH, PLANK_HEIGHT * 0.94, 0.08]} />
            <meshStandardMaterial color={WOOD[i % WOOD.length]} roughness={0.9} />
          </mesh>
        ))}
      </group>
      {/* Yemlik: yan duvarda, atın başı hizasında */}
      <mesh position={[1.3, 1.05, -halfW + 0.35]} castShadow={castShadow}>
        <boxGeometry args={[0.9, 0.35, 0.5]} />
        <meshStandardMaterial color="#5a5f66" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[1.3, 1.2, -halfW + 0.35]}>
        <boxGeometry args={[0.8, 0.08, 0.4]} />
        <meshStandardMaterial color="#d6b25e" roughness={1} />
      </mesh>
      {/* Su kovası */}
      <mesh position={[1.6, 0.22, halfW - 0.5]} castShadow={castShadow}>
        <cylinderGeometry args={[0.24, 0.2, 0.42, 16]} />
        <meshStandardMaterial color="#8a9096" roughness={0.35} metalness={0.7} />
      </mesh>
      {/* Eyer askısı + eyer (arka duvarda) */}
      <mesh position={[-halfL + 0.25, 1.4, -0.8]}>
        <boxGeometry args={[0.4, 0.06, 0.06]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
      <mesh position={[-halfL + 0.35, 1.48, -0.8]} castShadow={castShadow}>
        <boxGeometry args={[0.3, 0.16, 0.55]} />
        <meshStandardMaterial color="#5a2f1a" roughness={0.55} />
      </mesh>
      {/* Saman balyaları (bölme dışında) */}
      {[
        [3.4, 0.35, -1.6],
        [3.4, 0.35, -0.7],
        [3.4, 1.05, -1.15],
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${y}-${z}`} position={[x!, y!, z!]} castShadow={castShadow} receiveShadow>
          <boxGeometry args={[1.0, 0.7, 0.85]} />
          <meshStandardMaterial color="#cfae5f" roughness={1} />
        </mesh>
      ))}
      {/* Fener */}
      <mesh position={[0.4, 2.35, -halfW + 0.2]}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color="#ffd18a" emissive="#ffb347" emissiveIntensity={2.2} />
      </mesh>
    </group>
  );
}
