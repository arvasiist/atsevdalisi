'use client';

/**
 * At Pazarı.
 *
 * AUDIT_REPORT.md Bulgu S3 — alıcı kimliği yalnızca oturumdan gelir; ekran
 * `buyerId` göndermez.
 *
 * 02.10.2026 — "Atımı Sat" formu (sabit fiyat ya da MÜZAYEDE) ve müzayede
 * teklifi eklendi. Bu tarihe kadar web'de ilan AÇMA yolu hiç yoktu: oyuncu
 * yalnızca satın alabiliyordu. İlanlar artık at adıyla görünür. Kararlar
 * (düğme durumları, form doğrulaması) `features/market/market-logic.ts`te
 * saftır; sunucu otoritedir (en düşük teklif sunucudan okunur).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketListing, PublicHorse } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import {
  LISTING_DURATION_HOURS,
  buildSellBody,
  formatTimeLeft,
  listingActions,
  type SellForm,
} from '../../features/market/market-logic';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

const EMPTY_FORM: SellForm = {
  horseId: '',
  listingType: 'fixed_price',
  price: '',
  durationHours: '24',
};

export default function MarketPage(): React.ReactElement {
  const {
    player,
    isLoading: isPlayerLoading,
    error: playerError,
    createPlayer,
    refresh,
  } = usePlayer();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [horses, setHorses] = useState<PublicHorse[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<SellForm>(EMPTY_FORM);
  const [bids, setBids] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // Satın almada anahtar başarıya kadar yaşar (tekrar = aynı satın alma).
  const buyKeys = useRef(new Map<string, string>());

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setListings(await apiClient.getMarketListings());
      if (player) setHorses(await apiClient.getHorsesByOwner(player.id));
    } catch (err: unknown) {
      setMessage(`Hata: ${err instanceof Error ? err.message : 'İlanlar yüklenemedi'}`);
    } finally {
      setLoading(false);
    }
  }, [player]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const run = async (label: string, action: () => Promise<string>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setMessage(label);
    try {
      setMessage(await action());
      await fetchAll();
      await refresh();
    } catch (err: unknown) {
      setMessage(`Hata: ${err instanceof Error ? err.message : 'İşlem başarısız'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleBuy = (listingId: string) =>
    run('Satın alınıyor…', async () => {
      const key = buyKeys.current.get(listingId) ?? crypto.randomUUID();
      buyKeys.current.set(listingId, key);
      await apiClient.buyMarketListing(listingId, key);
      buyKeys.current.delete(listingId);
      return 'Satın alma başarılı — at ahırında.';
    });

  const handleBid = (listing: MarketListing, suggested: number) =>
    run('Teklif veriliyor…', async () => {
      const amount = Number(bids[listing.id] ?? suggested);
      const result = await apiClient.placeMarketBid(listing.id, amount);
      setBids((current) => ({ ...current, [listing.id]: '' }));
      return `Teklifin alındı: ${formatCurrency('money', amount)} emanette. Kalan bakiye ${formatCurrency('money', result.bidderMoney)}. Geçilirsen paran otomatik iade edilir.`;
    });

  const handleCancel = (listingId: string) =>
    run('İlan kaldırılıyor…', async () => {
      await apiClient.cancelMarketListing(listingId);
      return 'İlan kaldırıldı.';
    });

  const handleSell = () => {
    const built = buildSellBody(form);
    if (!built.ok) {
      setMessage(built.error);
      return;
    }
    void run('İlan açılıyor…', async () => {
      await apiClient.createMarketListing(built.body);
      setForm(EMPTY_FORM);
      return built.body.listingType === 'auction'
        ? 'Müzayede açıldı. Süre bitince en yüksek teklif kazanır; teklif gelmezse at sende kalır.'
        : 'İlan açıldı.';
    });
  };

  const listedHorseIds = new Set(
    listings.filter((l) => l.status === 'active').map((l) => l.horseId),
  );
  const sellableHorses = horses.filter((horse) => !listedHorseIds.has(horse.id));

  return (
    <main className="page-container">
      <h1
        style={{
          fontSize: '24px',
          color: 'var(--color-text-primary)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        At Pazarı
      </h1>

      {!player && !isPlayerLoading ? (
        <GlassPanel
          style={{
            marginBottom: 'var(--space-lg)',
            textAlign: 'center',
            padding: 'var(--space-xl)',
          }}
        >
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Alım satım için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button
            type="button"
            onClick={() => void createPlayer()}
            style={actionButtonStyle('positive')}
          >
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? (
            <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p>
          ) : null}
        </GlassPanel>
      ) : null}

      {player ? (
        <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
          <h2 style={{ marginTop: 0, fontSize: '16px', color: 'var(--color-text-primary)' }}>
            Atımı Sat
          </h2>
          <div className="market-sell-form">
            <label>
              At
              <select
                aria-label="Satılacak at"
                value={form.horseId}
                onChange={(event) => setForm({ ...form, horseId: event.target.value })}
              >
                <option value="">Seç…</option>
                {sellableHorses.map((horse) => (
                  <option key={horse.id} value={horse.id}>
                    {horse.name} · Seviye {horse.level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Satış türü
              <select
                aria-label="Satış türü"
                value={form.listingType}
                onChange={(event) =>
                  setForm({ ...form, listingType: event.target.value as SellForm['listingType'] })
                }
              >
                <option value="fixed_price">Sabit fiyat</option>
                <option value="auction">Müzayede</option>
              </select>
            </label>
            <label>
              {form.listingType === 'auction' ? 'Başlangıç fiyatı' : 'Fiyat'}
              <input
                aria-label="Fiyat"
                inputMode="numeric"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </label>
            <label>
              Süre
              <select
                aria-label="Süre"
                value={form.durationHours}
                onChange={(event) => setForm({ ...form, durationHours: event.target.value })}
              >
                {form.listingType === 'fixed_price' ? <option value="">Süresiz</option> : null}
                {LISTING_DURATION_HOURS.map((hours) => (
                  <option key={hours} value={String(hours)}>
                    {hours} saat
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={handleSell}
              style={actionButtonStyle('gold')}
            >
              İlanı Aç
            </button>
          </div>
          {form.listingType === 'auction' ? (
            <p
              style={{
                margin: 'var(--space-sm) 0 0',
                fontSize: '12px',
                color: 'var(--color-text-muted)',
              }}
            >
              Teklif verenin parası emanete alınır; geçilen teklif anında iade edilir. Teklif
              aldıktan sonra müzayede iptal edilemez.
            </p>
          ) : null}
        </GlassPanel>
      ) : null}

      {message ? (
        <div role="status" className="market-message">
          {message}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>İlanlar yükleniyor…</p>
      ) : listings.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Pazarda aktif ilan bulunmuyor.
          </p>
        </GlassPanel>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          {listings.map((item) => {
            const actions = listingActions(item, player?.id ?? null, now);
            const timeLeft = formatTimeLeft(item.expiresAt, now);
            return (
              <GlassPanel key={item.id}>
                <div className="market-listing" data-testid={`listing-${item.id}`}>
                  <div>
                    <p className="market-listing-title">
                      {item.horseName ?? 'At'}{' '}
                      <span className="market-badge">
                        {actions.isAuction ? 'Müzayede' : 'Sabit fiyat'}
                      </span>
                      {actions.isMine ? <span className="market-badge">Senin ilanın</span> : null}
                      {actions.isLeader ? (
                        <span className="market-badge market-badge-lead">Öndesin</span>
                      ) : null}
                    </p>
                    {actions.isAuction ? (
                      <p className="market-price">
                        {item.auction?.currentBid != null
                          ? `En yüksek teklif ${formatCurrency('money', item.auction.currentBid)} · ${item.auction.bidCount} teklif`
                          : `Başlangıç ${formatCurrency('money', item.price)} · henüz teklif yok`}
                      </p>
                    ) : (
                      <p className="market-price">{formatCurrency('money', item.price)}</p>
                    )}
                    {timeLeft ? <p className="market-meta">{timeLeft}</p> : null}
                  </div>
                  <div className="market-actions">
                    {actions.canBuy ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleBuy(item.id)}
                        style={actionButtonStyle('positive')}
                      >
                        Satın Al
                      </button>
                    ) : null}
                    {actions.canBid && actions.suggestedBid !== null ? (
                      <>
                        <input
                          aria-label="Teklif tutarı"
                          inputMode="numeric"
                          className="market-bid-input"
                          placeholder={String(actions.suggestedBid)}
                          value={bids[item.id] ?? ''}
                          onChange={(event) => setBids({ ...bids, [item.id]: event.target.value })}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleBid(item, actions.suggestedBid!)}
                          style={actionButtonStyle('gold')}
                        >
                          Teklif Ver (en az {actions.suggestedBid})
                        </button>
                      </>
                    ) : null}
                    {actions.canCancel ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleCancel(item.id)}
                        style={actionButtonStyle('ghost')}
                      >
                        İlanı Kaldır
                      </button>
                    ) : null}
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </main>
  );
}

function actionButtonStyle(variant: 'positive' | 'gold' | 'ghost'): React.CSSProperties {
  const palette = {
    positive: { background: 'var(--color-status-positive)', color: '#0b1a10', border: 'none' },
    gold: { background: 'var(--color-accent-gold)', color: '#1a1405', border: 'none' },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-primary)',
      border: '1px solid var(--color-border)',
    },
  }[variant];
  return {
    // AUDIT_REPORT.md F1: 44px dokunma hedefi.
    minHeight: '44px',
    padding: '10px 16px',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 700,
    cursor: 'pointer',
    ...palette,
  };
}
