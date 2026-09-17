'use client';

/**
 * AUDIT_REPORT.md Bulgu S1-S4 hardening SONRASI güncellendi. `POST
 * /players` artık token'sız değil — bir `AuthSession` (`{ token, player }`)
 * döner ve backend'deki HER korumalı rota (`@Public()` işaretli olmayan
 * hepsi) geçerli bir `Authorization: Bearer <token>` header'ı zorunlu
 * kılar (bkz. `api-client.ts` `setAuthToken` doc yorumu). Eski sürüm
 * yalnızca `playerId`'yi saklıyordu — bu, hardening sonrası kırıldı
 * (token hiç saklanmadığı/gönderilmediği için `getPlayer`/
 * `getHorsesByOwner` gibi her korumalı çağrı 401 dönüyordu, TÜM ekranlar
 * bozulmuştu). Şimdi hem `playerId` hem `token` `localStorage`'da
 * saklanır, sayfa yüklendiğinde `apiClient.setAuthToken` HEMEN (ilk
 * korumalı istekten ÖNCE) çağrılır. Token geçersizleşirse (ör. backend
 * verisi sıfırlanmış, JWT süresi dolmuş) `getPlayer` 401/403 ile
 * patlar — bu durumda ikisi de temizlenir, "oyuncu oluştur" akışı
 * yeniden gösterilir.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PlayerSummary } from '@at-sevdalisi/shared-types';
import { apiClient, setAuthToken } from './api-client';

const STORAGE_KEY = 'atSevdalisi.playerId';
const TOKEN_STORAGE_KEY = 'atSevdalisi.authToken';
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
    const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (!storedId || !storedToken) {
      // Faz 2'den (token'sız) kalan yarım bir kayıt olabilir — ikisi de
      // yoksa temiz bir "oyuncu oluştur" durumuna dön.
      setIsLoading(false);
      return;
    }

    setAuthToken(storedToken);

    let cancelled = false;
    void apiClient
      .getPlayer(storedId)
      .then((existing) => {
        if (!cancelled) {
          setPlayer(existing);
        }
      })
      .catch(() => {
        // Kayıtlı id/token artık geçersiz (ör. backend verisi sıfırlanmış,
        // JWT süresi dolmuş) — sessizce temizle, "oyuncu oluştur" akışı
        // yeniden gösterilecek.
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setAuthToken(null);
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
      const session = await apiClient.registerPlayer(`jokey_${randomSuffix}`, 'Harbi Seyis');
      setAuthToken(session.token);
      window.localStorage.setItem(STORAGE_KEY, session.player.id);
      window.localStorage.setItem(TOKEN_STORAGE_KEY, session.token);
      setPlayer(session.player);
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
