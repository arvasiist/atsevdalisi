'use client';

/**
 * AI İŞLERİ (07.10.2026, Faz 8-B — brief Faz 10 "AI Jobs"). Yalnızca
 * yönetici. Selfie/model anahtarı ve sağlayıcı iş kimliği SUNUCUDAN hiç gelmez.
 */

import { useEffect, useState } from 'react';
import type { AdminAvatarJobView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { AVATAR_JOB_STATUS_LABELS } from '../avatar/ai-avatar-labels';

export function AvatarJobsAdmin(): React.ReactElement {
  const [rows, setRows] = useState<AdminAvatarJobView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .listAvatarJobs()
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Liste yüklenemedi.'));
  }, []);

  if (error) return <p className="moderation-error">{error}</p>;
  if (!rows) return <p className="session-meta">Yükleniyor…</p>;
  if (rows.length === 0) return <p className="session-meta">Henüz AI avatar işi yok.</p>;
  return (
    <ul className="session-list" data-testid="avatar-jobs-admin">
      {rows.map((row) => (
        <li key={row.id}>
          <strong>{row.username}</strong> · {AVATAR_JOB_STATUS_LABELS[row.status]}
          {row.errorCode ? ` (${row.errorCode})` : ''} · {row.provider} ·{' '}
          {new Date(row.createdAt).toLocaleString('tr-TR')}
        </li>
      ))}
    </ul>
  );
}
