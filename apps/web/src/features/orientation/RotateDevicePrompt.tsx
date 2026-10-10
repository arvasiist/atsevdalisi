'use client';

/**
 * Dikey telefonda oyunun üstünü kaplayan "yan çevir" katmanı (10.10.2026).
 * Her zaman DOM'dadır; YALNIZCA dikey telefonda görünür (CSS medya sorgusu,
 * `globals.css` → `.rotate-prompt`). Masaüstü ve tablette hiç görünmez.
 */

import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { canRequestLandscape, readOrientationEnv, requestLandscape } from './orientation';

export function RotateDevicePrompt(): React.ReactElement {
  const [canLock, setCanLock] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCanLock(canRequestLandscape(readOrientationEnv()));
  }, []);

  const onLock = (): void => {
    void requestLandscape(readOrientationEnv()).then((result) => setFailed(result !== 'locked'));
  };

  return (
    <div className="rotate-prompt" role="dialog" aria-modal="true" aria-labelledby="rotate-prompt-title">
      <div className="rotate-prompt-card">
        <Smartphone className="rotate-prompt-icon" size={56} aria-hidden="true" />
        <h2 id="rotate-prompt-title">Telefonunu yan çevir</h2>
        <p>At Sevdalısı telefonda yatay ekranda oynanır.</p>
        {canLock ? (
          <button type="button" className="btn-gold" onClick={onLock}>
            Tam ekran + yatay
          </button>
        ) : null}
        <p className="rotate-prompt-hint" role="status">
          {failed ? 'Otomatik çevrilemedi — telefonu elle yan çevir.' : 'Ekran döndürme kilidi açıksa kapat.'}
        </p>
      </div>
    </div>
  );
}
