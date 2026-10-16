'use client';

/**
 * SAYFA HATA SINIRI (02.10.2026, Faz 13-C). Bir sayfa çökünce bütün
 * uygulama beyaz ekrana düşmez: üst bar yerinde kalır, oyuncuya anlaşılır
 * bir mesaj ve "Tekrar dene" gösterilir; hata sunucunun raporlayıcısına
 * bildirilir (`POST /client-errors`). Hata ayrıntısı EKRANA basılmaz.
 */

import { useEffect } from 'react';
import { reportBoundaryError } from '../features/errors/error-report';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    reportBoundaryError(error);
  }, [error]);

  return (
    <main className="page-container" role="alert">
      <h1 style={{ fontSize: '22px', color: 'var(--color-text-primary)' }}>Bir şeyler ters gitti</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
        Bu sayfa beklenmedik bir hatayla karşılaştı. Hata kaydedildi; atların ve paran güvende — sonuçları yalnızca
        sunucu belirler.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          minHeight: '44px',
          padding: '10px 18px',
          background: 'var(--color-accent-gold)',
          color: '#1a1405',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Tekrar dene
      </button>
    </main>
  );
}
