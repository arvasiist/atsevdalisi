'use client';

/**
 * HESAP SİLME (02.10.2026, migration 0059) — `/account`. Sunucu otoritedir:
 * engeller (`GET /account/deletion`) sunucudan okunur ve silme sırasında
 * kilit altında yeniden denetlenir. Onay: kullanıcı adı + (e-postalı
 * hesapta) şifre. Geri alınamaz; ekran bunu açıkça söyler.
 */

import { useEffect, useState } from 'react';
import type { AccountDeletionCheck } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';

export function DeleteAccountPanel({
  username,
  onDeleted,
}: {
  username: string;
  onDeleted: () => void;
}): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<AccountDeletionCheck | null>(null);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void apiClient
      .getAccountDeletionCheck()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Durum okunamadı.');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const confirmed = confirm.trim().toLowerCase() === username.toLowerCase();
  const blocked = (status?.blockers.length ?? 0) > 0;
  const canSubmit =
    status !== null && !blocked && confirmed && (!status.requiresPassword || password !== '') && !busy;

  const submit = async (): Promise<void> => {
    if (status === null) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.deleteAccount(confirm.trim(), status.requiresPassword ? password : undefined);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hesap silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
      <h2 style={{ fontSize: '16px', color: 'var(--color-status-critical)', marginTop: 0, marginBottom: 'var(--space-sm)' }}>
        Hesabı sil
      </h2>
      {!isOpen ? (
        <button type="button" className="session-revoke" onClick={() => setIsOpen(true)}>
          Hesabımı silmek istiyorum
        </button>
      ) : (
        <div data-testid="delete-account" style={{ display: 'grid', gap: 'var(--space-sm)', maxWidth: '420px' }}>
          <p style={textStyle()}>
            Bu işlem <strong>geri alınamaz</strong>. E-postan, şifren, Google bağlantın, mesajların, arkadaşlıkların ve
            bildirimlerin silinir; atların, paran ve ilerlemen bir daha açılamaz. Geçmiş yarış ve para kayıtları,
            muhasebe bütünlüğü için adın olmadan saklanır.
          </p>
          {status === null && error === null ? <p style={textStyle()}>Kontrol ediliyor…</p> : null}
          {blocked ? (
            <div role="alert">
              <p style={{ ...textStyle(), color: 'var(--color-status-critical)' }}>Hesabın şu an silinemez:</p>
              <ul style={{ ...textStyle(), paddingLeft: '18px' }}>
                {status!.blockers.map((blocker) => (
                  <li key={blocker.code}>{blocker.label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {status !== null && !blocked ? (
            <>
              <label style={labelStyle()}>
                Onay için kullanıcı adını yaz: <strong>{username}</strong>
                <input
                  aria-label="Kullanıcı adı onayı"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  style={inputStyle()}
                  autoComplete="off"
                />
              </label>
              {status.requiresPassword ? (
                <label style={labelStyle()}>
                  Şifre
                  <input
                    aria-label="Silme şifresi"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    style={inputStyle()}
                  />
                </label>
              ) : null}
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void submit()}
                style={{
                  minHeight: '44px',
                  padding: '10px 18px',
                  background: canSubmit ? 'var(--color-status-critical)' : 'transparent',
                  color: canSubmit ? '#fff' : 'var(--color-text-muted)',
                  border: canSubmit ? 'none' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {busy ? 'Siliniyor…' : 'Hesabımı kalıcı olarak sil'}
              </button>
            </>
          ) : null}
          {error !== null ? <p style={{ ...textStyle(), color: 'var(--color-status-critical)' }}>{error}</p> : null}
        </div>
      )}
    </GlassPanel>
  );
}

function textStyle(): React.CSSProperties {
  return { margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' };
}

function labelStyle(): React.CSSProperties {
  return { display: 'grid', gap: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' };
}

function inputStyle(): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '8px 12px',
    background: 'rgba(10, 16, 28, 0.6)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
  };
}
