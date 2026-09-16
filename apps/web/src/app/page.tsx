'use client';

import { useState } from 'react';
import { apiClient } from '../lib/api-client';

const RANDOM_ID_MULTIPLIER = 10000;

interface Horse {
  id: string;
  name: string;
  gender: string;
  breed: string;
  quality: number;
  potential: number;
}

interface Player {
  id: string;
  username: string;
  displayName: string;
  money: number;
}

interface StableSummary {
  totalHorses: number;
  stableLevel: number;
  capacity: number;
}

export default function HomePage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [stable, setStable] = useState<StableSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlayerData = async (playerId: string) => {
    const playerData = await apiClient.getPlayer(playerId);
    setPlayer(playerData);

    const horsesData = await apiClient.getHorsesByOwner(playerId);
    setHorses(horsesData);

    const stableData = await apiClient.getStableSummary(playerId);
    setStable(stableData);
  };

  const handleInitPlayer = async () => {
    try {
      setLoading(true);
      setError(null);
      const randomSuffix = Math.floor(Math.random() * RANDOM_ID_MULTIPLIER);
      const newPlayer = await apiClient.registerPlayer(
        `jokey_${randomSuffix}`,
        'Harbi Seyis',
      );
      await loadPlayerData(newPlayer.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Oyuncu başlatılamadı';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Hipodrom — Ahır Yönetimi</h1>

      {!player ? (
        <div style={{ padding: '1.5rem', background: '#f4f4f5', borderRadius: '8px' }}>
          <p>Henüz giriş yapmış bir seyis/jokey hesabı bulunmuyor.</p>
          <button
            onClick={handleInitPlayer}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Yükleniyor...' : 'Başlangıç Paketiyle Oyuncu Oluştur'}
          </button>
        </div>
      ) : (
        <div>
          <section style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1, padding: '1rem', border: '1px solid #e4e4e7', borderRadius: '8px' }}>
              <h3>Oyuncu</h3>
              <p><strong>{player.displayName}</strong> (@{player.username})</p>
              <p>Bakiye: <strong>{player.money.toLocaleString()} ₺</strong></p>
            </div>

            {stable && (
              <div style={{ flex: 1, padding: '1rem', border: '1px solid #e4e4e7', borderRadius: '8px' }}>
                <h3>Ahır Durumu</h3>
                <p>Seviye: <strong>{stable.stableLevel}</strong></p>
                <p>Kapasite: <strong>{stable.totalHorses} / {stable.capacity}</strong></p>
              </div>
            )}
          </section>

          <section>
            <h2>Ahırdaki Safkanlar</h2>
            {horses.length === 0 ? (
              <p>Ahırda kayıtlı at bulunamadı.</p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {horses.map((horse) => (
                  <div
                    key={horse.id}
                    style={{
                      padding: '1rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      background: '#fff',
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>{horse.name}</h4>
                    <p style={{ margin: '0.25rem 0' }}>Irk: {horse.breed} | Cinsiyet: {horse.gender}</p>
                    <p style={{ margin: '0.25rem 0' }}>Kalite: {horse.quality} / 100 | Potansiyel: {horse.potential} / 100</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '6px' }}>
          <strong>Hata:</strong> {error}
        </div>
      )}
    </main>
  );
}