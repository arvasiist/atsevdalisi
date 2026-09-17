'use client';

/**
 * At Pazarı — daha önce açık/beyaz tema (sabit `#f4f4f5`/`#cbd5e1` hex
 * renkleri) kullanıyordu, uygulamanın geri kalanının koyu tema
 * token'larıyla (`globals.css`) TUTARSIZDI. Bu Faz 2'nin bir parçası
 * olarak dark-theme token'larına ve `GlassPanel` diline taşındı — İŞ
 * MANTIĞI (listeleme/satın alma akışı) DEĞİŞMEDİ.
 *
 * `buyerId` artık `PlayerContext`'ten (Faz 2) otomatik doldurulur — eskiden
 * her satın alma için elle bir UUID YAPIŞTIRMAK gerekiyordu (kimlik hiçbir
 * yerde hatırlanmıyordu). Alan yine de düzenlenebilir bırakıldı (ör. başka
 * bir oyuncu adına test amaçlı satın alma senaryosu için).
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
  const { player } = usePlayer();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyerId, setBuyerId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (player && !buyerId) {
      setBuyerId(player.id);
    }
    // `buyerId` bilinçli olarak bağımlılık dizisinde DEĞİL — bu yalnızca
    // oyuncu ilk yüklendiğinde bir kerelik varsayılan atamadır, kullanıcının
    // elle girdiği değeri sonradan EZMEMELİDİR.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

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
    if (!buyerId.trim()) {
      setMessage('Lütfen satın almak için bir Oyuncu ID girin.');
      return;
    }

    try {
      setMessage('Satın alınıyor...');
      const idempotencyKey = crypto.randomUUID();
      await apiClient.buyMarketListing(listingId, buyerId.trim(), idempotencyKey);
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

      <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
        <label htmlFor="buyer-id-input" style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Alıcı Oyuncu ID
        </label>
        <input
          id="buyer-id-input"
          type="text"
          value={buyerId}
          onChange={(e) => setBuyerId(e.target.value)}
          placeholder="Oyuncu UUID girin"
          style={inputStyle()}
        />
      </GlassPanel>

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

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    boxSizing: 'border-box',
    background: 'var(--color-bg-surface-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
  };
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
