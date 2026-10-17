'use client';

/**
 * AHIRI GELİŞTİR (16.10.2026). Ahır sahnesindeki "Ahırı Geliştir"
 * simgesinden açılır: mevcut seviye (ad, kapasite, konfor), sonraki seviye
 * (bedel, oyuncu seviyesi şartı, kazanımlar) ve bütün seviyelerin yol
 * haritası. `GET /players/:id/stable-summary` + `POST /players/:id/stable/
 * upgrade`. PARA YOLU: `Idempotency-Key` aynı hedef seviye için BAŞARIYA
 * kadar saklanır — yanıt ağda kaybolursa yeniden basış ikinci bir seviye
 * ATLATMAZ (eskiden her basışta yeni anahtar üretiliyordu).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StableSummaryView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';
import {
  describeComfort,
  describeStableUpgradeBlock,
  stableLevelState,
  stableUpgradeBlock,
} from './stable-upgrade';

const STATE_MARK = { reached: '✓', current: '●', next: '→', locked: '🔒' } as const;

export function StableUpgradePanel({
  onUpgraded,
}: {
  /** Yükseltmeden sonra sayfanın ahır özeti/at listesi tazelenir (yeni bölmeler sahnede açılır). */
  onUpgraded?: () => Promise<void>;
} = {}): React.ReactElement {
  const { player, refresh } = usePlayer();
  const [summary, setSummary] = useState<StableSummaryView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingKey = useRef<{ level: number; key: string } | null>(null);
  const playerId = player?.id ?? null;

  const load = useCallback(async () => {
    if (playerId === null) return;
    try {
      setSummary(await apiClient.getStableSummary(playerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ahır durumu yüklenemedi.');
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (summary === null || player === null) {
    return (
      <div className="stable-action-body" data-testid="stable-upgrade-panel">
        <p className="stable-action-muted">{error ?? 'Ahır durumu yükleniyor…'}</p>
      </div>
    );
  }

  const offer = summary.nextUpgrade;
  const block = stableUpgradeBlock(offer, player);

  const upgrade = async () => {
    if (offer === null) return;
    if (pendingKey.current?.level !== offer.nextLevel) {
      pendingKey.current = { level: offer.nextLevel, key: crypto.randomUUID() };
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.upgradeStable(player.id, pendingKey.current.key);
      pendingKey.current = null;
      setMessage(
        `Ahır ${result.newStableLevel}. seviyeye yükseldi — kapasite ${result.newCapacity} at, ${formatCurrency(
          result.cost.currency,
          result.cost.amount,
        )} ödendi.`,
      );
      await Promise.all([load(), refresh(), onUpgraded?.()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yükseltme başarısız oldu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stable-action-body" data-testid="stable-upgrade-panel">
      <div className="stable-action-group">
        <span className="stable-action-label">Şu anki ahır</span>
        <strong data-testid="stable-upgrade-current">
          Sv. {summary.stableLevel} · {summary.stableName}
        </strong>
        <span className="stable-action-muted">
          Kapasite {summary.horseCount}/{summary.capacity} at · {describeComfort(summary.recoveryBonusPercent)}
        </span>
      </div>

      {offer ? (
        <div className="stable-action-group" data-testid="stable-upgrade-next">
          <span className="stable-action-label">Sonraki seviye</span>
          <strong>
            Sv. {offer.nextLevel} · {offer.nextName}
          </strong>
          <span className="stable-action-muted">
            Kapasite {summary.capacity} → {offer.nextCapacity} at · {describeComfort(offer.nextRecoveryBonusPercent)}
          </span>
          <span className="stable-action-muted">
            Bedel {formatCurrency(offer.cost.currency, offer.cost.amount)} · Oyuncu seviyesi {offer.requiredPlayerLevel}+
          </span>
          <button
            type="button"
            className="btn-gold"
            disabled={block !== null || busy}
            onClick={() => void upgrade()}
            data-testid="stable-upgrade-button"
          >
            {busy ? 'Yükseltiliyor…' : 'Ahırı Geliştir'}
          </button>
        </div>
      ) : null}
      {describeStableUpgradeBlock(block, offer) ? (
        <p className="stable-action-muted">{describeStableUpgradeBlock(block, offer)}</p>
      ) : null}
      {message ? <p className="stable-action-message">{message}</p> : null}
      {error ? (
        <p className="stable-action-message" data-error="true">
          {error}
        </p>
      ) : null}

      <div className="stable-action-group">
        <span className="stable-action-label">Seviyeler</span>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' }}>
          {summary.levels.map((row) => {
            const state = stableLevelState(row, summary.stableLevel);
            return (
              <li
                key={row.level}
                data-state={state}
                className="stable-action-muted"
                style={state === 'current' ? { color: 'var(--color-accent-gold)', fontWeight: 600 } : undefined}
              >
                {STATE_MARK[state]} Sv. {row.level} {row.name} · {row.capacity} at · konfor %{row.recoveryBonusPercent}
                {row.cost ? ` · ${formatCurrency(row.cost.currency, row.cost.amount)} · oyuncu Sv. ${row.requiredPlayerLevel}+` : ''}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
