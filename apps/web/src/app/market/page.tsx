'use client';

/**
 * At Pazarı — daha önce açık/beyaz tema (sabit `#f4f4f5`/`#cbd5e1` hex
 * renkleri) kullanıyordu, uygulamanın geri kalanının koyu tema
 * token'larıyla (`globals.css`) TUTARSIZDI. Bu Faz 2'nin bir parçası
 * olarak dark-theme token'larına ve `GlassPanel` diline taşındı — İŞ
 * MANTIĞI (listeleme/satın alma akışı) DEĞİŞMEDİ.
 *
 * AUDIT_REPORT.md Bulgu S3 hardening SONRASI güncellendi — `buyerId`
 * artık backend'e HİÇ GÖNDERİLMEZ (`market.controller.ts` `buyListing`
 * doc yorumu: alıcı kimliği yalnızca `Authorization` header'ındaki
 * oturumdan gelir). Eski elle-UUID-yapıştırma input'u bu yüzden
 * TAMAMEN kaldırıldı — o alan artık backend tarafından zaten
 * YOK SAYILIRDI (DTO'da böyle bir alan tanımlı değil) ve kafa karıştırıcı
 * bir ölü UI parçası olurdu. Satın alma artık yalnızca giriş yapmış
 * oyuncunun kendi hesabıyla mümkündür.
 */

import { useEffect, useState } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

interface Listing {
  id: string;
  horseId: string;
  price: number;
  status: string;
}

export default function MarketPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const fetchMarketListings = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getMarketListings();
      setListings(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'İlanlar yüklenemedi';
      setMessage(`Hata: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMarketListings();
  }, []);

  const handleBuy = async (listingId: string) => {
    if (!player) {
      setMessage('Satın almak için önce bir seyis/jokey hesabı oluşturmalısın.');
      return;
    }

    try {
      setMessage('Satın alınıyor...');
      const idempotencyKey = crypto.randomUUID();
      await apiClient.buyMarketListing(listingId, idempotencyKey);
      setMessage('Satın alma başarılı!');
      await fetchMarketListings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Satın alma başarısız';
      setMessage(`Hata: ${msg}`);
    }
  };

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: 'var(--space-lg)' }}>At Pazarı</h1>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ marginBottom: 'var(--space-lg)', textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            İlanları satın alabilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={buyButtonStyle()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {message && (
        <div
          style={{
            marginBottom: 'var(--space-md)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid var(--color-accent-focus)',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>İlanlar yükleniyor...</p>
      ) : listings.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Pazarda aktif ilan bulunmuyor.</p>
        </GlassPanel>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          {listings.map((item) => (
            <GlassPanel key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>At ID: {item.horseId}</p>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-accent-gold)' }}>
                  {item.price.toLocaleString('tr-TR')} ₺
                </p>
              </div>
              <button type="button" onClick={() => void handleBuy(item.id)} style={buyButtonStyle()}>
                Satın Al
              </button>
            </GlassPanel>
          ))}
        </div>
      )}
    </main>
  );
}


function buyButtonStyle(): React.CSSProperties {
  return {
    padding: '10px 20px',
    background: 'var(--color-status-positive)',
    color: '#0b1a10',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 700,
    cursor: 'pointer',
  };
}
