'use client';

/**
 * HİPODROM ÇEVRESİ (01.10.2026, 3D adım 5) — yarış ve ana sayfa sahnelerinin
 * ORTAK çevresi.
 *
 * `public/models/hippodrome-environment.glb` varsa: model kendi koordinatıyla
 * (metre, orijin = pist merkezi; manifest `keepOrigin`) yerleşir ve
 * prosedürel tribün/kule/ağaçların yerini alır. Yoksa prosedürel çevre +
 * animasyonlu kalabalık (PLACEHOLDER).
 *
 * Pist (kum şerit), korkuluklar ve çim HER DURUMDA oyunun kendisinden gelir:
 * atların konumu `track-path.ts` geometrisine bağlıdır; ortam modeli kendi
 * pistini getirse bile yarış yolu onunla hizalanmak zorunda kalırdı. Ortam
 * modeli bu yüzden pist alanını BOŞ bırakmalıdır (ASSET_GUIDE).
 */

import { useMemo } from 'react';
import { loadAtmosphereConfig, loadVfxConfig } from '@at-sevdalisi/game-config';
import type { RaceSurface } from '@at-sevdalisi/shared-types';
import { GltfAssetLoader } from './assets/GltfAssetLoader';
import { getAssetById } from './assets/asset-manifest';
import { forwardAxisRotation } from './assets/model-fit';
import type { QualityTier } from './quality-tier';
import { DirtTrack, Grandstand, Grass, Rails, TrackFurniture, TreeLine } from './TrackScenery';
import type { StadiumTrackGeometry } from './track-path';

const ENVIRONMENT_ASSET = getAssetById('HIPPODROME_ENVIRONMENT_REQUIRED');
const ATMOSPHERE = loadAtmosphereConfig();
const VFX = loadVfxConfig();

export interface HippodromeSurroundingsProps {
  geometry: StadiumTrackGeometry;
  /** Kalabalık heyecanı 0..1 (`race-atmosphere.ts`). */
  crowdExcitement: number;
  qualityTier: QualityTier;
  /** 01.10.2026 (adım 8) — yarışın zemini; pist yüzeyinin rengi buna göre. */
  surface?: RaceSurface;
}

export function HippodromeSurroundings({
  geometry,
  crowdExcitement,
  qualityTier,
  surface = 'dirt',
}: HippodromeSurroundingsProps): React.ReactElement {
  const density = ATMOSPHERE.crowd.densityByTier[qualityTier];
  const procedural = (
    <>
      <Grandstand geometry={geometry} excitement={crowdExcitement} density={density} />
      <TrackFurniture geometry={geometry} />
      <TreeLine geometry={geometry} />
    </>
  );
  const rotationY = useMemo(
    () =>
      ENVIRONMENT_ASSET?.binding ? forwardAxisRotation(ENVIRONMENT_ASSET.binding.forwardAxis) : 0,
    [],
  );
  return (
    <>
      <Grass />
      <DirtTrack geometry={geometry} color={VFX.trackColorBySurface[surface]} />
      <Rails geometry={geometry} />
      {ENVIRONMENT_ASSET ? (
        <GltfAssetLoader asset={ENVIRONMENT_ASSET} fallback={procedural}>
          {(gltf) => (
            <group rotation={[0, rotationY, 0]}>
              <primitive object={gltf.scene} />
            </group>
          )}
        </GltfAssetLoader>
      ) : (
        procedural
      )}
    </>
  );
}
