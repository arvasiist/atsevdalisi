'use client';

/**
 * ETKİNLİK YÖNETİMİ (02.10.2026, Faz 11-B) — yalnızca yönetici. Süreli bir
 * hedef (ölçüt + adet) ve para ödülü açılır; ilerleme sunucuda türetilir.
 * Sınırlar config'ten okunur (sunucu aynı kuralları uygular).
 */

import { useCallback, useEffect, useState } from 'react';
import { QUEST_METRICS, type AdminLiveEventView, type QuestMetric } from '@at-sevdalisi/shared-types';
import { loadQuestsConfig } from '@at-sevdalisi/game-config';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { QUEST_METRIC_LABELS } from '../quests/quest-labels';

const LIMITS = loadQuestsConfig().events;

export function LiveEventsAdmin({ onChanged }: { onChanged: (message: string) => void }): React.ReactElement {
  const [items, setItems] = useState<AdminLiveEventView[] | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<QuestMetric>('races_entered');
  const [target, setTarget] = useState('3');
  const [reward, setReward] = useState('500');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await apiClient.listAdminEvents());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Etkinlikler yüklenemedi.');
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

  const now = Date.now();
  return (
    <div data-testid="events-admin">
      <div className="moderation-panel">
        <h3>Yeni etkinlik</h3>
        <div className="moderation-form">
          <label className="moderation-field moderation-field-wide">
            Başlık
            <input aria-label="Etkinlik başlığı" value={title} maxLength={LIMITS.titleMaxLength} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="moderation-field">
            Hedef
            <select aria-label="Etkinlik ölçütü" value={metric} onChange={(e) => setMetric(e.target.value as QuestMetric)}>
              {QUEST_METRICS.map((value) => (
                <option key={value} value={value}>
                  {QUEST_METRIC_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="moderation-field">
            Adet
            <input aria-label="Etkinlik hedef adedi" type="number" min={1} max={LIMITS.maxTarget} value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="moderation-field">
            Ödül (para)
            <input aria-label="Etkinlik ödülü" type="number" min={1} max={LIMITS.maxRewardMoney} value={reward} onChange={(e) => setReward(e.target.value)} />
          </label>
          <label className="moderation-field">
            Başlangıç (boşsa şimdi)
            <input aria-label="Etkinlik başlangıcı" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="moderation-field">
            Bitiş
            <input aria-label="Etkinlik bitişi" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label className="moderation-field moderation-field-wide">
            Açıklama (isteğe bağlı)
            <textarea aria-label="Etkinlik açıklaması" rows={2} value={description} maxLength={LIMITS.descriptionMaxLength} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <button
            type="button"
            className="moderation-primary"
            disabled={busy || title.trim() === '' || endsAt === ''}
            onClick={() =>
              void run(async () => {
                await apiClient.createEvent({
                  title: title.trim(),
                  description: description.trim(),
                  metric,
                  target: Number(target),
                  rewardMoney: Number(reward),
                  ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
                  endsAt: new Date(endsAt).toISOString(),
                });
                setTitle('');
                setDescription('');
                return 'Etkinlik açıldı.';
              })
            }
          >
            Etkinliği aç
          </button>
        </div>
        <p className="session-meta">
          Aynı anda en fazla {LIMITS.maxLive} etkinlik; en uzun {LIMITS.maxDurationDays} gün; ödül en fazla{' '}
          {formatCurrency('money', LIMITS.maxRewardMoney)}. Bitince ödül {LIMITS.claimGraceHours} saat daha alınabilir.
        </p>
      </div>
      {items !== null && items.length === 0 ? <p className="session-meta">Henüz etkinlik yok.</p> : null}
      <ul className="session-list">
        {(items ?? []).map((item) => {
          const live = item.archivedAt === null && new Date(item.startsAt).getTime() <= now && new Date(item.endsAt).getTime() > now;
          return (
            <li key={item.id} className="session-row">
              <div>
                <strong>{item.title}</strong>
                {live ? <span className="market-badge market-badge-lead">Sürüyor</span> : null}
                {item.archivedAt ? <span className="market-badge">Arşivde</span> : null}
                <p className="session-meta">
                  {QUEST_METRIC_LABELS[item.metric]} × {item.target} · {formatCurrency('money', item.rewardMoney)} ·{' '}
                  {new Date(item.startsAt).toLocaleString('tr-TR')} → {new Date(item.endsAt).toLocaleString('tr-TR')} ·{' '}
                  {item.claimCount} ödül alındı
                </p>
              </div>
              {item.archivedAt === null ? (
                <button
                  type="button"
                  className="session-revoke"
                  disabled={busy}
                  onClick={() => void run(async () => (await apiClient.archiveEvent(item.id), 'Etkinlik arşivlendi.'))}
                >
                  Arşivle
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error !== null ? <p className="moderation-error">{error}</p> : null}
    </div>
  );
}
