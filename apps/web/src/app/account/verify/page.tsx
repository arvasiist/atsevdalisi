'use client';

/**
 * E-POSTA DOĞRULAMA ONAYI (02.10.2026, migration 0058) — e-postadaki
 * bağlantı buraya açılır: `/account/verify?token=...`.
 *
 * Doğrulama sayfa açılınca KENDİLİĞİNDEN yapılmaz, düğmeyle yapılır: bazı
 * e-posta güvenlik tarayıcıları bağlantıları JavaScript ile açar ve tek
 * kullanımlık bağlantıyı kullanıcıdan önce tüketirdi. Oturum gerekmez —
 * bağlantı başka bir cihazda da açılabilir.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { apiClient } from '../../../lib/api-client';

export default function EmailVerifyPage(): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
  }, []);

  async function submit(): Promise<void> {
    if (token === null) return;
    setIsBusy(true);
    setError(null);
    try {
      await apiClient.verifyEmail(token);
      setIsDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'E-posta doğrulanamadı.');
    } finally {
      setIsBusy(false);
    }
  }

  const linkStyle: React.CSSProperties = { color: 'var(--color-accent-focus)', fontWeight: 600 };

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: 'var(--space-md)' }}>
        E-posta doğrulama
      </h1>
      <GlassPanel style={{ maxWidth: '420px' }}>
        {isDone ? (
          <p style={textStyle()} data-testid="verify-done">
            E-postan doğrulandı.{' '}
            <Link href="/account" style={linkStyle}>
              Hesabına dön
            </Link>
          </p>
        ) : token === null ? (
          <p style={textStyle()}>
            Bu sayfa e-postadaki bağlantıyla açılır.{' '}
            <Link href="/account" style={linkStyle}>
              Yeni bağlantı iste
            </Link>
          </p>
        ) : (
          <>
            <p style={textStyle()}>Bu e-posta adresinin sana ait olduğunu onaylamak için düğmeye bas.</p>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void submit()}
              style={{
                marginTop: 'var(--space-md)',
                minHeight: '44px',
                padding: '10px 18px',
                background: 'var(--color-accent-gold)',
                color: '#1a1405',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: '14px',
                cursor: isBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {isBusy ? 'Bekle…' : 'E-postamı doğrula'}
            </button>
          </>
        )}
        {error !== null ? (
          <p style={{ ...textStyle(), color: 'var(--color-status-critical)' }}>
            {error}{' '}
            <Link href="/account" style={linkStyle}>
              Yeni bağlantı iste
            </Link>
          </p>
        ) : null}
      </GlassPanel>
    </main>
  );
}

function textStyle(): React.CSSProperties {
  return { margin: '8px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' };
}
