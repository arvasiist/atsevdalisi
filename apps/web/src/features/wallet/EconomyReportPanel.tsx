'use client';

/**
 * GELİR-GİDER RAPORU (16.10.2026, brief §19). Son günler/aylar için çip
 * gelir, gider ve net; dönemin aile kırılımı. Bütün sayılar sunucunun
 * defterden topladığı değerlerdir (istemci hesaplamaz).
 */

import { useCallback, useEffect, useState } from 'react';
import type { EconomyReportView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { CANONICAL_TYPE_LABELS } from './ledger-labels';
import { formatReportBucket, reportBarWidths } from './economy-report';

export function EconomyReportPanel({ playerId }: { playerId: string }): React.ReactElement {
  const [period, setPeriod] = useState<'daily' | 'monthly'>('daily');
  const [report, setReport] = useState<EconomyReportView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setReport(await apiClient.getEconomyReport(playerId, period));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rapor yüklenemedi.');
    }
  }, [playerId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GlassPanel style={{ padding: 'var(--space-lg)' }}>
      <div className="quest-head">
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Gelir-Gider Raporu</h2>
        <div className="tabs" role="tablist" aria-label="Rapor dönemi">
          {(['daily', 'monthly'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              className="tab"
              aria-selected={period === value}
              onClick={() => setPeriod(value)}
            >
              {value === 'daily' ? 'Günlük' : 'Aylık'}
            </button>
          ))}
        </div>
      </div>
      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}
      {report === null ? (
        error ? null : <p style={{ color: 'var(--color-text-muted)' }}>Yükleniyor…</p>
      ) : (
        <div data-testid="economy-report" style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          <p style={{ margin: 0 }}>
            Toplam: <strong>{formatCurrency('money', report.totals.income)}</strong> gelir ·{' '}
            <strong>{formatCurrency('money', report.totals.expense)}</strong> gider · net{' '}
            <strong style={{ color: report.totals.net >= 0 ? 'var(--color-status-positive)' : 'var(--color-status-critical)' }}>
              {report.totals.net >= 0 ? '' : '−'}
              {formatCurrency('money', Math.abs(report.totals.net))}
            </strong>
          </p>
          <ul className="report-bars">
            {report.buckets.map((bucket) => {
              const widths = reportBarWidths(bucket, report.buckets);
              return (
                <li key={bucket.key}>
                  <span className="report-bar-label">{formatReportBucket(bucket.key, report.period)}</span>
                  <span className="report-bar-track" aria-hidden="true">
                    <span className="report-bar-income" style={{ width: `${widths.income}%` }} />
                    <span className="report-bar-expense" style={{ width: `${widths.expense}%` }} />
                  </span>
                  <span className="report-bar-value">
                    +{bucket.income} / −{bucket.expense}
                  </span>
                </li>
              );
            })}
          </ul>
          {report.categories.length > 0 ? (
            <table className="career-table">
              <thead>
                <tr>
                  <th>Kalem</th>
                  <th style={{ textAlign: 'right' }}>Gelir</th>
                  <th style={{ textAlign: 'right' }}>Gider</th>
                </tr>
              </thead>
              <tbody>
                {report.categories.map((row) => (
                  <tr key={row.category}>
                    <td>{CANONICAL_TYPE_LABELS[row.category]}</td>
                    <td style={{ textAlign: 'right' }}>{row.income > 0 ? formatCurrency('money', row.income) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{row.expense > 0 ? formatCurrency('money', row.expense) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              Bu aralıkta çip hareketi yok.
            </p>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
