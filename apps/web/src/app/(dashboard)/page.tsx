'use client';

/**
 * Ana Sayfa / Dashboard — `docs/GAME_DESIGN.md` §2 (ekran haritası) ve §4
 * ("Ana Sayfa kartları": Oyuncu kartı, Ahır kartı, Son yarış kartı, Hızlı
 * işlemler) ile proje sahibinin paylaştığı UI mockup'ının birleşimi.
 *
 * `(dashboard)` bir Next.js ROTA GRUBUDUR (route group) — URL'yi
 * ETKİLEMEZ, bu sayfa hâlâ `/`'de yaşar; `docs/GAME_DESIGN.md` §4'ün
 * açıkça istediği dosya konumu budur ("... `apps/web/src/app/(dashboard)/
 * page.tsx` üzerinde korunacak").
 *
 * Eski `app/page.tsx` (SİLİNDİ, bu dosyayla ÇAKIŞIRDI — Next.js aynı
 * path'e çözülen iki sayfaya izin vermez) düz beyaz/açık temalıydı,
 * hiçbir tema token'ı KULLANMIYORDU, oyuncu kimliğini yalnızca yerel
 * state'te tutuyordu (sayfa değişince kayboluyordu) ve mockup'taki hero/
 * kart-tabanlı navigasyon/son yarış panelinin HİÇBİRİ yoktu.
 *
 * Hero arka planı: `docs/GAME_DESIGN.md` §4 "görsel varlıklar özgün
 * üretilecektir (birebir kopya olmayacak)" notuna ve projenin HENÜZ
 * VERİLMEMİŞ "asset üretim hattı" kararına (docs/ROADMAP.md "Açık
 * kararlar") uygun olarak, burada bir fotoğraf/AI-üretim görsel yerine
 * TAMAMEN CSS/gradyan tabanlı özgün bir kompozisyon kullanılır — sahte bir
 * "foto-gerçekçi" görsel iddiasında bulunmaz.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RecentRaceResultView, StableSummaryView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { StatBar } from '../../components/ui/StatBar';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

interface NavCardItem {
  href: string;
  icon: string;
  label: string;
  description: string;
}

const NAV_ITEMS: NavCardItem[] = [
  { href: '/', icon: '🏠', label: 'Ana Sayfa', description: 'Genel bakış' },
  { href: '/stable', icon: '🐴', label: 'Ahırım', description: 'Atlarını yönet' },
  { href: '/market', icon: '🛒', label: 'At Pazarı', description: 'Al & sat' },
  { href: '/races', icon: '🏁', label: 'Yarışlar', description: 'Takvim & pratik yarış' },
  // "AT SEVDALISI — Master Development Brief" §22 "PHASE 12 — REPLAY" (bu
  // turda EKLENDİ) — `docs/AUDIT_REPORT.md`'nin "Replay (bağımsız gözatma)"
  // bulgusunu kapatan `/replays` kütüphane ekranına giden ana navigasyon
  // girişi (bkz. `apps/web/src/app/replays/page.tsx` doc yorumu).
  { href: '/replays', icon: '🎬', label: 'Yarış Tekrarları', description: 'Geçmiş yarışları izle' },
  { href: '/training', icon: '🏋️', label: 'Antrenman', description: 'Statları geliştir' },
  { href: '/care', icon: '🩺', label: 'Bakım', description: 'Sağlık & besleme' },
  { href: '/farm', icon: '🌾', label: 'Çiftlik', description: 'Üretim & kaynaklar' },
  { href: '/online', icon: '🌐', label: 'Online', description: 'PvP eşleşmeler' },
  { href: '/leaderboard', icon: '🏆', label: 'Sıralama', description: 'Küresel sıralama' },
  { href: '/club', icon: '🎽', label: 'Kulüp', description: 'Takımına katıl' },
];

export default function DashboardPage(): React.ReactElement {
  const { player, isLoading, error, createPlayer } = usePlayer();

  return (
    <main>
      <Hero />

      <div className="page-container" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
        <NavCardGrid />

        {!player && !isLoading ? (
          <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
              Henüz giriş yapmış bir seyis/jokey hesabın yok.
            </p>
            <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle()}>
              Başlangıç Paketiyle Oyuncu Oluştur
            </button>
            {error ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{error}</p> : null}
          </GlassPanel>
        ) : null}

        {player ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 'var(--space-lg)',
            }}
            className="dashboard-grid"
          >
            <div style={{ display: 'grid', gap: 'var(--space-lg)', alignContent: 'start' }}>
              <PlayerCard displayName={player.displayName} level={player.level} xp={player.xp} money={player.money} gems={player.gems} />
              <StableSummaryCard ownerId={player.id} />
            </div>
            <RecentRacesPanel playerId={player.id} />
          </div>
        ) : null}
      </div>

      <style>{`
        @media (min-width: 900px) {
          .dashboard-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) !important;
          }
        }
      `}</style>
    </main>
  );
}

function Hero(): React.ReactElement {
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '64px var(--space-md) 96px',
        background:
          'radial-gradient(120% 100% at 50% 0%, rgba(227, 179, 65, 0.16) 0%, transparent 55%), linear-gradient(180deg, #16233c 0%, var(--color-bg-base) 75%)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <TrackHorizon />
      <div style={{ position: 'relative', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            fontSize: '11px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-gold)',
            border: '1px solid var(--color-accent-gold)',
            borderRadius: '999px',
            padding: '4px 14px',
            marginBottom: 'var(--space-md)',
          }}
        >
          Hipodrom Yönetim Simülasyonu
        </div>
        <h1
          style={{
            margin: '0 0 12px 0',
            fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            color: 'var(--color-text-primary)',
          }}
        >
          AT SEVDALISI
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '16px', lineHeight: 1.6, margin: 0 }}>
          Kendi ahırını kur, şampiyon kan hattını yetiştir, hipodromda zaferi yaşa.
        </p>
      </div>
    </section>
  );
}

/** Özgün, at/hipodrom fotoğrafı YERİNE geçen soyut bir pist-ufku kompozisyonu (yalnızca SVG şekiller + tema renkleri). */
function TrackHorizon(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 300"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.55 }}
    >
      <ellipse cx="600" cy="320" rx="560" ry="120" fill="none" stroke="var(--color-accent-gold)" strokeWidth="2" opacity="0.35" />
      <ellipse cx="600" cy="320" rx="420" ry="80" fill="none" stroke="var(--color-accent-gold)" strokeWidth="1.5" opacity="0.25" />
      <circle cx="600" cy="70" r="46" fill="var(--color-accent-gold)" opacity="0.18" />
    </svg>
  );
}

function NavCardGrid(): React.ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 'var(--space-sm)',
        marginTop: '-56px',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
          <GlassPanel
            style={{
              padding: 'var(--space-md)',
              display: 'grid',
              gap: '6px',
              justifyItems: 'center',
              textAlign: 'center',
              transition: 'transform 0.15s ease, border-color 0.15s ease',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '26px' }} aria-hidden="true">
              {item.icon}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.label}</span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{item.description}</span>
          </GlassPanel>
        </Link>
      ))}
    </div>
  );
}

function PlayerCard({
  displayName,
  level,
  xp,
  money,
  gems,
}: {
  displayName: string;
  level: number;
  xp: number;
  money: number;
  gems: number;
}): React.ReactElement {
  return (
    <GlassPanel>
      <SectionLabel>Oyuncu</SectionLabel>
      <p style={{ margin: '4px 0 12px 0', fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
        {displayName}
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
        <StatLine label="Seviye" value={level} />
        <StatLine label="XP" value={xp.toLocaleString('tr-TR')} />
        <StatLine label="Bakiye" value={`${money.toLocaleString('tr-TR')} ₺`} accent="gold" />
        <StatLine label="Elmas" value={gems.toLocaleString('tr-TR')} accent="gem" />
      </div>
    </GlassPanel>
  );
}

function StableSummaryCard({ ownerId }: { ownerId: string }): React.ReactElement {
  const [summary, setSummary] = useState<StableSummaryView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>Ahır Özeti</SectionLabel>
        <Link href="/stable" style={{ fontSize: '12px', color: 'var(--color-accent-focus)' }}>
          Ahırıma git →
        </Link>
      </div>
      {error ? (
        <p style={{ color: 'var(--color-status-critical)', fontSize: '13px' }}>{error}</p>
      ) : !summary ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Yükleniyor…</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-lg)', margin: '8px 0 16px 0', flexWrap: 'wrap' }}>
            <StatLine label="Ahır Seviyesi" value={summary.stableLevel} />
            <StatLine label="Kapasite" value={`${summary.horseCount} / ${summary.capacity}`} />
          </div>
          <StatBar label="Ortalama Kondisyon" value={summary.averageCondition} />
          {summary.healthWarnings.length > 0 ? (
            <div style={{ marginTop: 'var(--space-sm)', display: 'grid', gap: '4px' }}>
              {summary.healthWarnings.map((warning) => (
                <span key={warning} style={{ fontSize: '12px', color: 'var(--color-status-warning)' }}>
                  ⚠ {warning}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </GlassPanel>
  );
}

function RecentRacesPanel({ playerId }: { playerId: string }): React.ReactElement {
  const [races, setRaces] = useState<RecentRaceResultView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRaces(null);
    setError(null);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>Son Yarış Sonuçları</SectionLabel>
        {/* §22 Replay — bkz. `apps/web/src/app/replays/page.tsx` doc yorumu.
            `StableSummaryCard`'daki "Ahırıma git →" kalıbıyla TUTARLI. */}
        <Link href="/replays" style={{ fontSize: '12px', color: 'var(--color-accent-focus)' }}>
          Tüm yarış geçmişini gör →
        </Link>
      </div>
      {error ? (
        <p style={{ color: 'var(--color-status-critical)', fontSize: '13px' }}>{error}</p>
      ) : races === null ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Yükleniyor…</p>
      ) : races.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
          Henüz bir yarış koşmadın. <Link href="/stable" style={{ color: 'var(--color-accent-focus)' }}>Ahırından bir atınla pratik yarışa çık.</Link>
        </p>
      ) : (
        <ol style={{ listStyle: 'none', margin: '8px 0 0 0', padding: 0, display: 'grid', gap: '10px' }}>
          {races.map((race) => (
            // §22 Replay — bu turda `<li>` içeriği `/replays/[raceId]`'e
            // bağlayan bir `Link`'e SARILDI (bkz. `replay-adapter.ts`/
            // `app/replays/[raceId]/page.tsx` doc yorumları). `race.raceId`
            // ZATEN var olan bir alan (`RecentRaceResultView`), yeni bir
            // kimlik İCAT EDİLMEDİ.
            <li key={race.raceId}>
              <Link href={`/replays/${race.raceId}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: race.finishPosition === 1 ? 'rgba(227, 179, 65, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    border: race.finishPosition === 1 ? '1px solid var(--color-accent-gold)' : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                      {race.horseName}
                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> · {race.raceName}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {race.distanceMeters}m · {surfaceLabel(race.surface)} · {formatRelativeDate(race.finishedAt)}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: race.finishPosition === 1 ? 'var(--color-accent-gold)' : 'var(--color-text-secondary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {race.finishPosition}.
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </GlassPanel>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-muted)',
      }}
    >
      {children}
    </div>
  );
}

function StatLine({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: 'gold' | 'gem';
}): React.ReactElement {
  const color = accent === 'gold' ? 'var(--color-accent-gold)' : accent === 'gem' ? 'var(--color-accent-gem)' : 'var(--color-text-primary)';
  return (
    <div style={{ display: 'grid', gap: '2px' }}>
      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: '15px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
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

function primaryButtonStyle(): React.CSSProperties {
  return {
    // AUDIT_REPORT.md F1: minHeight eklendi - 44px dokunma hedefi kuralini garanti eder.
    minHeight: '44px',
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
