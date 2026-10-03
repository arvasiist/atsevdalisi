'use client';

/** AT ARAMASI (02.10.2026, Faz 10) — moderatör + yönetici. Kimlik, sahip kimliği, at adı ya da sahip kullanıcı adı. */

import { useState } from 'react';
import type { AdminHorseView } from '@at-sevdalisi/shared-types';
import { loadModerationConfig } from '@at-sevdalisi/game-config';
import { apiClient } from '../../lib/api-client';

const LIMITS = loadModerationConfig().horseSearch;

export function HorsesAdmin(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminHorseView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    try {
      setRows(await apiClient.searchAdminHorses(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arama yapılamadı.');
    }
  };

  return (
    <div data-testid="horses-admin">
      <form className="club-chat-form" onSubmit={(event) => void search(event)}>
        <input
          aria-label="At ara"
          placeholder="At adı, at kimliği, sahip kimliği ya da kullanıcı adı"
          value={query}
          maxLength={LIMITS.queryMaxLength}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="moderation-primary" disabled={query.trim() === ''}>
          Ara
        </button>
      </form>
      {error ? <p className="moderation-error">{error}</p> : null}
      {rows !== null && rows.length === 0 ? <p className="session-meta">Sonuç yok.</p> : null}
      <ul className="session-list">
        {(rows ?? []).map((horse) => (
          <li key={horse.id} className="session-row">
            <div>
              <strong>{horse.name}</strong> <span className="market-badge">{horse.status}</span>
              <p className="session-meta">
                Sahip: {horse.owner ? horse.owner.username : '—'} · Sv. {horse.level} · Sağlık {Math.round(horse.health)} ·
                Kondisyon {Math.round(horse.fitness)} · Enerji {Math.round(horse.energy)}
              </p>
              <p className="session-meta">{horse.id}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
