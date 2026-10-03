'use client';

/**
 * DUYURU ŞERİDİ (02.10.2026, Faz 11-A) — üst barın altında yayındaki
 * duyurular. Oturumsuz da çalışır (bakım duyurusu herkese). Kapatılan
 * duyuru bu tarayıcıda bir daha gösterilmez. Ağ hatasında sessizce boş kalır
 * (duyuru oyunu engellemez).
 */

import { useEffect, useState } from 'react';
import type { AnnouncementView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { ANNOUNCEMENT_LEVEL_LABELS } from '../admin/moderation-labels';
import { DISMISSED_STORAGE_KEY, addDismissed, parseDismissed, visibleAnnouncements } from './announcement-logic';

function readDismissed(): string[] {
  try {
    return parseDismissed(window.localStorage.getItem(DISMISSED_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function AnnouncementStrip(): React.ReactElement | null {
  const [items, setItems] = useState<AnnouncementView[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(readDismissed());
    let cancelled = false;
    void apiClient
      .getAnnouncements()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = visibleAnnouncements(items, dismissed);
  if (visible.length === 0) return null;

  const dismiss = (id: string): void => {
    const next = addDismissed(dismissed, id);
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Depolama kapalıysa yalnızca bu oturumda gizlenir.
    }
  };

  return (
    <div className="announcement-strip" role="region" aria-label="Duyurular">
      {visible.map((item) => (
        <div key={item.id} className="announcement-item" data-level={item.level} data-testid={`announcement-${item.id}`}>
          <div>
            <strong>
              {ANNOUNCEMENT_LEVEL_LABELS[item.level]}: {item.title}
            </strong>
            <p>{item.body}</p>
          </div>
          <button type="button" className="announcement-dismiss" aria-label="Duyuruyu kapat" onClick={() => dismiss(item.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
