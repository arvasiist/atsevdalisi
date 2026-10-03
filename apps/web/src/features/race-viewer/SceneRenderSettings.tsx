'use client';

/**
 * SAHNELERİN ORTAK RENDER AYARLARI (01.10.2026, 3D adım 7) — yarış, ana
 * sayfa ve ahır aynı ton eşleme pozlamasını ve (yalnızca 'ultra' kademede)
 * aynı yumuşak gölgeyi kullanır; sahneler arası geçişte görünüm tutarlı kalır.
 * Değerler `config/lighting.config.json`dan gelir.
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { loadLightingConfig } from '@at-sevdalisi/game-config';
import type { QualityTierRenderSettings } from './quality-tier';

export const LIGHTING = loadLightingConfig();

/** `<Canvas gl={...}>` için ortak renderer seçenekleri. */
export const SCENE_GL_OPTIONS = {
  antialias: true,
  toneMapping: THREE.ACESFilmicToneMapping,
  outputColorSpace: THREE.SRGBColorSpace,
} as const;

export function SceneRenderSettings({
  settings,
}: {
  settings: QualityTierRenderSettings;
}): React.ReactElement | null {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = LIGHTING.toneMappingExposure;
  }, [gl]);
  return settings.softShadowsEnabled && settings.shadowsEnabled ? (
    <SoftShadows
      size={LIGHTING.softShadows.size}
      samples={LIGHTING.softShadows.samples}
      focus={LIGHTING.softShadows.focus}
    />
  ) : null;
}
