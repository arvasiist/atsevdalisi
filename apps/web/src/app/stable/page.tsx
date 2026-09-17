'use client';

/**
 * Ahırım — `docs/GAME_DESIGN.md` §5 Ahır ekranı, proje sahibinin paylaştığı
 * UI mockup'ındaki at portresi + stat bar'lar + yıldız derecelendirme
 * paneli. Daha önce bu rota HİÇ VAR OLMUYORDU (bkz. Faz 2 araştırma
 * notları) — tek "ahır benzeri" görünüm eski `app/page.tsx`'in düz metin
 * listesiydi (avatar/stat bar/rating YOKTU).
 *
 * Tüm veriler GERÇEKTİR (`GET /horses?ownerId=` → `PublicHorse[]`,
 * `packages/shared-types/src/horse.ts`) — health/fitness/fatigue/energy/
 * morale zaten var olan 0-100 alanlardır, yıldız derecelendirme `quality`
 * puanından İSTEMCİ TARAFINDA türetilir (bkz. `StarRating.tsx` doc
 * yorumu), yeni bir backend alanı İCAT EDİLMEZ.
 */

import { useEffect, useState } from 'react';
import type { PublicHorse } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HorseAvatar } from '../../components/ui/HorseAvatar';
import { StarRating } from '../../components/ui/StarRating';
import { StatBar } from '../../components/ui/StatBar';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

export default function StablePage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!player) {
      return;
    }
    let cancelled = false;
    setHorses(null);
    setError(null);
    void apiClient
      .getHorsesByOwner(player.id)
      .then((data) => {
        if (!cancelled) setHorses(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Atlar yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [player]);

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Ahırım</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Atlarının durumunu takip et, en güçlülerini yarışa hazırla.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Ahırını görebilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {player && horses === null && !error ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Ahır yükleniyor…</p>
      ) : null}

      {horses && horses.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Ahırında kayıtlı at bulunamadı.</p>
        </GlassPanel>
      ) : null}

      {horses && horses.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
          {horses.map((horse) => (
            <HorseCard key={horse.id} horse={horse} />
          ))}
        </div>
      ) : null}
    </main>
  );
}

function HorseCard({ horse }: { horse: PublicHorse }): React.ReactElement {
  return (
    <GlassPanel>
      <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
        <HorseAvatar horseId={horse.id} size={64} />
        <div style={{ display: 'grid', gap: '2px' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{horse.name}</span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {breedGenderLabel(horse.breed, horse.gender)} · Seviye {horse.level}
          </span>
          <StarRating score={horse.quality} />
        </div>
        <StatusBadge status={horse.status} />
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        <StatBar label="Sağlık" value={horse.health} />
        <StatBar label="Enerji" value={horse.energy} />
        <StatBar label="Kondisyon" value={horse.fitness} />
        <StatBar label="Yorgunluk" value={horse.fatigue} higherIsBetter={false} />
        <StatBar label="Moral" value={horse.morale} />
      </div>

      <div
        style={{
          marginTop: 'var(--space-md)',
          paddingTop: 'var(--space-sm)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--color-text-muted)',
        }}
      >
        <span>Potansiyel tahmini: {horse.potentialEstimate.min}–{horse.potentialEstimate.max}</span>
      </div>
    </GlassPanel>
  );
}

function StatusBadge({ status }: { status: PublicHorse['status'] }): React.ReactElement | null {
  if (status === 'active') {
    return null;
  }
  const labels: Record<Exclude<PublicHorse['status'], 'active'>, { text: string; color: string }> = {
    injured: { text: 'Sakat', color: 'var(--color-status-critical)' },
    retired: { text: 'Emekli', color: 'var(--color-text-muted)' },
    resting: { text: 'Dinleniyor', color: 'var(--color-status-warning)' },
  };
  const info = labels[status];
  return (
    <span
      style={{
        marginLeft: 'auto',
        alignSelf: 'flex-start',
        fontSize: '11px',
        padding: '3px 8px',
        borderRadius: '999px',
        border: `1px solid ${info.color}`,
        color: info.color,
      }}
    >
      {info.text}
    </span>
  );
}

function breedGenderLabel(breed: string, gender: PublicHorse['gender']): string {
  const genderLabels: Record<PublicHorse['gender'], string> = {
    mare: 'Kısrak',
    stallion: 'Aygır',
    gelding: 'İğdiş',
  };
  return `${breed} · ${genderLabels[gender]}`;
}

function primaryButtonStyle(): React.CSSProperties {
  return {
    padding: '12px 24px',
    background: 'var(--color-accent-gold)',
    color: '#1a1405',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
  };
}
