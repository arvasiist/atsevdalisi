'use client';

/**
 * DUYURU ŞERİDİ (02.10.2026, Faz 11-A) — üst barın altında yayındaki
 * duyurular. Oturumsuz da çalışır (bakım duyurusu herkese). Kapatılan
 * duyuru bu tarayıcıda bir daha gösterilmez. Ağ hatasında sessizce boş kalır
 * (duyuru oyunu engellemez).
 *
 * 10.10.2026 — kompakt: kapalıyken yalnızca en önemli duyuru TEK SATIR
 * (metin kısaltılır, tamamı açınca görünür); "N duyuru daha" düğmesi açar.
 *
 * 10.10.2026 (yatay telefon) — şeridin yüksekliği `--announcement-height`
 * CSS değişkenine yazılır; tam ekran sahneler (ahır, yarış izleme, vitrin)
 * yüksekliklerinden bunu da düşer. Şerit yokken değişken 0'dır.
 */

/** Tam ekran sahnelerin `calc()`inde düşülen şerit yüksekliği. */
export const ANNOUNCEMENT_HEIGHT_VAR = '--announcement-height';

import { useEffect, useRef, useState } from 'react';
import type { AnnouncementView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { ANNOUNCEMENT_LEVEL_LABELS } from '../admin/moderation-labels';
import {
  DISMISSED_STORAGE_KEY,
  addDismissed,
  announcementStripLayout,
  parseDismissed,
  visibleAnnouncements,
} from './announcement-logic';

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
  const [expanded, setExpanded] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);

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
  const hasStrip = visible.length > 0;

  useEffect(() => {
    const root = document.documentElement;
    const node = stripRef.current;
    if (!hasStrip || !node) {
      root.style.setProperty(ANNOUNCEMENT_HEIGHT_VAR, '0px');
      return;
    }
    const publish = (): void => root.style.setProperty(ANNOUNCEMENT_HEIGHT_VAR, `${node.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      root.style.setProperty(ANNOUNCEMENT_HEIGHT_VAR, '0px');
    };
  }, [hasStrip]);

  if (!hasStrip) return null;
  const { shown, hiddenCount } = announcementStripLayout(visible, expanded);

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
    <div
      ref={stripRef}
      className="announcement-strip"
      data-expanded={expanded ? 'true' : 'false'}
      role="region"
      aria-label="Duyurular"
    >
      {shown.map((item) => (
        <div key={item.id} className="announcement-item" data-level={item.level} data-testid={`announcement-${item.id}`}>
          <div className="announcement-text" title={expanded ? undefined : `${item.title} — ${item.body}`}>
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
      {visible.length > 1 ? (
        <button
          type="button"
          className="announcement-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Duyuruları daralt' : `${hiddenCount} duyuru daha`}
        </button>
      ) : null}
    </div>
  );
}
