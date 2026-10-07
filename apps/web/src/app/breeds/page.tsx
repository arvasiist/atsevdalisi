'use client';

/**
 * AT YETİŞTİRİCİSİ — IRK MAĞAZASI (07.10.2026). Sahibinin kuralı: ücretsiz
 * başlangıç atı EN ZAYIF ırktır; güçlü ırklar burada oyun parasıyla, seviye
 * şartını geçerek alınır. Katalog `config/breeds.config.json`dan gelir;
 * fiyatı ve şartı sunucu kendi config'inden yeniden denetler (istemci fiyat
 * göndermez). Satın alma anahtarı BAŞARIYA kadar korunur — yanıt kaybolup
 * yeniden basılırsa ikinci bir at + ikinci ödeme olmaz.
 */

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { BuyBreedHorseResult, HorseGender } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import {
  BREEDS_CONFIG,
  DISTANCE_LABELS,
  SHOP_BREEDS,
  SHOP_STAT_LABELS,
  bestDistance,
  breedAvailability,
  breedLabel,
  isStarterBreed,
} from '../../features/breeds/breed-catalog';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

const GENDER_OPTIONS: ReadonlyArray<{ value: HorseGender; label: string }> = [
  { value: 'mare', label: 'Kısrak' },
  { value: 'stallion', label: 'Aygır' },
  { value: 'gelding', label: 'İğdiş' },
];

function formatMoney(amount: number): string {
  return formatCurrency('money', amount);
}

function BreedsContent(): React.ReactElement {
  const { player, isLoading, createPlayer, refresh } = usePlayer();
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<HorseGender>('mare');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState<BuyBreedHorseResult | null>(null);
  const pendingKey = useRef<{ fingerprint: string; key: string } | null>(null);

  if (!player) {
    return (
      <main className="page-container">
        <h1 className="page-title">At Yetiştiricisi</h1>
        {isLoading ? null : (
          <GlassPanel>
            <p>Irkları görmek için önce bir oyuncu oluştur.</p>
            <button type="button" className="moderation-primary" onClick={() => void createPlayer()}>
              Oyuncu oluştur
            </button>
          </GlassPanel>
        )}
      </main>
    );
  }

  const buy = async (breedKey: string) => {
    setBusy(true);
    setError(null);
    setBought(null);
    // Ad/cinsiyet/ırk değişirse yeni istek = yeni anahtar; aynı istek tekrar
    // basılırsa aynı anahtar (sunucu aynı sonucu döner, ikinci kez ödetmez).
    const fingerprint = `${breedKey}|${name.trim()}|${gender}`;
    if (pendingKey.current?.fingerprint !== fingerprint) {
      pendingKey.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      const result = await apiClient.buyBreedHorse(breedKey, { name: name.trim(), gender }, pendingKey.current.key);
      pendingKey.current = null;
      setBought(result);
      setSelected(null);
      setName('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Satın alma başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const starter = breedLabel(BREEDS_CONFIG.starterBreed);

  return (
    <main className="page-container" data-testid="breeds-page">
      <h1 className="page-title">At Yetiştiricisi</h1>
      <GlassPanel>
        <p className="session-meta">
          Ücretsiz başlangıç atın <strong>{starter}</strong> ırkındandır — en zayıf ırk. Güçlü ırkları yarışlardan
          kazandığın parayla buradan alabilirsin; bazıları belirli bir seviye ister. Bakiye:{' '}
          <strong>{formatMoney(player.money)}</strong> · Seviye <strong>{player.level}</strong>
        </p>
      </GlassPanel>
      {error ? <p className="moderation-error">{error}</p> : null}
      {bought ? (
        <GlassPanel>
          <p data-testid="breeds-bought">
            <strong>{bought.horse.name}</strong> ({breedLabel(bought.horse.breed)}) ahırına katıldı —{' '}
            {formatMoney(bought.price)} ödendi. <Link href="/stable">Ahıra git</Link>
          </p>
        </GlassPanel>
      ) : null}
      <div className="breed-grid">
        {SHOP_BREEDS.map((breed) => {
          const availability = breedAvailability(breed, player.level, player.money);
          const isOpen = selected === breed.key;
          return (
            <GlassPanel key={breed.key}>
              <article className="breed-card" data-testid={`breed-${breed.key}`}>
                <header className="breed-card-head">
                  <strong className="breed-name">{breed.name}</strong>
                  {isStarterBreed(breed.key) ? <span className="breed-badge">Ücretsiz başlangıç ırkı</span> : null}
                </header>
                <span className="session-meta">{breed.origin}</span>
                <p className="breed-description">{breed.description}</p>
                <ul className="breed-stats">
                  {SHOP_STAT_LABELS.map(({ key, label }) => {
                    const value = breed.stats[key] ?? 50;
                    return (
                      <li key={key}>
                        <span>{label}</span>
                        <span className="breed-bar" aria-hidden="true">
                          <span style={{ width: `${value}%` }} />
                        </span>
                        <span>{value}</span>
                      </li>
                    );
                  })}
                </ul>
                <span className="session-meta">En iyi mesafe: {DISTANCE_LABELS[bestDistance(breed)]}</span>
                <span className="breed-price">{formatMoney(breed.priceMoney)}</span>
                {breed.minPlayerLevel > 1 ? (
                  <span className="session-meta">Seviye şartı: {breed.minPlayerLevel}</span>
                ) : null}
                {availability === 'level' ? (
                  <span className="session-meta">🔒 {breed.minPlayerLevel}. seviyede açılır</span>
                ) : null}
                {availability === 'money' ? <span className="session-meta">Bakiyen yetmiyor</span> : null}
                {isOpen ? (
                  <form
                    className="breed-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void buy(breed.key);
                    }}
                  >
                    <label>
                      Atın adı
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        minLength={2}
                        maxLength={24}
                        required
                      />
                    </label>
                    <label>
                      Cinsiyet
                      <select value={gender} onChange={(event) => setGender(event.target.value as HorseGender)}>
                        {GENDER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="moderation-primary" disabled={busy || name.trim().length < 2}>
                      {formatMoney(breed.priceMoney)} öde ve al
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="moderation-primary"
                    disabled={availability !== 'ok' || busy}
                    onClick={() => {
                      setSelected(breed.key);
                      setError(null);
                    }}
                  >
                    Satın al
                  </button>
                )}
              </article>
            </GlassPanel>
          );
        })}
      </div>
    </main>
  );
}

export default BreedsContent;
