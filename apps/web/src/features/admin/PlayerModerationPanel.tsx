'use client';

/**
 * OYUNCU YÖNETİMİ (02.10.2026, Faz 10) — yönetim panelinde seçili oyuncu
 * için yaptırım geçmişi, yeni yaptırım, kaldırma ve rol. Yetki SUNUCUDA;
 * buradaki gizleme yalnızca kullanışlılık içindir (moderatöre yasak
 * seçeneği gösterilmez, sunucu yine reddeder).
 */

import { useCallback, useEffect, useState } from 'react';
import type { AdminPlayerAccountView, AssignableRole, PlayerSanctionView, SanctionKind } from '@at-sevdalisi/shared-types';
import { loadModerationConfig } from '@at-sevdalisi/game-config';
import { apiClient } from '../../lib/api-client';
import { ROLE_LABELS, SANCTION_LABELS, roleOf } from './moderation-labels';

const LIMITS = loadModerationConfig().sanctions;

export function PlayerModerationPanel({
  player,
  actorRole,
  onChanged,
}: {
  player: AdminPlayerAccountView;
  actorRole: AssignableRole;
  onChanged: (message: string) => void;
}): React.ReactElement {
  const [history, setHistory] = useState<PlayerSanctionView[] | null>(null);
  const [kind, setKind] = useState<SanctionKind>('suspend');
  const [hours, setHours] = useState('24');
  const [reason, setReason] = useState('');
  const [liftReason, setLiftReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetRole = roleOf(player);
  const maxHours = actorRole === 'admin' ? LIMITS.adminMaxSuspendHours : LIMITS.moderatorMaxSuspendHours;

  const load = useCallback(async () => {
    try {
      setHistory(await apiClient.getPlayerSanctions(player.playerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Geçmiş yüklenemedi.');
    }
  }, [player.playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<string>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const submitSanction = (): Promise<void> =>
    run(async () => {
      await apiClient.sanctionPlayer(player.playerId, {
        kind,
        reason: reason.trim(),
        ...(kind === 'suspend' ? { durationHours: Number(hours) } : {}),
      });
      setReason('');
      return `${player.displayName}: ${SANCTION_LABELS[kind]} uygulandı.`;
    });

  return (
    <div className="moderation-panel" data-testid="moderation-panel">
      <h3>
        {player.displayName} <span className="session-meta">@{player.username} · {ROLE_LABELS[targetRole]}</span>
      </h3>

      <h4>Yaptırım geçmişi</h4>
      {history === null ? <p className="session-meta">Yükleniyor…</p> : null}
      {history !== null && history.length === 0 ? <p className="session-meta">Kayıt yok.</p> : null}
      <ul className="session-list">
        {(history ?? []).map((item) => (
          <li key={item.id} className="session-row">
            <div>
              <strong>{SANCTION_LABELS[item.kind]}</strong>
              {item.active ? <span className="market-badge market-badge-lead">Etkin</span> : null}
              <p className="session-meta">
                {item.reason}
                {item.expiresAt ? ` · bitiş ${new Date(item.expiresAt).toLocaleString('tr-TR')}` : ''}
                {item.liftedAt ? ` · kaldırıldı: ${item.liftReason ?? ''}` : ''}
              </p>
            </div>
            {item.active && (item.kind === 'suspend' || actorRole === 'admin') ? (
              <button
                type="button"
                className="session-revoke"
                disabled={busy || liftReason.trim().length < LIMITS.reasonMinLength}
                onClick={() =>
                  void run(async () => {
                    await apiClient.liftSanction(item.id, liftReason.trim());
                    setLiftReason('');
                    return `${player.displayName}: yaptırım kaldırıldı.`;
                  })
                }
              >
                Kaldır
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {(history ?? []).some((item) => item.active) ? (
        <label className="moderation-field">
          Kaldırma gerekçesi
          <input
            aria-label="Kaldırma gerekçesi"
            value={liftReason}
            maxLength={LIMITS.reasonMaxLength}
            onChange={(event) => setLiftReason(event.target.value)}
          />
        </label>
      ) : null}

      {targetRole === 'player' ? (
        <>
          <h4>Yeni yaptırım</h4>
          <div className="moderation-form">
            <label className="moderation-field">
              Tür
              <select aria-label="Yaptırım türü" value={kind} onChange={(event) => setKind(event.target.value as SanctionKind)}>
                <option value="suspend">Askı (süreli)</option>
                {actorRole === 'admin' ? <option value="ban">Yasak (kalıcı)</option> : null}
              </select>
            </label>
            {kind === 'suspend' ? (
              <label className="moderation-field">
                Süre (saat, en çok {maxHours})
                <input
                  aria-label="Askı süresi"
                  inputMode="numeric"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                />
              </label>
            ) : null}
            <label className="moderation-field moderation-field-wide">
              Gerekçe (oyuncuya gösterilir)
              <input
                aria-label="Yaptırım gerekçesi"
                value={reason}
                maxLength={LIMITS.reasonMaxLength}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="moderation-danger"
              disabled={busy || reason.trim().length < LIMITS.reasonMinLength}
              onClick={() => {
                if (kind === 'ban' && !window.confirm(`${player.displayName} kalıcı olarak yasaklansın mı?`)) return;
                void submitSanction();
              }}
            >
              Uygula
            </button>
          </div>
        </>
      ) : (
        <p className="session-meta">Personele yaptırım uygulanamaz; önce rolünü kaldır.</p>
      )}

      {actorRole === 'admin' ? (
        <>
          <h4>Rol</h4>
          <div className="moderation-form">
            {(['player', 'moderator', 'admin'] as const).map((role) => (
              <button
                key={role}
                type="button"
                className="session-revoke"
                disabled={busy || role === targetRole}
                aria-pressed={role === targetRole}
                onClick={() => {
                  if (!window.confirm(`${player.displayName} → ${ROLE_LABELS[role]}?`)) return;
                  void run(async () => {
                    await apiClient.setPlayerRole(player.playerId, role);
                    return `${player.displayName}: rol ${ROLE_LABELS[role]} oldu.`;
                  });
                }}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {error !== null ? <p className="moderation-error">{error}</p> : null}
    </div>
  );
}
