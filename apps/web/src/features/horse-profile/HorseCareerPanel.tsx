'use client';

import { useEffect, useState } from 'react';
import type { HorseCareerView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { hippodromeLabel } from '../race-viewer/hippodrome-theme';
import { describeRecord, formatPlacing, winRatePercent } from './horse-profile';

const SURFACE_LABELS: Record<HorseCareerView['recentRaces'][number]['surface'], string> = {
  grass: 'Çim',
  dirt: 'Kum',
  synthetic: 'Sentetik',
};

/**
 * 16.10.2026 — atın yarış geçmişi (brief §3). Açıldığında BİR kez yüklenir
 * (soy ağacı ile aynı tembel desen); veri `GET /horses/:id/career`.
 */
export function HorseCareerPanel({ horseId }: { horseId: string }): React.ReactElement {
  const [career, setCareer] = useState<HorseCareerView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getHorseCareer(horseId)
      .then((data) => {
        if (!cancelled) setCareer(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Kariyer yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [horseId]);

  if (error !== null) {
    return <p style={{ color: 'var(--color-status-critical)', fontSize: '12px', margin: 0 }}>{error}</p>;
  }
  if (career === null) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', margin: 0 }}>Kariyer yükleniyor…</p>;
  }
  const winRate = winRatePercent(career);
  return (
    <div data-testid={`horse-career-${horseId}`} style={{ display: 'grid', gap: 'var(--space-sm)', fontSize: '12px' }}>
      <div style={{ color: 'var(--color-text-secondary)' }}>
        {describeRecord(career)}
        {winRate !== null ? ` · kazanma %${winRate}` : null}
        {career.bestPosition !== null && career.wins === 0 ? ` · en iyi derece ${career.bestPosition}.` : null}
      </div>
      {career.recentRaces.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Bu at henüz yarış bitirmedi.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-muted)', textAlign: 'left' }}>
              <th style={{ fontWeight: 500 }}>Yarış</th>
              <th style={{ fontWeight: 500 }}>Derece</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>Kazanç</th>
            </tr>
          </thead>
          <tbody>
            {career.recentRaces.map((race) => (
              <tr key={race.raceId} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: '4px 0' }}>
                  <div>{race.raceName}</div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
                    {new Date(race.ranAt).toLocaleDateString('tr-TR')} · {race.distanceMeters} m{' '}
                    {SURFACE_LABELS[race.surface]} · {hippodromeLabel(race.hippodromeKey)}
                  </div>
                </td>
                <td style={{ fontWeight: race.finishPosition === 1 ? 700 : 400 }}>{formatPlacing(race)}</td>
                <td style={{ textAlign: 'right' }}>{race.prize > 0 ? formatCurrency('money', race.prize) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
