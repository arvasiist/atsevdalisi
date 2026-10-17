'use client';

/**
 * AHIR BÖLMELERİ (16.10.2026, sahibinin isteği: "seviye yükseldikçe yandaki
 * boşluklara at alabilsin, ahır düzenlenebilsin"). Ahırın bütün bölmeleri:
 * dolu (at), boş (açık — at al / çiftleştir), kilitli (açıldığı ahır seviyesi).
 * Bir atı seçip başka bir bölmeye basınca taşınır; bölme doluysa iki at yer
 * değiştirir (`POST /players/:id/stable/stalls`, kural sunucuda). Para
 * hareketi yok.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { PublicHorse, StableSummaryView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { allStalls, describeStall, unlockLevelForStall, visibleStallCount, type StallContext } from '../stable-scene/stall-map';

export interface StableLayoutPanelProps {
  playerId: string;
  horses: readonly PublicHorse[];
  summary: StableSummaryView;
  /** Taşımadan sonra at listesi + özet tazelenir (3D sahne de yeni komşuları çizer). */
  onChanged: () => Promise<void>;
  /** Atı sahneye getirir. */
  onShowHorse: (horseId: string) => void;
  /** Kilitli bölmeden "Ahırı geliştir"e geçiş. */
  onOpenUpgrade: () => void;
}

export function stallContextFrom(summary: StableSummaryView, horses: readonly PublicHorse[]): StallContext {
  return {
    capacity: summary.capacity,
    maxStalls: summary.maxStalls,
    occupants: new Map(
      horses.flatMap((horse) => (horse.stallNumber ? [[horse.stallNumber, horse.id] as [number, string]] : [])),
    ),
    levels: summary.levels,
  };
}

export function StableLayoutPanel({
  playerId,
  horses,
  summary,
  onChanged,
  onShowHorse,
  onOpenUpgrade,
}: StableLayoutPanelProps): React.ReactElement {
  const [movingId, setMovingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const context = useMemo(() => stallContextFrom(summary, horses), [summary, horses]);
  const shownCount = useMemo(() => visibleStallCount(context), [context]);
  const allRows = useMemo(() => allStalls(context), [context]);
  const stalls = allRows.slice(0, shownCount);
  const hiddenFrom = shownCount + 1;
  const hiddenTo = allRows.length;
  const names = useMemo(() => new Map(horses.map((horse) => [horse.id, horse.name])), [horses]);
  const moving = movingId ? horses.find((horse) => horse.id === movingId) ?? null : null;

  const moveTo = async (stallNumber: number) => {
    if (!moving) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.moveHorseToStall(playerId, moving.id, stallNumber);
      setMessage(`${moving.name} ${stallNumber}. bölmeye taşındı.`);
      setMovingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'At taşınamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stable-action-body" data-testid="stable-layout-panel">
      <p className="stable-action-muted" style={{ margin: 0 }}>
        {summary.horseCount}/{summary.capacity} bölme dolu · {summary.maxStalls - summary.capacity} bölme ahırı geliştirince açılır.
        {moving ? ` ${moving.name} için hedef bölmeyi seç (dolu bölmede yer değiştirirler).` : ' Taşımak için bir at seç.'}
      </p>
      <div className="stall-grid" role="list">
        {stalls.map(({ stallNumber, state }) => {
          const isMoving = state.kind === 'occupied' && state.horseId === movingId;
          return (
            <div
              key={stallNumber}
              role="listitem"
              className={`stall-cell stall-cell-${state.kind}`}
              data-moving={isMoving ? 'true' : undefined}
              data-testid={`stall-cell-${stallNumber}`}
            >
              <span className="stall-cell-number">{stallNumber}</span>
              {state.kind === 'occupied' ? (
                <>
                  <strong className="stall-cell-name">{names.get(state.horseId)}</strong>
                  {moving && !isMoving ? (
                    <button type="button" className="stable-chip" disabled={busy} onClick={() => void moveTo(stallNumber)}>
                      Yer değiştir
                    </button>
                  ) : (
                    <span className="stall-cell-actions">
                      <button
                        type="button"
                        className="stable-chip"
                        aria-pressed={isMoving}
                        onClick={() => setMovingId(isMoving ? null : state.horseId)}
                      >
                        {isMoving ? 'Vazgeç' : 'Taşı'}
                      </button>
                      <button type="button" className="stable-chip" onClick={() => onShowHorse(state.horseId)}>
                        Göster
                      </button>
                    </span>
                  )}
                </>
              ) : state.kind === 'empty' ? (
                moving ? (
                  <button type="button" className="stable-chip" disabled={busy} onClick={() => void moveTo(stallNumber)}>
                    Buraya taşı
                  </button>
                ) : (
                  <span className="stall-cell-actions">
                    <Link href="/breeds" className="stable-chip">
                      {describeStall(state)}
                    </Link>
                    <Link href="/breeding" className="stable-chip">
                      Çiftleştir
                    </Link>
                  </span>
                )
              ) : (
                <button type="button" className="stable-chip" onClick={onOpenUpgrade} title="Ahırı geliştir">
                  {describeStall(state)}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {hiddenTo >= hiddenFrom ? (
        <p className="stable-action-muted" data-testid="stall-hidden-summary">
          {hiddenFrom}–{hiddenTo}. bölmeler ahır Sv. {unlockLevelForStall(hiddenFrom, summary.levels) ?? '?'}–
          {unlockLevelForStall(hiddenTo, summary.levels) ?? '?'} ile açılır.
        </p>
      ) : null}
      {message ? <p className="stable-action-message">{message}</p> : null}
      {error ? (
        <p className="stable-action-message" data-error="true">
          {error}
        </p>
      ) : null}
    </div>
  );
}
