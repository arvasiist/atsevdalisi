'use client';

/**
 * HESAP — e-posta + şifre girişi ve "Hesabını kaydet" (30.09.2026,
 * migration 0046).
 *
 * Neden var: hesaplar yalnızca bu tarayıcıdaki token'da yaşıyordu; tarayıcı
 * verisi silinince, başka cihaza geçilince ya da 30 günlük token dolunca
 * oyuncu atlarını ve parasını KALICI olarak kaybediyordu.
 *
 * Üç durum:
 *  - Oturum yok → "Giriş yap" formu (+ misafir olarak başla).
 *  - Misafir (e-posta yok) → "Hesabını kaydet" formu. Atlar ve para AYNI
 *    oyuncuda kalır; yeni hesap açılmaz.
 *  - Kayıtlı → e-posta gösterilir + "Çıkış yap".
 *
 * Şifre sınırları `auth.config.json`dan okunur; sunucu aynı kuralları
 * bağımsız uygular (istemci otorite değildir).
 */

import { useCallback, useEffect, useState } from 'react';
import { loadAuthConfig } from '@at-sevdalisi/game-config';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

const AUTH_CONFIG = loadAuthConfig();

export default function AccountPage(): React.ReactElement {
  const { player, isLoading, createPlayer, loginWithPassword, logout } = usePlayer();
  const [accountEmail, setAccountEmail] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isForgotOpen, setIsForgotOpen] = useState(false);

  useEffect(() => {
    if (!player) {
      setAccountEmail(undefined);
      return;
    }
    let cancelled = false;
    void apiClient
      .getAccountCredentials()
      .then((status) => {
        if (!cancelled) setAccountEmail(status.email);
      })
      .catch(() => {
        if (!cancelled) setAccountEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [player]);

  const passwordTooShort = password.length > 0 && password.length < AUTH_CONFIG.password.minLength;

  const submitLogin = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      await loginWithPassword(email, password);
      setPassword('');
      setNotice('Giriş yapıldı.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı.');
    } finally {
      setIsBusy(false);
    }
  }, [email, password, loginWithPassword]);

  const submitSave = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const saved = await apiClient.saveAccount(email, password);
      setAccountEmail(saved.email);
      setPassword('');
      setNotice('Hesabın kaydedildi. Artık her cihazdan bu e-posta ve şifreyle giriş yapabilirsin.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hesap kaydedilemedi.');
    } finally {
      setIsBusy(false);
    }
  }, [email, password]);

  /**
   * ŞİFREMİ UNUTTUM (30.09.2026) — sunucu yanıtı e-posta kayıtlı olsun
   * olmasın AYNIDIR; ekran da bu yüzden "kayıtlıysa gönderildi" der, asla
   * "böyle bir hesap yok" demez.
   */
  const submitForgot = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      await apiClient.requestPasswordReset(email);
      setNotice('Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelen kutunu (ve gereksiz klasörünü) kontrol et.');
      setIsForgotOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İstek gönderilemedi.');
    } finally {
      setIsBusy(false);
    }
  }, [email]);

  const confirmLogout = useCallback(() => {
    if (
      accountEmail === null &&
      !window.confirm(
        'Hesabın kayıtlı değil. Çıkış yaparsan bu hesaba, atlarına ve parana bir daha ULAŞAMAZSIN. Yine de çıkılsın mı?',
      )
    ) {
      return;
    }
    logout();
    setNotice('Çıkış yapıldı.');
  }, [accountEmail, logout]);

  const form = (submit: () => Promise<void>, submitLabel: string, autoComplete: 'current-password' | 'new-password') => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      style={{ display: 'grid', gap: 'var(--space-md)', maxWidth: '360px' }}
    >
      <label style={labelStyle()}>
        E-posta
        <input
          aria-label="E-posta"
          type="email"
          autoComplete="email"
          value={email}
          maxLength={AUTH_CONFIG.email.maxLength}
          onChange={(event) => setEmail(event.target.value)}
          style={inputStyle()}
        />
      </label>
      <label style={labelStyle()}>
        Şifre
        <input
          aria-label="Şifre"
          type="password"
          autoComplete={autoComplete}
          value={password}
          maxLength={AUTH_CONFIG.password.maxLength}
          onChange={(event) => setPassword(event.target.value)}
          style={inputStyle()}
        />
      </label>
      {autoComplete === 'new-password' && passwordTooShort ? (
        <p style={mutedStyle()}>Şifre en az {AUTH_CONFIG.password.minLength} karakter olmalı.</p>
      ) : null}
      <button type="submit" disabled={isBusy || email === '' || password === ''} style={primaryButtonStyle(!isBusy)}>
        {isBusy ? 'Bekle…' : submitLabel}
      </button>
    </form>
  );

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: 'var(--space-md)' }}>Hesap</h1>

      {isLoading ? <p style={mutedStyle()}>Yükleniyor…</p> : null}

      {!isLoading && !player ? (
        <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
          <h2 style={titleStyle()}>Giriş yap</h2>
          <p style={mutedStyle()}>Kayıtlı hesabın varsa e-posta ve şifrenle giriş yap — atların ve paran seni bekliyor.</p>
          {isForgotOpen ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitForgot();
              }}
              style={{ display: 'grid', gap: 'var(--space-md)', maxWidth: '360px', marginTop: 'var(--space-md)' }}
            >
              <label style={labelStyle()}>
                E-posta
                <input
                  aria-label="Sıfırlama e-postası"
                  type="email"
                  autoComplete="email"
                  value={email}
                  maxLength={AUTH_CONFIG.email.maxLength}
                  onChange={(event) => setEmail(event.target.value)}
                  style={inputStyle()}
                />
              </label>
              <button type="submit" disabled={isBusy || email === ''} style={primaryButtonStyle(!isBusy)}>
                {isBusy ? 'Bekle…' : 'Sıfırlama bağlantısı gönder'}
              </button>
              <button type="button" onClick={() => setIsForgotOpen(false)} style={linkButtonStyle()}>
                Girişe dön
              </button>
            </form>
          ) : (
            <>
              {form(submitLogin, 'Giriş yap', 'current-password')}
              <button
                type="button"
                onClick={() => setIsForgotOpen(true)}
                style={{ ...linkButtonStyle(), marginTop: 'var(--space-sm)' }}
              >
                Şifremi unuttum
              </button>
            </>
          )}
          <p style={{ ...mutedStyle(), marginTop: 'var(--space-lg)' }}>
            Hesabın yok mu?{' '}
            <button type="button" onClick={() => void createPlayer()} style={linkButtonStyle()}>
              Başlangıç paketiyle yeni oyuncu oluştur
            </button>
          </p>
        </GlassPanel>
      ) : null}

      {player && accountEmail === null ? (
        <GlassPanel style={{ marginBottom: 'var(--space-lg)', border: '1px solid var(--color-status-warning)' }}>
          <h2 style={titleStyle()}>Hesabını kaydet</h2>
          <p style={{ ...mutedStyle(), color: 'var(--color-status-warning)' }}>
            Hesabın şu an yalnızca bu tarayıcıda. Tarayıcı verisini silersen ya da başka cihaza geçersen atlarını ve
            paranı kaybedersin. Bir e-posta ve şifre bağla; her şey aynen kalır.
          </p>
          {form(submitSave, 'Hesabımı kaydet', 'new-password')}
        </GlassPanel>
      ) : null}

      {player && typeof accountEmail === 'string' ? (
        <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
          <h2 style={titleStyle()}>Kayıtlı hesap</h2>
          <p style={mutedStyle()}>
            <strong style={{ color: 'var(--color-text-primary)' }}>{accountEmail}</strong> ile kayıtlısın. Başka bir
            cihazda bu e-posta ve şifreyle giriş yapabilirsin.
          </p>
        </GlassPanel>
      ) : null}

      {player ? (
        <button type="button" onClick={confirmLogout} style={secondaryButtonStyle()}>
          Çıkış yap
        </button>
      ) : null}

      {notice !== null ? <p style={{ ...mutedStyle(), color: 'var(--color-status-positive)' }}>{notice}</p> : null}
      {error !== null ? <p style={{ ...mutedStyle(), color: 'var(--color-status-critical)' }}>{error}</p> : null}
    </main>
  );
}

function titleStyle(): React.CSSProperties {
  return { fontSize: '16px', color: 'var(--color-text-primary)', marginTop: 0, marginBottom: 'var(--space-sm)' };
}

function mutedStyle(): React.CSSProperties {
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

function primaryButtonStyle(enabled: boolean): React.CSSProperties {
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

function secondaryButtonStyle(): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '10px 16px',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    cursor: 'pointer',
  };
}

function linkButtonStyle(): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--color-accent-focus)',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '13px',
  };
}
