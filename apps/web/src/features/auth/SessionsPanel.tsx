'use client';

/**
 * AKTİF OTURUMLAR (02.10.2026, migration 0057) — `/account`. Cihaz listesi,
 * tek cihazı kapatma ve tüm cihazlardan çıkış. Sunucu otoritedir: liste
 * yalnızca çağıranın oturumlarını döner; başkasının oturumu 404'tür.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AuthSessionInfo } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatRaceStart } from '../../lib/format-time';
import { deviceLabel } from './device-label';

export function SessionsPanel({ onLogoutAll }: { onLogoutAll: () => Promise<void> }): React.ReactElement {
  const [sessions, setSessions] = useState<AuthSessionInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await apiClient.listSessions());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oturumlar yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (sessionId: string): Promise<void> => {
    setBusy(true);
    try {
      await apiClient.revokeSession(sessionId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oturum kapatılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const logoutAll = async (): Promise<void> => {
    if (!window.confirm('Bu cihaz dahil TÜM cihazlardan çıkış yapılsın mı? Tekrar giriş yapman gerekecek.')) return;
    setBusy(true);
    try {
      await onLogoutAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Çıkış yapılamadı.');
      setBusy(false);
    }
  };

  return (
    <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
      <h2 style={{ fontSize: '16px', color: 'var(--color-text-primary)', marginTop: 0, marginBottom: 'var(--space-sm)' }}>
        Oturumlar
      </h2>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        Hesabının açık olduğu cihazlar. Tanımadığın bir cihaz görürsen kapat ve şifreni değiştir.
      </p>
      {sessions === null && error === null ? (
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Yükleniyor…</p>
      ) : null}
      {sessions !== null ? (
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id} className="session-row" data-testid={`session-${session.id}`}>
              <div>
                <strong>{deviceLabel(session.userAgent)}</strong>
                {session.current ? <span className="market-badge">Bu cihaz</span> : null}
                <p className="session-meta">Son kullanım: {formatRaceStart(session.lastUsedAt)}</p>
              </div>
              {session.current ? null : (
                <button type="button" disabled={busy} onClick={() => void revoke(session.id)} className="session-revoke">
                  Kapat
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" disabled={busy} onClick={() => void logoutAll()} className="session-revoke">
        Tüm cihazlardan çıkış yap
      </button>
      {error !== null ? <p style={{ fontSize: '13px', color: 'var(--color-status-critical)' }}>{error}</p> : null}
    </GlassPanel>
  );
}
