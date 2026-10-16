'use client';

/** SEZON + TURNUVA (02.10.2026, Faz 10) — salt okuma, yalnızca yönetici. Açılış/ödeme zamanlayıcılardadır. */

import { useEffect, useState } from 'react';
import type { AdminSeasonView, AdminTournamentView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';

const SEASON_STATE_LABELS: Record<AdminSeasonView['state'], string> = {
  upcoming: 'Yaklaşan',
  current: 'Sürüyor',
  ended: 'Bitti',
};

const when = (iso: string): string => new Date(iso).toLocaleString('tr-TR');

export function SeasonsAdmin(): React.ReactElement {
  const [seasons, setSeasons] = useState<AdminSeasonView[] | null>(null);
  const [tournaments, setTournaments] = useState<AdminTournamentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiClient.getAdminSeasons(), apiClient.getAdminTournaments()])
      .then(([s, t]) => {
        setSeasons(s);
        setTournaments(t);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Liste yüklenemedi.'));
  }, []);

  if (error) return <p className="moderation-error">{error}</p>;
  if (!seasons || !tournaments) return <p className="session-meta">Yükleniyor…</p>;
  return (
    <div data-testid="seasons-admin">
      <h3>Sezonlar</h3>
      <ul className="session-list">
        {seasons.map((season) => (
          <li key={season.id} className="session-row">
            <div>
              <strong>{season.name}</strong> <span className="market-badge">{SEASON_STATE_LABELS[season.state]}</span>
              <p className="session-meta">
                {when(season.startsAt)} → {when(season.endsAt)} ·{' '}
                {season.rewardsPaidAt ? `ödüller ödendi (${when(season.rewardsPaidAt)})` : 'ödül ödenmedi'}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <h3>Turnuvalar</h3>
      {tournaments.length === 0 ? <p className="session-meta">Turnuva yok.</p> : null}
      <ul className="session-list">
        {tournaments.map((tournament) => (
          <li key={tournament.id} className="session-row">
            <div>
              <strong>{tournament.raceName}</strong> <span className="market-badge">{tournament.tier}</span>{' '}
              <span className="market-badge">{tournament.raceStatus}</span>
              <p className="session-meta">
                {when(tournament.startTime)} · {tournament.participants} katılımcı · havuz{' '}
                {formatCurrency('money', tournament.prizePool)} · en az Sv. {tournament.minPlayerLevel}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
