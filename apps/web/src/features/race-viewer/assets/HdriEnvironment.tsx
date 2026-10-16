'use client';

/**
 * YEREL HDRI ORTAMI (01.10.2026, 3D adım 7).
 *
 * ⚠️ Geçmiş: drei `<Environment preset>` HDR'yi CDN'den indiriyordu; indirme
 * düşünce yarış ekranı TAMAMEN çöktü (CLAUDE.md (13)). Burada üç güvence var:
 * (1) dosya YEREL (`public/hdri/…`), (2) çağıran önce `useAssetAvailability`
 * ile yoklar, (3) yükleme yine de düşerse hata sınırı `fallback`e döner.
 * `preset` KULLANILMAZ.
 */

import { Suspense } from 'react';
import { Environment } from '@react-three/drei';
import { loadLightingConfig } from '@at-sevdalisi/game-config';
import { GltfErrorBoundary } from './GltfAssetLoader';

const LIGHTING = loadLightingConfig();

export interface HdriEnvironmentProps {
  url: string;
  /** Gökyüzü olarak da görünsün mü (dış mekân: evet, ahır içi: hayır). */
  background: boolean;
  fallback: React.ReactNode;
}

export function HdriEnvironment({
  url,
  background,
  fallback,
}: HdriEnvironmentProps): React.ReactElement {
  return (
    <GltfErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Environment
          files={url}
          background={background}
          environmentIntensity={LIGHTING.hdri.environmentIntensity}
          backgroundIntensity={LIGHTING.hdri.backgroundIntensity}
        />
      </Suspense>
    </GltfErrorBoundary>
  );
}
