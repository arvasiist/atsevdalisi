'use client';

/**
 * ŞÜPHELİ DESENLER (02.10.2026, Faz 7) — moderatör + yönetici. Yalnızca
 * inceleme listesi: bulgu bir ceza DEĞİLDİR; karar "Oyuncular" sekmesindeki
 * yaptırım akışıyla (denetim kaydıyla) verilir.
 */

import { useEffect, useState } from 'react';
import type { AnomalyPlayerRef, AnomalyReport } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { ANOMALY_RULE_LABELS } from './moderation-labels';

function who(ref: AnomalyPlayerRef): string {
  return `${ref.username} (${ref.accountAgeDays} günlük)`;
}

export function AnomaliesAdmin(): React.ReactElement {
  const [data, setData] = useState<AnomalyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getAnomalies()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Liste yüklenemedi.'));
  }, []);

  if (error) return <p className="moderation-error">{error}</p>;
  if (!data) return <p className="session-meta">Yükleniyor…</p>;
  return (
    <div data-testid="anomalies-admin">
      <p className="session-meta">
        Son {data.windowDays} gün · "yeni hesap" = işlem anında {data.newAccountDays} günden genç. Bu liste
        yalnızca incelemedir; otomatik işlem yapılmaz.
      </p>
      {data.findings.length === 0 ? <p className="session-meta">Şüpheli desen bulunmadı.</p> : null}
      <ul className="session-list">
        {data.findings.map((finding) => (
          <li key={`${finding.rule}-${finding.subject.playerId}-${finding.counterparts[0]?.playerId ?? ''}`} className="session-row">
            <div>
              <strong>{who(finding.subject)}</strong>
              <span className="market-badge">{ANOMALY_RULE_LABELS[finding.rule]}</span>
              <p className="session-meta">
                {finding.count} işlem · {formatCurrency('money', finding.totalMoney)}
                {finding.totalGems > 0 ? ` + ${formatCurrency('gems', finding.totalGems)}` : ''} ·{' '}
                {new Date(finding.firstAt).toLocaleString('tr-TR')} → {new Date(finding.lastAt).toLocaleString('tr-TR')}
              </p>
              <p className="session-meta">Karşı taraf: {finding.counterparts.map(who).join(', ')}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
