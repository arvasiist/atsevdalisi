'use client';

/**
 * KÖK HATA SINIRI (02.10.2026, Faz 13-C) — kök yerleşim (`layout.tsx`)
 * çökerse devreye girer; bu yüzden kendi `<html>`/`<body>`unu taşır ve
 * genel stillere güvenmez. Hata `POST /client-errors`e bildirilir.
 */

import { useEffect } from 'react';
import { reportBoundaryError } from '../features/errors/error-report';

export default function GlobalError({
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
    <html lang="tr">
      <body style={{ margin: 0, background: '#0b1220', color: '#f2efe6', fontFamily: 'system-ui, sans-serif' }}>
        <main role="alert" style={{ maxWidth: '520px', margin: '15vh auto', padding: '0 16px' }}>
          <h1 style={{ fontSize: '22px' }}>At Sevdalısı şu an açılamadı</h1>
          <p style={{ fontSize: '14px', opacity: 0.8 }}>
            Beklenmedik bir hata oluştu ve kaydedildi. Sayfayı yenilemeyi dene.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ minHeight: '44px', padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}
          >
            Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}
