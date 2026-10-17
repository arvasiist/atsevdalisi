'use client';

/**
 * HEDİYE KUTUSU (17.10.2026, brief §17 "At sahibi gelen hediyeleri toplu
 * alabilsin"). Tribünden atlarına gelen hediyelerin payı burada bekler;
 * "Hepsini topla" sunucuda tek işlemle hesaba geçirir. Tutarlar sunucudan.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { TribuneGiftInboxView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { TribuneGiftIcon } from './TribuneGiftIcon';
import { inboxSummary, tribuneGiftEmoji, tribuneGiftName } from './tribune-gifts';

export function TribuneGiftInbox({ onCollected }: { onCollected: () => void | Promise<void> }): React.ReactElement {
  const [view, setView] = useState<TribuneGiftInboxView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await apiClient.getTribuneGiftInbox());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hediye kutusu yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const collect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiClient.collectTribuneGifts();
      setNotice(
        result.collected > 0
          ? `${result.collected} hediye toplandı: +${formatCurrency('money', result.amount)}`
          : 'Toplanacak hediye kalmamış.',
      );
      await Promise.all([load(), onCollected()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hediyeler toplanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const summary = view ? inboxSummary(view) : null;

  return (
    <GlassPanel style={{ padding: 'var(--space-lg)' }}>
      <div id="tribune-gifts" data-testid="tribune-gift-inbox" style={{ display: 'grid', gap: 'var(--space-sm)' }}>
        <div className="quest-head">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Hediye Kutusu</h2>
          {view && view.pendingCount > 0 ? (
            <button type="button" className="moderation-primary" disabled={busy} onClick={() => void collect()}>
              {busy ? 'Toplanıyor…' : `Hepsini topla (+${formatCurrency('money', view.pendingAmount)})`}
            </button>
          ) : null}
        </div>
        {error ? <p style={{ color: 'var(--color-status-critical)', margin: 0 }}>{error}</p> : null}
        {notice ? <p style={{ color: 'var(--color-status-positive)', margin: 0 }}>{notice}</p> : null}
        {view === null ? (
          error ? null : <p className="session-meta">Yükleniyor…</p>
        ) : (
          <>
            <p className="session-meta" style={{ margin: 0 }}>
              {summary
                ? `Tribünden atlarına gelen ${view.pendingCount} hediye bekliyor: ${summary}.`
                : 'Toplanacak hediye yok. Yarışlarını izleyenler atlarına hediye gönderdiğinde payın burada birikir.'}
            </p>
            {view.received.length > 0 ? (
              <ul className="tribune-inbox-list">
                {view.received.map((gift) => (
                  <li key={gift.tribuneGiftId}>
                    <TribuneGiftIcon giftKey={gift.giftKey} emoji={tribuneGiftEmoji(gift.giftKey)} size={22} />
                    <span>
                      <strong>{gift.senderDisplayName}</strong> → {gift.horseName} · {tribuneGiftName(gift.giftKey)}
                      <span className="session-meta" style={{ display: 'block' }}>
                        <Link href={`/replays/${gift.raceId}`}>{gift.raceName}</Link> ·{' '}
                        {new Date(gift.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </span>
                    <span className="tribune-inbox-amount" data-collected={gift.collectedAt ? 'true' : 'false'}>
                      +{formatCurrency('money', gift.amount)}
                      <span className="session-meta" style={{ display: 'block' }}>
                        {gift.collectedAt ? 'alındı' : 'bekliyor'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </GlassPanel>
  );
}
