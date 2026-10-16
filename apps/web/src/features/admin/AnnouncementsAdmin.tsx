'use client';

/**
 * DUYURU YÖNETİMİ (02.10.2026, Faz 11-A) — yalnızca yönetici. Oluşturma +
 * arşivleme; sınırlar config'ten (sunucu aynı kuralları uygular).
 */

import { useCallback, useEffect, useState } from 'react';
import type { AdminAnnouncementView, AnnouncementLevel } from '@at-sevdalisi/shared-types';
import { loadModerationConfig } from '@at-sevdalisi/game-config';
import { apiClient } from '../../lib/api-client';
import { ANNOUNCEMENT_LEVEL_LABELS } from './moderation-labels';

const LIMITS = loadModerationConfig().announcements;

export function AnnouncementsAdmin({ onChanged }: { onChanged: (message: string) => void }): React.ReactElement {
  const [items, setItems] = useState<AdminAnnouncementView[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState<AnnouncementLevel>('info');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await apiClient.listAdminAnnouncements());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duyurular yüklenemedi.');
    }
  }, []);

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

  return (
    <div data-testid="announcements-admin">
      <div className="moderation-panel">
        <h3>Yeni duyuru</h3>
        <div className="moderation-form">
          <label className="moderation-field moderation-field-wide">
            Başlık
            <input aria-label="Duyuru başlığı" value={title} maxLength={LIMITS.titleMaxLength} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="moderation-field">
            Düzey
            <select aria-label="Duyuru düzeyi" value={level} onChange={(e) => setLevel(e.target.value as AnnouncementLevel)}>
              {(Object.keys(ANNOUNCEMENT_LEVEL_LABELS) as AnnouncementLevel[]).map((value) => (
                <option key={value} value={value}>
                  {ANNOUNCEMENT_LEVEL_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="moderation-field">
            Bitiş (isteğe bağlı)
            <input aria-label="Duyuru bitişi" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label className="moderation-field moderation-field-wide">
            Metin
            <textarea aria-label="Duyuru metni" rows={3} value={body} maxLength={LIMITS.bodyMaxLength} onChange={(e) => setBody(e.target.value)} />
          </label>
          <button
            type="button"
            className="moderation-primary"
            disabled={busy || title.trim() === '' || body.trim() === ''}
            onClick={() =>
              void run(async () => {
                await apiClient.createAnnouncement({
                  title: title.trim(),
                  body: body.trim(),
                  level,
                  ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
                });
                setTitle('');
                setBody('');
                setEndsAt('');
                return 'Duyuru yayınlandı.';
              })
            }
          >
            Yayınla
          </button>
        </div>
        <p className="session-meta">Aynı anda en fazla {LIMITS.maxLive} duyuru yayında olabilir.</p>
      </div>
      {items !== null && items.length === 0 ? <p className="session-meta">Henüz duyuru yok.</p> : null}
      <ul className="session-list">
        {(items ?? []).map((item) => (
          <li key={item.id} className="session-row">
            <div>
              <strong>{item.title}</strong>
              <span className="market-badge">{ANNOUNCEMENT_LEVEL_LABELS[item.level]}</span>
              {item.live ? <span className="market-badge market-badge-lead">Yayında</span> : null}
              {item.archivedAt ? <span className="market-badge">Arşivde</span> : null}
              <p className="session-meta">{item.body}</p>
            </div>
            {item.archivedAt === null ? (
              <button
                type="button"
                className="session-revoke"
                disabled={busy}
                onClick={() => void run(async () => (await apiClient.archiveAnnouncement(item.id), 'Duyuru arşivlendi.'))}
              >
                Arşivle
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error !== null ? <p className="moderation-error">{error}</p> : null}
    </div>
  );
}
