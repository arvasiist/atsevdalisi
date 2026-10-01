'use client';

/**
 * ŞİFRE SIFIRLAMA ONAYI (30.09.2026, migration 0047) — e-postadaki
 * bağlantı buraya açılır: `/account/reset?token=...`.
 *
 * `token` sorgu dizesinden `useEffect` içinde okunur (`useSearchParams`
 * statik derlemede bir Suspense sınırı ister; tek değer için gereksiz).
 * Bağlantı geçersiz/süresi dolmuş/kullanılmışsa sunucu TEK hata döner
 * (`INVALID_RESET_TOKEN`) ve ekran yeni bağlantı istemeyi önerir.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadAuthConfig } from '@at-sevdalisi/game-config';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { apiClient } from '../../../lib/api-client';

const AUTH_CONFIG = loadAuthConfig();

export default function PasswordResetPage(): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
  }, []);

  const mismatch = repeat.length > 0 && repeat !== password;
  const tooShort = password.length > 0 && password.length < AUTH_CONFIG.password.minLength;
  const canSubmit = token !== null && password !== '' && !mismatch && !tooShort && !isBusy;

  async function submit(): Promise<void> {
    if (token === null) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await apiClient.confirmPasswordReset(token, password);
      setIsDone(true);
      setPassword('');
      setRepeat('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Şifre değiştirilemedi.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: 'var(--space-md)' }}>
        Yeni şifre belirle
      </h1>
      <GlassPanel style={{ maxWidth: '420px' }}>
        {isDone ? (
          <p style={textStyle()}>
            Şifren değiştirildi.{' '}
            <Link href="/account" style={{ color: 'var(--color-accent-focus)', fontWeight: 600 }}>
              Yeni şifrenle giriş yap
            </Link>
          </p>
        ) : token === null ? (
          <p style={textStyle()}>
            Bu sayfa e-postadaki bağlantıyla açılır.{' '}
            <Link href="/account" style={{ color: 'var(--color-accent-focus)', fontWeight: 600 }}>
              Yeni bağlantı iste
            </Link>
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            style={{ display: 'grid', gap: 'var(--space-md)' }}
          >
            <label style={labelStyle()}>
              Yeni şifre
              <input
                aria-label="Yeni şifre"
                type="password"
                autoComplete="new-password"
                value={password}
                maxLength={AUTH_CONFIG.password.maxLength}
                onChange={(event) => setPassword(event.target.value)}
                style={inputStyle()}
              />
            </label>
            <label style={labelStyle()}>
              Yeni şifre (tekrar)
              <input
                aria-label="Yeni şifre tekrar"
                type="password"
                autoComplete="new-password"
                value={repeat}
                maxLength={AUTH_CONFIG.password.maxLength}
                onChange={(event) => setRepeat(event.target.value)}
                style={inputStyle()}
              />
            </label>
            {tooShort ? <p style={textStyle()}>Şifre en az {AUTH_CONFIG.password.minLength} karakter olmalı.</p> : null}
            {mismatch ? <p style={textStyle()}>Şifreler aynı değil.</p> : null}
            <button type="submit" disabled={!canSubmit} style={buttonStyle(canSubmit)}>
              {isBusy ? 'Bekle…' : 'Şifreyi değiştir'}
            </button>
          </form>
        )}
        {error !== null ? (
          <p style={{ ...textStyle(), color: 'var(--color-status-critical)' }}>
            {error}{' '}
            <Link href="/account" style={{ color: 'var(--color-accent-focus)', fontWeight: 600 }}>
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

function labelStyle(): React.CSSProperties {
  return { display: 'grid', gap: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' };
}

function inputStyle(): React.CSSProperties {
  return {
    // AUDIT_REPORT.md F1 ile AYNI kural: 44px dokunma hedefi.
    minHeight: '44px',
    padding: '8px 12px',
    background: 'rgba(10, 16, 28, 0.6)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
  };
}

function buttonStyle(enabled: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '10px 18px',
    background: enabled ? 'var(--color-accent-gold)' : 'transparent',
    color: enabled ? '#1a1405' : 'var(--color-text-muted)',
    border: enabled ? 'none' : '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '14px',
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
