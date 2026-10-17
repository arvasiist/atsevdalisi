'use client';

/**
 * HİPODROMLAR (16.10.2026, brief §9). Pistler ülkeye göre: şehir, seviye,
 * prestij, zemin, mesafe, ağırlanan masalar (bedel + at sayısı + kazanan payı)
 * ve pist takvimi (sıradaki saatler SUNUCUDAN). Açık yarışlar lobi listesinin
 * GERÇEK satırlarıdır; katılım ve atın uygunluğu `/races` ekranında, kural
 * sunucuda. Gerçek tesis adı/görseli kullanılmaz (kullanım hakkı doğrulanmadı).
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { HippodromeCatalogView, HippodromeView, RaceLobbyListItem, RaceSurface } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import {
  HIPPODROME_LEVEL_LABELS,
  countryFlag,
  describeCadence,
  groupHippodromesByCountry,
  openRacesAt,
  prestigeStars,
} from '../../features/hippodromes/hippodrome-catalog';
import { SURFACE_LABELS, formatStartsIn } from '../../features/race-lobby/lobby-logic';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

const surfaceText = (surfaces: readonly string[]): string =>
  surfaces.map((surface) => SURFACE_LABELS[surface as RaceSurface] ?? surface).join(' · ');

function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function HippodromeCard({
  hippodrome,
  races,
  now,
}: {
  hippodrome: HippodromeView;
  races: readonly RaceLobbyListItem[];
  now: Date;
}): React.ReactElement {
  const open = openRacesAt(races, hippodrome.key, now);
  return (
    <GlassPanel>
      <article className="hippodrome-card" data-testid={`hippodrome-${hippodrome.key}`}>
        <header className="hippodrome-card-head">
          <div>
            <h3 style={{ margin: 0 }}>{hippodrome.name}</h3>
            <p className="session-meta" style={{ margin: 0 }}>
              {hippodrome.city} · {HIPPODROME_LEVEL_LABELS[hippodrome.level]} · {hippodrome.lapLengthMeters} m tur
            </p>
          </div>
          <span className="hippodrome-prestige" aria-label={`Prestij ${hippodrome.prestige}/5`}>
            {prestigeStars(hippodrome.prestige)}
          </span>
        </header>
        <dl className="hippodrome-facts">
          <dt>Zemin</dt>
          <dd>{surfaceText(hippodrome.surfaces)}</dd>
          <dt>Mesafeler</dt>
          <dd>{hippodrome.distancesMeters.map((distance) => `${distance} m`).join(' · ')}</dd>
          <dt>Masalar</dt>
          <dd>
            {hippodrome.tables
              .map(
                (table) =>
                  `${table.label} (${table.fieldSize} at, ${formatCurrency('money', table.entryFee)}, kazanan %${table.winnerSharePercent})`,
              )
              .join(' · ')}
          </dd>
        </dl>
        {hippodrome.programs.length > 0 ? (
          <div>
            <h4 className="hippodrome-subtitle">Takvim</h4>
            <ul className="hippodrome-programs">
              {hippodrome.programs.map((program) => (
                <li key={program.id}>
                  <strong>
                    {program.featured ? '⭐ ' : ''}
                    {program.name}
                  </strong>{' '}
                  <span className="session-meta">
                    {program.distanceMeters} m {SURFACE_LABELS[program.surface as RaceSurface] ?? program.surface} ·{' '}
                    {program.entryFee > 0 ? formatCurrency('money', program.entryFee) : 'Ücretsiz'} · {program.fieldSize} at ·{' '}
                    {describeCadence(program.intervalMinutes)}
                  </span>
                  <span className="session-meta" style={{ display: 'block' }}>
                    Sıradaki: {program.nextStartTimes.map(formatSlot).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <h4 className="hippodrome-subtitle">Açık yarışlar</h4>
          {open.length === 0 ? (
            <p className="session-meta" style={{ margin: 0 }}>
              Şu an bu pistte katılıma açık yarış yok — takvimdeki sıradaki yarış saatinden önce açılır.
            </p>
          ) : (
            <ul className="hippodrome-programs">
              {open.slice(0, 4).map((race) => (
                <li key={race.id}>
                  <strong>{race.name}</strong>{' '}
                  <span className="session-meta">
                    {formatStartsIn(race.startTime, now)} · {race.distanceMeters} m · {race.joinedPlayers}/{race.maxPlayers} oyuncu
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/races" className="stable-chip" style={{ marginTop: 'var(--space-xs)', display: 'inline-block' }}>
            Yarışlara git
          </Link>
        </div>
      </article>
    </GlassPanel>
  );
}

export default function HippodromesPage(): React.ReactElement {
  const { player, isLoading, createPlayer } = usePlayer();
  const [catalog, setCatalog] = useState<HippodromeCatalogView | null>(null);
  const [races, setRaces] = useState<RaceLobbyListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const [nextCatalog, lobby] = await Promise.all([apiClient.getHippodromes(), apiClient.listLobbyRaces()]);
      setCatalog(nextCatalog);
      setRaces(lobby);
      setNow(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hipodromlar yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    if (player) void load();
  }, [player, load]);

  if (!player) {
    return (
      <main className="page-container">
        <h1 className="page-title">Hipodromlar</h1>
        {isLoading ? null : (
          <GlassPanel>
            <p>Hipodromları görmek için önce bir oyuncu oluştur.</p>
            <button type="button" className="moderation-primary" onClick={() => void createPlayer()}>
              Oyuncu oluştur
            </button>
          </GlassPanel>
        )}
      </main>
    );
  }

  return (
    <main className="page-container" data-testid="hippodromes-page">
      <h1 className="page-title">Hipodromlar</h1>
      <p className="session-meta">
        Yerelden uluslararasına pistler. Her pistin kendi zemini, mesafeleri ve ağırladığı masaları vardır; yarış açarken
        bu kurallar sunucuda denetlenir.
      </p>
      {error ? (
        <p className="moderation-error">
          {error}{' '}
          <button type="button" className="stable-chip" onClick={() => void load()}>
            Tekrar dene
          </button>
        </p>
      ) : null}
      {catalog === null ? (
        error ? null : <p className="session-meta">Yükleniyor…</p>
      ) : (
        groupHippodromesByCountry(catalog.hippodromes).map((group) => (
          <section key={group.countryCode} className="hippodrome-country">
            <h2 className="hippodrome-country-title">
              <span aria-hidden="true">{countryFlag(group.countryCode)}</span> {group.country}
            </h2>
            <div className="hippodrome-grid">
              {group.hippodromes.map((hippodrome) => (
                <HippodromeCard key={hippodrome.key} hippodrome={hippodrome} races={races} now={now} />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
