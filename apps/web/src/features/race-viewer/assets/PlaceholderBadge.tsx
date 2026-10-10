'use client';

/**
 * PLACEHOLDER ROZETİ (01.10.2026). Gerçek varlık (GLB/HDRI) yokken sahnede
 * gösterilen prosedürel görüntünün NİHAİ OLMADIĞINI açıkça söyler — sahte
 * bir "gerçekçi" iddiası kurulmasın diye (CLAUDE.md kural 8). Canvas'ın
 * DIŞINDA, üzerine konumlanan bir DOM etiketidir. İzlenen varlıkların
 * hepsi `public/` altına konunca kendiliğinden kaybolur.
 *
 * 10.10.2026 — oyuncuya teknik dosya yolu GÖSTERİLMEZ: üretimde yalnızca
 * kısa bir "geçici görsel" notu (eksiklik gizlenmez, yalnızca dili
 * oyuncuya göre). Geliştirmede bekleyen yolların listesi + konsola bir kez
 * bilgi satırı (geliştirici neyin eksik olduğunu görür).
 */

import { useEffect } from 'react';
import { getAssetById } from './asset-manifest';
import { assetUrl, useMissingAssetPaths } from './asset-pipeline';

/** Dosya yolları yalnızca geliştirmede gösterilir (üretim derlemesinde sabit `false`). */
const SHOW_DEVELOPER_DETAILS = process.env.NODE_ENV !== 'production';

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
  const developer = SHOW_DEVELOPER_DETAILS;
  const missingKey = missing?.join('|') ?? '';
  useEffect(() => {
    if (!developer || missingKey === '') return;
    // Geliştirme: eksik varlıkları bir kez konsola yaz (üretimde sessiz).
    console.info(`[3D varlık] Bekleyen dosyalar (public/): ${missingKey.split('|').join(', ')}`);
  }, [developer, missingKey]);
  if (missing === null || missing.length === 0) {
    return null;
  }
  if (!developer) {
    return (
      <div role="note" aria-label="Placeholder görüntü" className="placeholder-badge-compact" style={style}>
        <strong>PLACEHOLDER</strong> · Geçici görsel — nihai 3D modeller henüz eklenmedi
      </div>
    );
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
        // Üretim rozetiyle aynı sağ pay: sağ üstteki düğmelerin (ahırda Bakım/Ekipman) altına girmesin.
        maxWidth: 'min(320px, calc(100% - 180px))',
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
      değil. <span className="placeholder-badge-list">Bekleyen varlıklar:</span>
      <span className="placeholder-badge-count">({missing.length} varlık bekleniyor)</span>
      <ul className="placeholder-badge-list" style={{ margin: '2px 0 0', paddingLeft: 16 }}>
        {missing.map((url) => (
          <li key={url}>{url.replace(/^\//, '')}</li>
        ))}
      </ul>
    </div>
  );
}
