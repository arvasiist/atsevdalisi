'use client';

/**
 * Ana Sayfa / Dashboard — `docs/GAME_DESIGN.md` §2/§4. `(dashboard)` bir
 * Next.js rota grubudur; sayfa `/`'de yaşar.
 *
 * 01.10.2026 TASARIM YENİLEMESİ — sahibin paylaştığı konsept görsellerin
 * düzeni: üstte başlık bandı, ortada öne çıkan at kartı (statlar +
 * Antrenman/Bakım/Yarışa Katıl), solda ahır durumu + cüzdan + kariyer,
 * sağda yaklaşan yarışlar + son sonuçlar, altta simgeli hızlı erişim.
 *
 * Kurallar (değişmedi):
 *  - Yalnızca GERÇEK veri gösterilir. Konseptteki "Günlük Görevler" gibi
 *    sunucuda karşılığı olmayan bölümler EKLENMEDİ.
 *  - Fotoğraf/görsel dosyası YOK (CLAUDE.md kural 8): başlık bandı ve at
 *    kartının görsel alanı CSS degradeleri + projeye özgü SVG silüetlerdir.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BatteryMedium,
  CalendarClock,
  ChartColumn,
  Clapperboard,
  Coins,
  Dumbbell,
  Gem,
  Globe,
  HeartPulse,
  Medal,
  ShoppingCart,
  Smile,
  Ticket,
  Trophy,
  Users,
  Warehouse,
  Wheat,
  Wrench,
  Zap,
} from 'lucide-react';
import type {
  PublicHorse,
  RaceLobbyListItem,
  RecentRaceResultView,
  StableSummaryView,
} from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HorseAvatar } from '../../components/ui/HorseAvatar';
import { HorseHeadIcon } from '../../components/ui/HorseHeadIcon';
import { StarRating } from '../../components/ui/StarRating';
import { StatBar } from '../../components/ui/StatBar';
import { getCareerProgress } from '../../features/career/career-tier';
import { pickFeaturedHorse } from '../../features/home-scene/featured-horse';
import { HomeHero } from '../../features/home-scene/HomeHero';
import { apiClient } from '../../lib/api-client';
import { CURRENCY_LABELS } from '../../lib/currency';
import { formatRaceStart, formatTimeUntil } from '../../lib/format-time';
import { usePlayer } from '../../lib/player-context';

interface QuickLink {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}

const ICON_SIZE = 26;

const QUICK_LINKS: QuickLink[] = [
  { href: '/stable', icon: <HorseHeadIcon size={ICON_SIZE + 4} />, label: 'Ahırım', description: 'Atlarını yönet' },
  { href: '/training', icon: <Dumbbell size={ICON_SIZE} />, label: 'Antrenman', description: 'Statları geliştir' },
  { href: '/care', icon: <HeartPulse size={ICON_SIZE} />, label: 'Bakım', description: 'Sağlık & besleme' },
  { href: '/races', icon: <Trophy size={ICON_SIZE} />, label: 'Yarışlar', description: 'Lobi & pratik yarış' },
  { href: '/grandstand', icon: <Ticket size={ICON_SIZE} />, label: 'Tribün', description: 'Yarışları izle' },
  { href: '/replays', icon: <Clapperboard size={ICON_SIZE} />, label: 'Tekrarlar', description: 'Geçmiş yarışlar' },
  { href: '/market', icon: <ShoppingCart size={ICON_SIZE} />, label: 'Pazar', description: 'Al & sat' },
  { href: '/equipment', icon: <Wrench size={ICON_SIZE} />, label: 'Ekipman', description: 'Eyer, dizgin, nal' },
  { href: '/farm', icon: <Wheat size={ICON_SIZE} />, label: 'Çiftlik', description: 'Üretim & kaynak' },
  { href: '/online', icon: <Globe size={ICON_SIZE} />, label: 'Online', description: 'PvP eşleşme' },
  { href: '/leaderboard', icon: <ChartColumn size={ICON_SIZE} />, label: 'Sıralama', description: 'Küresel tablo' },
  { href: '/friends', icon: <Users size={ICON_SIZE} />, label: 'Sosyal', description: 'Arkadaş & mesaj' },
];

export default function DashboardPage(): React.ReactElement {
  const { player, isLoading, error, createPlayer } = usePlayer();

  return (
    <main>
      <HomeHero />

      <div className="page-container" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
        {!player && !isLoading ? (
          <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
              Henüz giriş yapmış bir seyis/jokey hesabın yok.
            </p>
            <button type="button" onClick={() => void createPlayer()} className="btn-gold">
              Başlangıç Paketiyle Oyuncu Oluştur
            </button>
            {/* 30.09.2026 — kayıtlı hesabı olan oyuncunun geri dönüş yolu. */}
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: 0 }}>
              Kayıtlı hesabın var mı?{' '}
              <Link href="/account" style={{ color: 'var(--color-accent-focus)', fontWeight: 600 }}>
                Giriş yap
              </Link>
            </p>
            {error ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{error}</p> : null}
          </GlassPanel>
        ) : null}

        {player ? (
          <div className="home-grid">
            <div className="home-col">
              <StableStatusCard ownerId={player.id} />
              <EconomyCard money={player.money} gems={player.gems} />
              <CareerCard level={player.level} xp={player.xp} />
            </div>
            <FeaturedHorseCard ownerId={player.id} />
            <div className="home-col">
              <UpcomingRacesCard />
              <RecentRacesPanel playerId={player.id} />
            </div>
          </div>
        ) : null}

        <QuickAccess />
      </div>
    </main>
  );
}

function CardHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="card-header">
      <span className="card-header-icon">{icon}</span>
      <span className="section-title">{title}</span>
      {action ? <span style={{ marginLeft: 'auto' }}>{action}</span> : null}
    </div>
  );
}

function StableStatusCard({ ownerId }: { ownerId: string }): React.ReactElement {
  const [summary, setSummary] = useState<StableSummaryView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getStableSummary(ownerId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ahır özeti yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  return (
    <GlassPanel>
      <CardHeader icon={<Warehouse size={18} />} title="Ahır Durumu" />
      {error ? (
        <p className="muted-text" style={{ color: 'var(--color-status-critical)' }}>{error}</p>
      ) : !summary ? (
        <p className="muted-text">Yükleniyor…</p>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          <StatBar
            icon={<Warehouse size={14} />}
            label={`Kapasite · Seviye ${summary.stableLevel}`}
            value={summary.capacity === 0 ? 0 : (summary.horseCount / summary.capacity) * 100}
            color="var(--color-accent-gold)"
          />
          <div className="kv-row">
            <span>Atlar</span>
            <strong>
              {summary.horseCount} / {summary.capacity}
            </strong>
          </div>
          <StatBar icon={<Activity size={14} />} label="Ortalama Kondisyon" value={summary.averageCondition} />
          {summary.healthWarnings.map((warning) => (
            <span key={warning} style={{ fontSize: '12px', color: 'var(--color-status-warning)' }}>
              ⚠ {warning}
            </span>
          ))}
          <Link href="/stable" className="btn-outline">
            <Warehouse size={16} aria-hidden="true" />
            Ahırı Yönet
          </Link>
        </div>
      )}
    </GlassPanel>
  );
}

function EconomyCard({ money, gems }: { money: number; gems: number }): React.ReactElement {
  return (
    <GlassPanel>
      <CardHeader icon={<Coins size={18} />} title="Cüzdan" />
      <div className="economy-row">
        <div className="economy-item">
          <Coins size={26} color="var(--color-accent-gold)" aria-hidden="true" />
          <div>
            <span className="economy-label">{CURRENCY_LABELS.money}</span>
            <span className="economy-value">{money.toLocaleString('tr-TR')}</span>
          </div>
        </div>
        <div className="economy-item">
          <Gem size={26} color="var(--color-accent-gem)" aria-hidden="true" />
          <div>
            <span className="economy-label">{CURRENCY_LABELS.gems}</span>
            <span className="economy-value">{gems.toLocaleString('tr-TR')}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
        <Link href="/wallet" className="btn-outline">
          Cüzdan
        </Link>
        <Link href="/market" className="btn-outline">
          <ShoppingCart size={16} aria-hidden="true" />
          Pazar
        </Link>
      </div>
    </GlassPanel>
  );
}

function CareerCard({ level, xp }: { level: number; xp: number }): React.ReactElement {
  // Kariyer kademeleri `features/career/career-tier.ts`'ten (progression
  // config ile hizalı); yeni bir denge kararı icat edilmez.
  const careerProgress = getCareerProgress(level);
  return (
    <GlassPanel>
      <CardHeader icon={<Medal size={18} />} title="Kariyer" />
      <div className="kv-row" style={{ marginBottom: '10px' }}>
        <span className="tier-chip">{careerProgress.tier.label}</span>
        <span className="muted-text" style={{ margin: 0 }}>
          Seviye {level} · {xp.toLocaleString('tr-TR')} XP
        </span>
      </div>
      {careerProgress.nextTier ? (
        <StatBar
          label={`Sonraki: ${careerProgress.nextTier.label} (Sv. ${careerProgress.nextTier.minLevel})`}
          value={careerProgress.progressToNextTier * 100}
        />
      ) : (
        <p className="muted-text">En üst kariyer kademesine ulaştın.</p>
      )}
    </GlassPanel>
  );
}

const GENDER_LABELS: Record<PublicHorse['gender'], string> = {
  mare: 'Kısrak',
  stallion: 'Aygır',
  gelding: 'İğdiş',
};

/** Öne çıkan at: en yüksek kaliteli olan (eşitlikte en yüksek seviye). */
const pickFeatured = pickFeaturedHorse;

function FeaturedHorseCard({ ownerId }: { ownerId: string }): React.ReactElement {
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getHorsesByOwner(ownerId)
      .then((data) => {
        if (!cancelled) setHorses(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Atlar yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  const horse = useMemo(() => {
    if (!horses) return null;
    return horses.find((item) => item.id === selectedId) ?? pickFeatured(horses);
  }, [horses, selectedId]);

  return (
    <GlassPanel style={{ padding: 0, overflow: 'hidden' }}>
      <div className="featured-stage">
        <HorseHeadIcon size={220} gradient withMane className="featured-silhouette" />
        {horse ? (
          <div className="featured-title">
            <span className="featured-name">{horse.name}</span>
            <span className="featured-meta">
              {horse.breed} · {GENDER_LABELS[horse.gender]} · Seviye {horse.level}
            </span>
            <StarRating score={horse.quality} />
          </div>
        ) : null}
      </div>

      <div style={{ padding: 'var(--space-lg)', display: 'grid', gap: 'var(--space-md)' }}>
        {error ? (
          <p className="muted-text" style={{ color: 'var(--color-status-critical)' }}>{error}</p>
        ) : horses === null ? (
          <p className="muted-text">Yükleniyor…</p>
        ) : !horse ? (
          <div style={{ textAlign: 'center', display: 'grid', gap: '12px', justifyItems: 'center' }}>
            <p className="muted-text">Ahırında henüz at yok.</p>
            <Link href="/market" className="btn-gold">
              <ShoppingCart size={18} aria-hidden="true" />
              Pazardan At Al
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: '10px' }}>
              <StatBar icon={<HeartPulse size={14} />} label="Sağlık" value={horse.health} />
              <StatBar icon={<BatteryMedium size={14} />} label="Enerji" value={horse.energy} />
              <StatBar icon={<Activity size={14} />} label="Kondisyon" value={horse.fitness} />
              <StatBar icon={<Smile size={14} />} label="Moral" value={horse.morale} />
              <StatBar icon={<Zap size={14} />} label="Yorgunluk" value={horse.fatigue} higherIsBetter={false} />
            </div>
            <div className="featured-actions">
              <Link href="/training" className="btn-action btn-action-blue">
                <Dumbbell size={18} aria-hidden="true" />
                Antrenman
              </Link>
              <Link href="/care" className="btn-action btn-action-green">
                <HeartPulse size={18} aria-hidden="true" />
                Bakım
              </Link>
            </div>
            <Link href="/races" className="btn-gold" style={{ width: '100%' }}>
              <Trophy size={18} aria-hidden="true" />
              Yarışa Katıl
            </Link>
            {horses.length > 1 ? (
              <div className="horse-strip" role="list" aria-label="Atların">
                {horses.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className="horse-strip-item"
                    aria-pressed={item.id === horse.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <HorseAvatar horseId={item.id} size={40} />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </GlassPanel>
  );
}

const UPCOMING_LIMIT = 3;

function UpcomingRacesCard(): React.ReactElement {
  const [races, setRaces] = useState<RaceLobbyListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .listLobbyRaces()
      .then((data) => {
        if (cancelled) return;
        const open = data
          .filter((race) => race.status === 'scheduled')
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        setRaces(open.slice(0, UPCOMING_LIMIT));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Yarışlar yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GlassPanel>
      <CardHeader
        icon={<CalendarClock size={18} />}
        title="Yaklaşan Yarışlar"
        action={
          <Link href="/races" className="link-small">
            Tümünü gör
          </Link>
        }
      />
      {error ? (
        <p className="muted-text" style={{ color: 'var(--color-status-critical)' }}>{error}</p>
      ) : races === null ? (
        <p className="muted-text">Yükleniyor…</p>
      ) : races.length === 0 ? (
        <p className="muted-text">Şu an açık yarış yok. Yarışlar sayfasından kendin bir yarış açabilirsin.</p>
      ) : (
        <ul className="row-list">
          {races.map((race) => (
            <li key={race.id} className="row-item">
              <span className="row-icon">
                {race.tournament ? <Trophy size={18} /> : <CalendarClock size={18} />}
              </span>
              <span style={{ display: 'grid', gap: '2px', minWidth: 0 }}>
                <strong className="row-title">{race.name}</strong>
                <span className="row-meta">
                  {race.distanceMeters} m · {formatRaceStart(race.startTime)} · {formatTimeUntil(race.startTime)}
                </span>
              </span>
              <Link href="/races" className="btn-chip">
                {race.myEntry && race.myEntry.status !== 'cancelled' ? 'Kayıtlı' : 'Katıl'}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}

function RecentRacesPanel({ playerId }: { playerId: string }): React.ReactElement {
  const [races, setRaces] = useState<RecentRaceResultView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getRecentRaces(playerId, 5)
      .then((data) => {
        if (!cancelled) setRaces(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Son yarışlar yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return (
    <GlassPanel>
      <CardHeader
        icon={<Clapperboard size={18} />}
        title="Son Sonuçlar"
        action={
          <Link href="/replays" className="link-small">
            Tüm geçmiş
          </Link>
        }
      />
      {error ? (
        <p className="muted-text" style={{ color: 'var(--color-status-critical)' }}>{error}</p>
      ) : races === null ? (
        <p className="muted-text">Yükleniyor…</p>
      ) : races.length === 0 ? (
        <p className="muted-text">
          Henüz bir yarış koşmadın.{' '}
          <Link href="/races" style={{ color: 'var(--color-accent-focus)' }}>
            Pratik yarışla başla.
          </Link>
        </p>
      ) : (
        <ol className="row-list">
          {races.map((race) => (
            // Her satır `/replays/[raceId]` tekrarına gider (§22 Replay).
            <li key={race.raceId}>
              <Link href={`/replays/${race.raceId}`} className="row-item" data-winner={race.finishPosition === 1 || undefined}>
                <span className="position-badge" data-place={race.finishPosition <= 3 ? race.finishPosition : undefined}>
                  {race.finishPosition}
                </span>
                <span style={{ display: 'grid', gap: '2px', minWidth: 0 }}>
                  <strong className="row-title">{race.horseName}</strong>
                  <span className="row-meta">
                    {race.raceName} · {race.distanceMeters} m · {surfaceLabel(race.surface)} ·{' '}
                    {formatRelativeDate(race.finishedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </GlassPanel>
  );
}

function QuickAccess(): React.ReactElement {
  return (
    <section aria-label="Hızlı erişim">
      <div className="card-header" style={{ marginBottom: '12px' }}>
        <span className="section-title">Hızlı Erişim</span>
      </div>
      <div className="quick-grid">
        {QUICK_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="quick-tile">
            <span className="quick-tile-icon">{item.icon}</span>
            <span className="quick-tile-label">{item.label}</span>
            <span className="quick-tile-desc">{item.description}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function surfaceLabel(surface: string): string {
  switch (surface) {
    case 'grass':
      return 'Çim';
    case 'dirt':
      return 'Toprak';
    case 'synthetic':
      return 'Sentetik';
    default:
      return surface;
  }
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < MS_PER_MINUTE) return 'az önce';
  if (diffMs < MS_PER_HOUR) return `${Math.floor(diffMs / MS_PER_MINUTE)} dk önce`;
  if (diffMs < MS_PER_DAY) return `${Math.floor(diffMs / MS_PER_HOUR)} sa önce`;
  return `${Math.floor(diffMs / MS_PER_DAY)} gün önce`;
}
