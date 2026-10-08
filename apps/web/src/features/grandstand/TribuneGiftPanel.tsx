'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RaceTribuneGiftsView, TribuneGiftEvent, TribuneGiftFeedItem } from '@at-sevdalisi/shared-types';
import { loadGrandstandConfig } from '@at-sevdalisi/game-config';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';
import { TribuneGiftIcon } from './TribuneGiftIcon';
import {
  bumpHorseCount,
  canSendTribuneGift,
  horseGiftSummary,
  mergeTribuneFeed,
  tribuneGiftBlockedReason,
  tribuneGiftEmoji,
  tribuneGiftName,
} from './tribune-gifts';

const RECENT_LIMIT = loadGrandstandConfig().tribuneGifts.recentLimit;
/** Tribünde beliren "X → at" balonunun ekranda kalma süresi. */
const TOAST_MS = 4000;

/**
 * TRİBÜN HEDİYESİ PANELİ (08.10.2026) — izleme ekranında "🎁 Hediye" düğmesi
 * + çekmece: at seç → hediye seç → gönder. `liveEvent` yarış odasının
 * `race.tribuneGift` yayınıdır (başkalarının hediyesi anında görünür).
 */
export function TribuneGiftPanel({
  raceId,
  liveEvent,
}: {
  raceId: string;
  liveEvent: TribuneGiftEvent | null;
}): React.ReactElement | null {
  const { player, refresh } = usePlayer();
  const [view, setView] = useState<RaceTribuneGiftsView | null>(null);
  const [open, setOpen] = useState(false);
  const [horseId, setHorseId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<TribuneGiftFeedItem | null>(null);
  // PARA YOLU: anahtar (at, hediye) başına BAŞARIYA kadar yaşar.
  const pendingKeys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    try {
      const next = await apiClient.getTribuneGifts(raceId);
      setView(next);
      setHorseId((current) => current ?? next.recipients[0]?.horseId ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tribün hediyeleri yüklenemedi');
    }
  }, [raceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Canlı yayın: akış + sayaç + kısa balon.
  useEffect(() => {
    if (!liveEvent || liveEvent.raceId !== raceId) return undefined;
    setView((current) => {
      if (!current || current.recent.some((item) => item.tribuneGiftId === liveEvent.tribuneGiftId)) return current;
      return {
        ...current,
        recent: mergeTribuneFeed(current.recent, liveEvent, RECENT_LIMIT),
        perHorse: bumpHorseCount(current.perHorse, liveEvent.horseId, liveEvent.giftKey),
      };
    });
    setToast(liveEvent);
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [liveEvent, raceId]);

  const send = async (giftKey: string): Promise<void> => {
    if (!horseId) return;
    const slot = `${horseId}:${giftKey}`;
    const key = pendingKeys.current.get(slot) ?? crypto.randomUUID();
    pendingKeys.current.set(slot, key);
    setBusyKey(giftKey);
    setError(null);
    try {
      const result = await apiClient.sendTribuneGift(raceId, { horseId, giftKey }, key);
      pendingKeys.current.delete(slot);
      const horseName = view?.recipients.find((recipient) => recipient.horseId === horseId)?.horseName ?? 'at';
      setNotice(`${tribuneGiftName(giftKey)} ${horseName} için gönderildi — sahibine +${result.ownerAmount} çip.`);
      await Promise.all([load(), refresh()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hediye gönderilemedi');
    } finally {
      setBusyKey(null);
    }
  };

  if (!player) return null;
  const blocked = view ? tribuneGiftBlockedReason(view) : null;

  return (
    <>
      {toast ? (
        <div className="tribune-gift-toast" role="status">
          <TribuneGiftIcon giftKey={toast.giftKey} emoji={tribuneGiftEmoji(toast.giftKey)} size={22} />
          <span>
            <strong>{toast.senderDisplayName}</strong> → {toast.horseName}
          </span>
        </div>
      ) : null}
      <button
        type="button"
        className="tribune-gift-fab"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid="tribune-gift-open"
      >
        🎁 Hediye
      </button>
      {open ? (
        <section className="tribune-gift-drawer" data-testid="tribune-gift-panel">
          <header className="tribune-gift-head">
            <strong>Tribünden Hediye</strong>
            <button type="button" className="tribune-gift-close" onClick={() => setOpen(false)} aria-label="Kapat">
              ✕
            </button>
          </header>
          {!view ? (
            <p className="tribune-gift-muted">{error ?? 'Yükleniyor…'}</p>
          ) : (
            <>
              <p className="tribune-gift-muted">
                At sahibine gönder; hediyenin bir kısmı sahibinin hesabına çip olarak geçer. Bugün {view.sentToday}/
                {view.dailyLimit}.
              </p>
              {blocked ? <p className="tribune-gift-muted">{blocked}</p> : null}
              {view.recipients.length > 0 ? (
                <div className="tribune-gift-horses" role="radiogroup" aria-label="At seç">
                  {view.recipients.map((recipient) => {
                    const summary = horseGiftSummary(
                      view.perHorse.find((row) => row.horseId === recipient.horseId)?.counts,
                      view.items,
                    );
                    return (
                      <button
                        key={recipient.horseId}
                        type="button"
                        role="radio"
                        aria-checked={horseId === recipient.horseId}
                        className={`tribune-gift-horse${horseId === recipient.horseId ? ' is-selected' : ''}`}
                        onClick={() => setHorseId(recipient.horseId)}
                      >
                        <span className="tribune-gift-horse-name">{recipient.horseName}</span>
                        <span className="tribune-gift-muted">{recipient.ownerDisplayName}</span>
                        {summary.length > 0 ? (
                          <span className="tribune-gift-counts">
                            {summary.map((entry) => (
                              <span key={entry.key}>
                                <TribuneGiftIcon giftKey={entry.key} emoji={tribuneGiftEmoji(entry.key)} size={14} />
                                {entry.count}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="tribune-gift-grid">
                {view.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="tribune-gift-item"
                    disabled={
                      busyKey !== null || !horseId || blocked !== null || !canSendTribuneGift(view, item, player.money)
                    }
                    onClick={() => void send(item.key)}
                    title={`${item.name} — ${item.price} çip (sahibine +${item.ownerAmount})`}
                  >
                    <TribuneGiftIcon giftKey={item.key} emoji={item.emoji} />
                    <span className="tribune-gift-item-name">{item.name}</span>
                    <span className="tribune-gift-item-price">{busyKey === item.key ? '…' : `${item.price} çip`}</span>
                  </button>
                ))}
              </div>
              {notice ? <p className="tribune-gift-notice">{notice}</p> : null}
              {error ? <p className="tribune-gift-error">{error}</p> : null}
              {view.recent.length > 0 ? (
                <ul className="tribune-gift-feed">
                  {view.recent.slice(0, 6).map((item) => (
                    <li key={item.tribuneGiftId}>
                      <TribuneGiftIcon giftKey={item.giftKey} emoji={tribuneGiftEmoji(item.giftKey)} size={16} />
                      <span>
                        <strong>{item.senderDisplayName}</strong> → {item.horseName}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
