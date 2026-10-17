'use client';

/**
 * KAZANANLAR TABLOSU (16.10.2026, brief §12) — gerçek oyuncunun birinci
 * bitirdiği bitmiş yarışlar, tamamlanma sırasına göre (yeni → eski). Genel ve
 * sezon puan sıralamasından AYRIDIR. Satırlar sunucudan; "Daha fazla" sunucunun
 * imleciyle bir sonraki sayfayı ekler (satır tekrarlanmaz/atlanmaz).
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { RaceWinnerRowView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { hippodromeLabel } from '../race-viewer/hippodrome-theme';
import { buildWinnersQuery, formatFinalTime } from './race-winners';

export function RaceWinnersPanel({ currentPlayerId }: { currentPlayerId: string | null }): React.ReactElement {
  const [rows, setRows] = useState<RaceWinnerRowView[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (append: boolean, cursor: string | null) => {
      const built = buildWinnersQuery(fromDay, toDay, cursor);
      if (!built.ok) {
        setError(built.problem);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const page = await apiClient.getRaceWinners(built.query);
        setRows((current) => (append && current ? [...current, ...page.rows] : page.rows));
        setNextCursor(page.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kazananlar yüklenemedi.');
      } finally {
        setBusy(false);
      }
    },
    [fromDay, toDay],
  );

  useEffect(() => {
    void load(false, null);
    // Filtre "Uygula" ile çalışır; ilk açılışta (yalnızca bir kez) filtresiz liste.
  }, []);

  return (
    <div data-testid="race-winners">
      <form
        className="winners-filter"
        onSubmit={(event) => {
          event.preventDefault();
          void load(false, null);
        }}
      >
        <label>
          Başlangıç
          <input type="date" value={fromDay} onChange={(event) => setFromDay(event.target.value)} aria-label="Başlangıç günü" />
        </label>
        <label>
          Bitiş
          <input type="date" value={toDay} onChange={(event) => setToDay(event.target.value)} aria-label="Bitiş günü" />
        </label>
        <button type="submit" className="stable-chip" disabled={busy}>
          Uygula
        </button>
        {fromDay || toDay ? (
          <button
            type="button"
            className="stable-chip"
            disabled={busy}
            onClick={() => {
              setFromDay('');
              setToDay('');
            }}
          >
            Temizle
          </button>
        ) : null}
      </form>
      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}
      {rows === null ? (
        error ? null : <p style={{ color: 'var(--color-text-muted)' }}>Kazananlar yükleniyor…</p>
      ) : rows.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            Bu aralıkta gerçek bir oyuncunun kazandığı bitmiş yarış yok.
          </p>
        </GlassPanel>
      ) : (
        <GlassPanel style={{ padding: 0, overflowX: 'auto' }}>
          <table className="career-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Yarış</th>
                <th>Kazanan</th>
                <th>At</th>
                <th>Derece</th>
                <th style={{ textAlign: 'right' }}>Ödül</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.raceId} data-me={row.playerId === currentPlayerId ? 'true' : undefined}>
                  <td>{new Date(row.completedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    <Link href={`/replays/${row.raceId}`}>{row.raceName}</Link>
                    <span className="session-meta" style={{ display: 'block' }}>
                      {hippodromeLabel(row.hippodrome)} · {row.classLabel} · {row.fieldSize} at
                    </span>
                  </td>
                  <td>
                    <Link href={`/profile/${row.username}`}>{row.displayName}</Link>
                  </td>
                  <td>{row.horseName ?? '—'}</td>
                  <td>{formatFinalTime(row.finalTimeMs)}</td>
                  <td style={{ textAlign: 'right' }}>{row.prize > 0 ? formatCurrency('money', row.prize) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}
      {nextCursor ? (
        <button
          type="button"
          className="stable-chip"
          style={{ marginTop: 'var(--space-sm)' }}
          disabled={busy}
          onClick={() => void load(true, nextCursor)}
        >
          Daha fazla
        </button>
      ) : null}
    </div>
  );
}
