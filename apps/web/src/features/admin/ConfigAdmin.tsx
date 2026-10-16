'use client';

/**
 * ETKİN OYUN AYARLARI (02.10.2026, Faz 10) — salt okuma, yalnızca yönetici.
 * Ayarlar DAĞITIMLA değişir (çalışma anında düzenlenmez); özet, birden çok
 * sunucu örneğinin aynı ayarla koştuğunu karşılaştırmak içindir.
 */

import { useEffect, useState } from 'react';
import type { AdminConfigEntry } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';

const HASH_PREVIEW = 12;

export function ConfigAdmin(): React.ReactElement {
  const [entries, setEntries] = useState<AdminConfigEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getAdminConfig()
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Ayarlar yüklenemedi.'));
  }, []);

  if (error) return <p className="moderation-error">{error}</p>;
  if (!entries) return <p className="session-meta">Yükleniyor…</p>;
  return (
    <div data-testid="config-admin">
      <p className="session-meta">
        {entries.length} ayar dosyası. Değerler dağıtımla değişir; burada değiştirilemez.
      </p>
      {entries.map((entry) => (
        <details key={entry.name} className="config-entry">
          <summary>
            <strong>{entry.name}</strong> <code className="session-meta">{entry.sha256.slice(0, HASH_PREVIEW)}</code>
          </summary>
          <pre>{JSON.stringify(entry.values, null, 2)}</pre>
        </details>
      ))}
    </div>
  );
}
