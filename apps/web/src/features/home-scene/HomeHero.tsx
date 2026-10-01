'use client';

/**
 * ANA SAYFA VİTRİNİ (01.10.2026, 3D yol haritası adım 3) — "önce dünya,
 * sonra arayüz". Ekranın üst kısmını 3D sahne kaplar; HUD sahnenin
 * üstünde, kenarlarda ince katmanlar olarak durur (dünyayı örtmez).
 *
 * Sahnedeki at oyuncunun GERÇEK atıdır (`GET /horses?ownerId=`, öne çıkan
 * at kuralı `pickFeaturedHorse` — ana sayfadaki kartla aynı). Değerler
 * (enerji, sağlık, moral…) sunucudan gelir; bu bileşen hiçbir şey hesaplamaz.
 *
 * Performans: sahne ekran dışındayken render durur (IntersectionObserver);
 * `prefers-reduced-motion` açıksa kamera otomatik dolaşmaz.
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Trophy, Warehouse } from 'lucide-react';
import { loadCameraConfig, loadHorsePresenceConfig } from '@at-sevdalisi/game-config';
import type { PublicHorse } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';
import { HORSE_MOOD_LABELS, deriveHorseDemeanor } from '../horse-stage/horse-demeanor';
import { PlaceholderBadge } from '../race-viewer/assets/PlaceholderBadge';
import { pickFeaturedHorse } from './featured-horse';

const HomeScene3D = dynamic(() => import('./HomeScene3D').then((mod) => mod.HomeScene3D), {
  ssr: false,
  loading: () => <div className="home3d-loading">3D hipodrom yükleniyor…</div>,
});

const SHOTS = loadCameraConfig().homeShowcase.shots;
const PRESENCE_CONFIG = loadHorsePresenceConfig();
/** Ekranda "nihai değil" denecek varlıklar — hepsi gelince rozet kaybolur. */
const SCENE_ASSET_IDS = [
  'HORSE_MODEL_REQUIRED',
  'JOCKEY_MODEL_REQUIRED',
  'HIPPODROME_ENVIRONMENT_REQUIRED',
  'STABLE_ENVIRONMENT_REQUIRED',
  'HDRI_SKY_REQUIRED',
];

const GENDER_LABELS: Record<PublicHorse['gender'], string> = {
  stallion: 'Aygır',
  mare: 'Kısrak',
  gelding: 'İğdiş',
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function MiniStat({ label, value }: { label: string; value: number }): React.ReactElement {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="home3d-stat">
      <span>{label}</span>
      <div className="home3d-stat-track" aria-hidden="true">
        <div className="home3d-stat-fill" style={{ width: `${pct}%` }} />
      </div>
      <strong>{Math.round(value)}</strong>
    </div>
  );
}

export function HomeHero(): React.ReactElement {
  const { player, isLoading, createPlayer } = usePlayer();
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [shotIndex, setShotIndex] = useState(0);
  const [requestedShot, setRequestedShot] = useState<number | null>(null);
  const [autoplay, setAutoplay] = useState(true);
  const [visible, setVisible] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) setAutoplay(false);
  }, []);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? true),
      {
        threshold: 0.05,
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!player) {
      setHorses(null);
      return undefined;
    }
    let cancelled = false;
    void apiClient
      .getHorsesByOwner(player.id)
      .then((data) => {
        if (!cancelled) setHorses(data);
      })
      .catch(() => {
        // Vitrin ikincildir: at listesi gelmezse sahne atsız kurulur, sayfa çalışmaya devam eder.
        if (!cancelled) setHorses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [player]);

  const horse = useMemo(() => (horses ? pickFeaturedHorse(horses) : null), [horses]);
  const mood = horse ? deriveHorseDemeanor(horse, PRESENCE_CONFIG).mood : null;
  const onShotChange = useCallback((index: number) => setShotIndex(index), []);

  return (
    <section ref={sectionRef} className="home3d" aria-label="3D hipodrom vitrini">
      <div className="home3d-canvas">
        <HomeScene3D
          horse={horse}
          requestedShot={requestedShot}
          autoplay={autoplay}
          active={visible}
          onShotChange={onShotChange}
        />
      </div>
      <div className="home3d-vignette" aria-hidden="true" />
      <PlaceholderBadge assetIds={SCENE_ASSET_IDS} style={{ top: 12, left: 12 }} />

      <div className="home3d-shots" role="group" aria-label="Kamera çekimleri">
        {SHOTS.map((shot, index) => (
          <button
            key={shot.id}
            type="button"
            className="home3d-shot"
            aria-pressed={index === shotIndex}
            onClick={() => {
              setRequestedShot(index);
              setShotIndex(index);
            }}
          >
            {shot.label}
          </button>
        ))}
        <button
          type="button"
          className="home3d-shot home3d-shot-icon"
          aria-label={autoplay ? 'Kamera dolaşımını durdur' : 'Kamera dolaşımını başlat'}
          onClick={() => {
            setRequestedShot(shotIndex);
            setAutoplay((value) => !value);
          }}
        >
          {autoplay ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>

      <div className="home3d-hud">
        {horse ? (
          <div className="home3d-horse">
            <div className="home3d-horse-name">{horse.name}</div>
            <div className="home3d-horse-meta">
              {horse.breed} · {GENDER_LABELS[horse.gender]} · Seviye {horse.level}
              {mood ? <span className="home3d-mood">{HORSE_MOOD_LABELS[mood]}</span> : null}
            </div>
            <div className="home3d-stats">
              <MiniStat label="Enerji" value={horse.energy} />
              <MiniStat label="Sağlık" value={horse.health} />
              <MiniStat label="Kondisyon" value={horse.fitness} />
              <MiniStat label="Moral" value={horse.morale} />
            </div>
          </div>
        ) : (
          <div className="home3d-horse">
            <div className="home3d-horse-name">AT SEVDALISI</div>
            <div className="home3d-horse-meta">
              Atını yetiştir, antrenman yap, hipodromda yarış.
            </div>
          </div>
        )}

        <div className="home3d-actions">
          {player ? (
            <>
              <Link href="/races" className="btn-gold home3d-cta">
                <Trophy size={18} aria-hidden="true" />
                Yarışa Katıl
              </Link>
              <Link href="/stable" className="btn-outline home3d-cta">
                <Warehouse size={18} aria-hidden="true" />
                Ahır
              </Link>
            </>
          ) : !isLoading ? (
            <button
              type="button"
              className="btn-gold home3d-cta"
              onClick={() => void createPlayer()}
            >
              Oyuna Başla
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
