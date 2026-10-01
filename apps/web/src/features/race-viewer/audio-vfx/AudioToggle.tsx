'use client';

/**
 * SES DÜĞMESİ (01.10.2026, 3D adım 9) — tek sessiz/açık tercihi
 * (`useAudioMuted`). Ses dosyaları henüz yoktur (PLACEHOLDER); açmak
 * hata üretmez, yalnızca sessiz kalır.
 */

import { Volume2, VolumeX } from 'lucide-react';

export function AudioToggle({
  muted,
  onChange,
  style,
}: {
  muted: boolean;
  onChange: (muted: boolean) => void;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="audio-toggle"
      aria-pressed={!muted}
      aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
      title={muted ? 'Sesi aç' : 'Sesi kapat'}
      onClick={() => onChange(!muted)}
      style={style}
    >
      {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
    </button>
  );
}
