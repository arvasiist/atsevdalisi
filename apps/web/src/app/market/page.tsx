'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';

interface Listing {
  id: string;
  horseId: string;
  price: number;
  status: string;
}

export default function MarketPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyerId, setBuyerId] = useState('');
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
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>At Pazarı</h1>

      <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f4f4f5', borderRadius: '8px' }}>
        <label htmlFor="buyer-id-input" style={{ display: 'block', marginBottom: '0.5rem' }}>
          <strong>Alıcı Oyuncu ID:</strong>
        </label>
        <input
          id="buyer-id-input"
          type="text"
          value={buyerId}
          onChange={(e) => setBuyerId(e.target.value)}
          placeholder="Oyuncu UUID girin"
          style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
        />
      </div>

      {message && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#e0f2fe', borderRadius: '6px' }}>
          {message}
        </div>
      )}

      {loading ? (
        <p>İlanlar yükleniyor...</p>
      ) : listings.length === 0 ? (
        <p>Pazarda aktif ilan bulunmuyor.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {listings.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
              }}
            >
              <div>
                <p style={{ margin: '0 0 0.25rem 0' }}><strong>At ID:</strong> {item.horseId}</p>
                <p style={{ margin: 0 }}><strong>Fiyat:</strong> {item.price.toLocaleString()} ₺</p>
              </div>
              <button
                type="button"
                onClick={() => void handleBuy(item.id)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Satın Al
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}