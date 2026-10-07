'use client';

/**
 * MAĞAZA (07.10.2026, Faz 12, brief §20/§88). Elmas paketleri; ödeme
 * SAĞLAYICININ sayfasında yapılır (kart bilgisi bu siteye hiç girmez).
 * Dönüşte sipariş sunucudan yoklanır — "ödendi" bilgisi yalnızca sağlayıcının
 * imzalı bildirimiyle gelir; bu ekran onu yalnızca GÖSTERİR. Sağlayıcı
 * yapılandırılmamışsa satın alma kapalıdır ve öyle yazar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaymentOrderView, StoreView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { PAYMENT_STATUS_LABELS, formatPrice, isFinalPaymentStatus } from '../../features/store/store-labels';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

const POLL_MS = 3000;

function StoreContent(): React.ReactElement {
  const { player, isLoading, createPlayer, refresh } = usePlayer();
  // Sorgu dizesi `useEffect`te okunur (`account/reset` ile aynı): `useSearchParams`
  // sayfa düzeyinde Suspense sınırı ister, yoksa statik derleme kırılır.
  const [returnedOrderId, setReturnedOrderId] = useState<string | null>(null);
  useEffect(() => {
    setReturnedOrderId(new URLSearchParams(window.location.search).get('order'));
  }, []);
  const [store, setStore] = useState<StoreView | null>(null);
  const [orders, setOrders] = useState<PaymentOrderView[]>([]);
  const [returned, setReturned] = useState<PaymentOrderView | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Anahtar BAŞARIYA kadar korunur (cüzdan deseni): yanıt ağda kaybolursa
  // yeniden basış ikinci bir ödeme oturumu açmaz.
  const pendingKey = useRef<{ sku: string; key: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [view, history] = await Promise.all([apiClient.getStore(), apiClient.listPaymentOrders()]);
      setStore(view);
      setOrders(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mağaza yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    if (player) void load();
  }, [player, load]);

  useEffect(() => {
    if (!player || !returnedOrderId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const order = await apiClient.getPaymentOrder(returnedOrderId);
        if (stopped) return;
        setReturned(order);
        if (isFinalPaymentStatus(order.status)) {
          await Promise.all([load(), refresh()]);
          return;
        }
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : 'Sipariş okunamadı.');
        return;
      }
      if (!stopped) setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [player, returnedOrderId, load, refresh]);

  if (!player) {
    return (
      <main className="page-container">
        <h1 className="page-title">Mağaza</h1>
        {isLoading ? null : (
          <GlassPanel>
            <p>Mağazayı görmek için önce bir oyuncu oluştur.</p>
            <button type="button" className="moderation-primary" onClick={() => void createPlayer()}>
              Oyuncu oluştur
            </button>
          </GlassPanel>
        )}
      </main>
    );
  }

  const buy = async (sku: string) => {
    setBusySku(sku);
    setError(null);
    if (pendingKey.current?.sku !== sku) pendingKey.current = { sku, key: crypto.randomUUID() };
    try {
      const checkout = await apiClient.createCheckout(sku, pendingKey.current.key);
      pendingKey.current = null;
      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ödeme başlatılamadı.');
      setBusySku(null);
    }
  };

  return (
    <main className="page-container" data-testid="store-page">
      <h1 className="page-title">Mağaza</h1>
      {error ? <p className="moderation-error">{error}</p> : null}
      {returned ? (
        <GlassPanel>
          <p data-testid="store-returned">
            Siparişin: <strong>{PAYMENT_STATUS_LABELS[returned.status]}</strong>
            {returned.status === 'paid' ? ` — ${returned.gems} elmas hesabına eklendi.` : ''}
            {returned.status === 'pending' ? ' — ödeme sağlayıcısından onay bekleniyor…' : ''}
          </p>
        </GlassPanel>
      ) : null}
      {store === null ? (
        <p className="session-meta">Yükleniyor…</p>
      ) : (
        <>
          {!store.available ? (
            <GlassPanel>
              <p className="session-meta" data-testid="store-unavailable">
                Satın alma şu an kapalı: sunucuda bir ödeme sağlayıcısı yapılandırılmadı.
              </p>
            </GlassPanel>
          ) : null}
          <div className="store-grid">
            {store.products.map((product) => (
              <GlassPanel key={product.sku}>
                <div className="store-product">
                  <strong className="store-gems">{product.gems.toLocaleString('tr-TR')} elmas</strong>
                  <span className="store-price">{formatPrice(product.priceMinor, product.currency)}</span>
                  <button
                    type="button"
                    className="moderation-primary"
                    disabled={!store.available || busySku !== null}
                    onClick={() => void buy(product.sku)}
                  >
                    Satın al
                  </button>
                </div>
              </GlassPanel>
            ))}
          </div>
          <GlassPanel>
            <h2 className="avatar-section-title">Makbuzlarım</h2>
            {orders.length === 0 ? (
              <p className="session-meta">Henüz satın alma yok.</p>
            ) : (
              <ul className="session-list" data-testid="store-orders">
                {orders.map((order) => (
                  <li key={order.id}>
                    {new Date(order.createdAt).toLocaleString('tr-TR')} · {order.gems} elmas ·{' '}
                    {formatPrice(order.amountMinor, order.currency)} · <strong>{PAYMENT_STATUS_LABELS[order.status]}</strong>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        </>
      )}
    </main>
  );
}

export default StoreContent;
