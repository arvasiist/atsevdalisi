'use client';

/**
 * MARKET (16.10.2026, brief §8) — sarf malzemesi: yem, tay yemi, takviye,
 * ilaç. Eskiden yem satın alma ucu (`POST /players/:id/feed-inventory/:type/
 * buy`) vardı ama hiçbir ekran onu çağırmıyordu; oyuncu yalnızca günlük
 * ödüldeki bedava yemi görebiliyordu.
 *
 * Fiyat, stok, kategori ve kullanım koşulları sunucunun yanıtından gelir;
 * ödenen tutar yanıttaki makbuzdur. `Idempotency-Key` aynı kalem + adet için
 * BAŞARIYA kadar korunur (cüzdan deseni): yanıt ağda kaybolursa yeniden basış
 * ikinci kez para düşmez. Ekipman (nal, eyer, aksesuar) ata takıldığı için
 * ahırdaki Ekipman panelinden alınır.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedInventoryView, FeedType } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import {
  FEED_CATEGORY_LABELS,
  FEED_QUALITY_LABELS,
  FEED_TYPE_DESCRIPTIONS,
  FEED_TYPE_LABELS,
} from '../../features/care/feed-labels';
import {
  FEED_PURCHASE_MAX_COUNT,
  clampFeedCount,
  describeFeedConditions,
  describeFeedPurchase,
  groupShopFeedItems,
} from '../../features/shop/shop-catalog';
import { stableActionHref } from '../../features/stable-actions/stable-actions';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

export default function ShopPage(): React.ReactElement {
  const { player, isLoading, createPlayer, refresh } = usePlayer();
  const [inventory, setInventory] = useState<FeedInventoryView | null>(null);
  const [counts, setCounts] = useState<Partial<Record<FeedType, number>>>({});
  const [busyType, setBusyType] = useState<FeedType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const playerId = player?.id ?? null;

  const load = useCallback(async () => {
    if (playerId === null) return;
    try {
      setInventory(await apiClient.getFeedInventory(playerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Market yüklenemedi.');
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!player) {
    return (
      <main className="page-container">
        <h1 className="page-title">Market</h1>
        {isLoading ? null : (
          <GlassPanel>
            <p>Marketi görmek için önce bir oyuncu oluştur.</p>
            <button type="button" className="moderation-primary" onClick={() => void createPlayer()}>
              Oyuncu oluştur
            </button>
          </GlassPanel>
        )}
      </main>
    );
  }

  const buy = async (type: FeedType) => {
    const count = clampFeedCount(counts[type] ?? 1);
    const fingerprint = `${type}:${count}`;
    if (pendingKey.current?.fingerprint !== fingerprint) {
      pendingKey.current = { fingerprint, key: crypto.randomUUID() };
    }
    setBusyType(type);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.buyFeed(player.id, type, count, pendingKey.current.key);
      pendingKey.current = null;
      setMessage(describeFeedPurchase(result));
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Satın alma başarısız.');
    } finally {
      setBusyType(null);
    }
  };

  const sections = inventory ? groupShopFeedItems(inventory.items) : [];

  return (
    <main className="page-container" data-testid="shop-page">
      <h1 className="page-title">Market</h1>
      <p className="session-meta">
        Bakiye: <strong>{formatCurrency('money', player.money)}</strong> · Yem ve ilaçlar stoğa girer; atına ahırdaki{' '}
        <Link href={stableActionHref('care')}>Bakım</Link> panelinden verirsin. Nal, eyer ve aksesuarlar ata takıldığı için{' '}
        <Link href={stableActionHref('equipment')}>Ekipman</Link> panelindedir.
      </p>
      {message ? (
        <p className="session-meta" data-testid="shop-message">
          {message}
        </p>
      ) : null}
      {error ? <p className="moderation-error">{error}</p> : null}
      {inventory === null ? (
        <p className="session-meta">Yükleniyor…</p>
      ) : (
        sections.map((section) => (
          <GlassPanel key={section.category}>
            <h2 style={{ marginTop: 0 }}>{FEED_CATEGORY_LABELS[section.category]}</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-md)' }}>
              {section.items.map((item) => {
                const conditions = describeFeedConditions(item);
                return (
                  <li key={item.type} data-testid={`shop-item-${item.type}`}>
                    <strong>{FEED_TYPE_LABELS[item.type]}</strong>{' '}
                    <span className="session-meta">
                      · {FEED_QUALITY_LABELS[item.qualityTier]} · {item.price ? formatCurrency(item.price.currency, item.price.amount) : ''}
                      {item.discountPercent > 0 ? ` (depo indirimi %${item.discountPercent})` : ''} · stokta {item.quantity ?? 0}
                    </span>
                    <p style={{ margin: 'var(--space-xs) 0' }}>{FEED_TYPE_DESCRIPTIONS[item.type]}</p>
                    {conditions.length > 0 ? <p className="session-meta">{conditions.join(' · ')}</p> : null}
                    <label className="session-meta">
                      Adet{' '}
                      <input
                        type="number"
                        min={1}
                        max={FEED_PURCHASE_MAX_COUNT}
                        value={counts[item.type] ?? 1}
                        onChange={(event) =>
                          setCounts((prev) => ({ ...prev, [item.type]: clampFeedCount(Number(event.target.value)) }))
                        }
                        style={{ width: '4.5em' }}
                      />
                    </label>{' '}
                    <button
                      type="button"
                      className="moderation-primary"
                      disabled={busyType !== null}
                      onClick={() => void buy(item.type)}
                    >
                      {busyType === item.type ? 'Alınıyor…' : 'Satın al'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </GlassPanel>
        ))
      )}
    </main>
  );
}
