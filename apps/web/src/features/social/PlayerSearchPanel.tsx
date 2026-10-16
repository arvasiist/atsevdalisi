'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PlayerSearchResultView } from '@at-sevdalisi/shared-types';
import { ApiError, apiClient } from '../../lib/api-client';
import { NEEDS_SHARED_RACE_HINT, PLAYER_SEARCH_MIN_LENGTH, searchResultAction } from './presence';

const SEARCH_DEBOUNCE_MS = 350;

/**
 * 16.10.2026 — sosyal brief §3: oyuncu ID'si ya da kullanıcı adıyla arama.
 * Sonuç arayana göre ilişki taşır; "Arkadaş Ekle" isteği sunucuya gider ve
 * kapı (birlikte yarış / davet ilişkisi) orada uygulanır.
 */
export function PlayerSearchPanel({
  playerId,
  onRequestSent,
}: {
  playerId: string;
  onRequestSent: () => Promise<void> | void;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResultView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < PLAYER_SEARCH_MIN_LENGTH) {
      setResults(null);
      return undefined;
    }
    const ticket = ++latest.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      apiClient
        .searchPlayers(trimmed)
        .then((rows) => {
          if (ticket === latest.current) setResults(rows);
        })
        .catch((err: unknown) => {
          if (ticket === latest.current) setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Arama başarısız.' });
        })
        .finally(() => {
          if (ticket === latest.current) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const addFriend = async (target: PlayerSearchResultView): Promise<void> => {
    setBusyId(target.playerId);
    setMessage(null);
    try {
      await apiClient.sendFriendRequest(playerId, target.playerId);
      setResults((rows) => rows?.map((row) => (row.playerId === target.playerId ? { ...row, relation: 'outgoing' } : row)) ?? null);
      setMessage({ tone: 'ok', text: `${target.displayName} kişisine arkadaşlık isteği gönderildi.` });
      await onRequestSent();
    } catch (err) {
      const text =
        err instanceof ApiError && err.code === 'FRIENDSHIP_REQUIRES_SHARED_RACE'
          ? NEEDS_SHARED_RACE_HINT
          : err instanceof Error
            ? err.message
            : 'İstek gönderilemedi.';
      setMessage({ tone: 'error', text });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="social-search" data-testid="player-search">
      <label className="social-search-label" htmlFor="player-search-input">
        Oyuncu ara
      </label>
      <input
        id="player-search-input"
        className="social-search-input"
        type="search"
        autoComplete="off"
        placeholder={`Kullanıcı adı (en az ${PLAYER_SEARCH_MIN_LENGTH} harf) ya da oyuncu ID'si`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {message ? (
        <p className={message.tone === 'ok' ? 'friend-gift-notice' : 'friend-gift-error'} role="status">
          {message.text}
        </p>
      ) : null}
      {loading ? <p className="friend-gift-hint">Aranıyor…</p> : null}
      {results !== null && !loading && results.length === 0 ? (
        <p className="friend-gift-hint" data-testid="player-search-empty">
          Bu aramayla eşleşen oyuncu yok.
        </p>
      ) : null}
      {results !== null && results.length > 0 ? (
        <ul className="social-search-results">
          {results.map((row) => {
            const action = searchResultAction(row.relation);
            return (
              <li key={row.playerId} data-relation={row.relation}>
                <Link href={`/profile/${row.username}`} className="social-search-name">
                  <strong>{row.displayName}</strong>
                  <span>
                    @{row.username} · Sv. {row.level}
                  </span>
                </Link>
                {action.canRequest ? (
                  <button
                    type="button"
                    className="btn-gold"
                    disabled={busyId === row.playerId}
                    onClick={() => void addFriend(row)}
                  >
                    {busyId === row.playerId ? 'Gönderiliyor…' : action.label}
                  </button>
                ) : (
                  <span className="social-search-state">{action.label}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
