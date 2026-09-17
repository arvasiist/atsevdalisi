'use client';

/**
 * Gerçek bir kimlik doğrulama sistemi (Google/Apple Sign-In, brief §41/§50)
 * HENÜZ BAĞLI DEĞİL (bkz. `player.controller.ts` doc yorumu) — `POST
 * /players` doğrudan, token'sız bir kayıt uç noktasıdır. Eski `page.tsx`
 * bu yüzden oyuncu kimliğini yalnızca React state'inde tutuyordu: sayfa
 * yenilendiğinde veya `/market`'e geçildiğinde kimlik TAMAMEN kayboluyordu
 * ve her sayfa kendi ayrı "oyuncu oluştur" akışını tekrarlıyordu.
 *
 * Bu, gerçek bir auth sistemi İCAT ETMEDEN (kapsam dışı, bkz. yukarıdaki
 * not) sayfalar arası GERÇEK bir oyuncu kimliğini (zaten var olan `POST
 * /players` ile oluşturulmuş gerçek bir kayıt) hatırlamanın minimal
 * köprüsüdür: `playerId` `localStorage`'da saklanır, tek bir React
 * Context ile TÜM sayfalar (Ana Sayfa, Ahırım, At Pazarı, ...) AYNI
 * oyuncu durumunu paylaşır (her biri kendi ayrı `fetch`/state kopyasını
 * TUTMAZ).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PlayerSummary } from '@at-sevdalisi/shared-types';
import { apiClient } from './api-client';

const STORAGE_KEY = 'atSevdalisi.playerId';
const RANDOM_ID_MULTIPLIER = 10000;

export interface PlayerContextValue {
  player: PlayerSummary | null;
  isLoading: boolean;
  error: string | null;
  createPlayer: () => Promise<void>;
  refresh: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedId = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!storedId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    void apiClient
      .getPlayer(storedId)
      .then((existing) => {
        if (!cancelled) {
          setPlayer(existing);
        }
      })
      .catch(() => {
        // Kayıtlı id artık geçersiz (ör. backend verisi sıfırlanmış) —
        // sessizce temizle, "oyuncu oluştur" akışı yeniden gösterilecek.
        window.localStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createPlayer = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const randomSuffix = Math.floor(Math.random() * RANDOM_ID_MULTIPLIER);
      const newPlayer = await apiClient.registerPlayer(`jokey_${randomSuffix}`, 'Harbi Seyis');
      window.localStorage.setItem(STORAGE_KEY, newPlayer.id);
      setPlayer(newPlayer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oyuncu oluşturulamadı');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setPlayer((current) => {
      if (current) {
        void apiClient.getPlayer(current.id).then(setPlayer).catch(() => undefined);
      }
      return current;
    });
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({ player, isLoading, error, createPlayer, refresh }),
    [player, isLoading, error, createPlayer, refresh],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (context === null) {
    throw new Error('usePlayer() yalnızca <PlayerProvider> içinde kullanılabilir (bkz. app/layout.tsx).');
  }
  return context;
}
