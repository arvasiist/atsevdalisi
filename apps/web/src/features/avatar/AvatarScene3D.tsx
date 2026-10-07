'use client';

/**
 * AVATAR ÖNİZLEME SAHNESİ (07.10.2026). Tek Canvas, dışarıdan dosya indirmez
 * (CLAUDE.md (13)); kalite kademesi diğer sahnelerle ORTAK (`useQualityTier`).
 */

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { AvatarAppearance } from '@at-sevdalisi/shared-types';
import { SCENE_GL_OPTIONS, SceneRenderSettings } from '../race-viewer/SceneRenderSettings';
import { SceneQualityMonitor } from '../race-viewer/SceneQualityMonitor';
import { useQualityTier } from '../race-viewer/use-quality-tier';
import { AvatarFigure3D, type AvatarOutfitMode, type AvatarPose } from './AvatarFigure3D';

export function AvatarScene3D({
  appearance,
  outfit,
  pose,
}: {
  appearance: AvatarAppearance;
  outfit: AvatarOutfitMode;
  pose: AvatarPose;
}): React.ReactElement {
  const quality = useQualityTier();
  const settings = quality.settings;
  return (
    <div className="avatar3d" data-testid="avatar-scene">
      <Canvas
        key={settings.tier}
        shadows={settings.shadowsEnabled}
        dpr={[1, settings.pixelRatioCap]}
        camera={{ position: [1.1, 1.45, 3.6], fov: 36 }}
        gl={SCENE_GL_OPTIONS}
      >
        <SceneQualityMonitor enabled={quality.preference === 'auto'} onDecline={quality.reportPerformanceDecline} />
        <Suspense fallback={null}>
          <SceneRenderSettings settings={settings} />
          <color attach="background" args={['#0f1626']} />
          <hemisphereLight args={['#f4e7cc', '#1a2238', 0.7]} />
          <directionalLight
            position={[2.5, 4, 3]}
            intensity={1.8}
            color="#fff1d6"
            castShadow={settings.shadowsEnabled}
            shadow-mapSize={[1024, 1024]}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[1.4, 48]} />
            <meshStandardMaterial color="#1c2640" roughness={0.9} />
          </mesh>
          <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={3} blur={2.2} far={2} />
          <AvatarFigure3D appearance={appearance} outfit={outfit} pose={pose} castShadow={settings.shadowsEnabled} />
          <OrbitControls
            target={[0, 1.0, 0]}
            enablePan={false}
            minDistance={1.8}
            maxDistance={5}
            minPolarAngle={0.6}
            maxPolarAngle={1.6}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
