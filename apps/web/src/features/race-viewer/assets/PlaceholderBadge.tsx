'use client';

/**
 * PLACEHOLDER ROZETİ (01.10.2026). Gerçek varlık (GLB/HDRI) yokken sahnede
 * gösterilen prosedürel görüntünün NİHAİ OLMADIĞINI açıkça söyler — sahte
 * bir "gerçekçi" iddiası kurulmasın diye (CLAUDE.md kural 8). Canvas'ın
 * DIŞINDA, üzerine konumlanan bir DOM etiketidir. İzlenen varlıkların
 * hepsi `public/` altına konunca kendiliğinden kaybolur.
 */

import { getAssetById } from './asset-manifest';
import { assetUrl, useMissingAssetPaths } from './asset-pipeline';

export interface PlaceholderBadgeProps {
  /** İzlenen manifest kimlikleri — HEPSİ mevcutsa rozet gösterilmez. */
  assetIds: string[];
  style?: React.CSSProperties;
}

export function PlaceholderBadge({
  assetIds,
  style,
}: PlaceholderBadgeProps): React.ReactElement | null {
  const urls = assetIds
    .map((id) => getAssetById(id))
    .filter((asset) => asset !== undefined)
    .map((asset) => assetUrl(asset.expectedPath));
  const missing = useMissingAssetPaths(urls);
  if (missing === null || missing.length === 0) {
    return null;
  }
  return (
    <div
      role="note"
      aria-label="Placeholder görüntü"
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 2,
        maxWidth: 'min(320px, calc(100% - 20px))',
        padding: '6px 10px',
        borderRadius: 8,
        background: 'rgba(5, 8, 18, 0.72)',
        border: '1px dashed rgba(255, 196, 64, 0.7)',
        color: '#f3d58a',
        fontSize: 11,
        lineHeight: 1.4,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <strong style={{ letterSpacing: '0.08em' }}>PLACEHOLDER</strong> — prosedürel görüntü, nihai
      değil. Bekleyen varlıklar:
      <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
        {missing.map((url) => (
          <li key={url}>{url.replace(/^\//, '')}</li>
        ))}
      </ul>
    </div>
  );
}
