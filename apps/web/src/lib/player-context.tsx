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
 * korumalı istekten ÖNCE) çağrılır.
 *
 * OTURUM (02.10.2026, migration 0057): erişim token'ı kısa ömürlüdür;
 * refresh token da saklanır ve `setSessionRefresher` ile api istemcisine
 * verilir (401 → bir kez yenile + tekrar dene; bitişten önce proaktif
 * yenileme). Refresh token'ı olmayan ESKİ oturum açılışta yükseltilir.
 * Sekmeler arası yarış `navigator.locks` + "depodaki taze token'ı benimse"
 * ile önlenir (aynı refresh token iki kez kullanılırsa sunucu oturumu kapatır).
 *
 * ⚠️ Oturum YALNIZCA 401'de silinir (`isUnauthorized`). Eskiden HER hata
 * (ağ kopması dahil) token'ı siliyordu ve misafir hesabını kalıcı olarak
 * kaybettiriyordu. Aynı gerekçeyle `createPlayer` depoda çözülmemiş bir
 * oturum varken yeni hesap açıp onu EZMEZ.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthSession, PlayerSummary, SessionTokens } from '@at-sevdalisi/shared-types';
import { apiClient, getAuthToken, refreshSessionOnce, setAuthToken, setSessionRefresher } from './api-client';
import { SESSION_STORAGE_KEYS, adoptableStoredToken, isUnauthorized, refreshDelayMs } from './session-logic';

const RANDOM_ID_MULTIPLIER = 10000;
const REFRESH_LOCK_NAME = 'atSevdalisi.sessionRefresh';
const OFFLINE_MESSAGE = 'Sunucuya ulaşılamadı. Kayıtlı oturumun korunuyor — biraz sonra tekrar dene.';

export interface PlayerContextValue {
  player: PlayerSummary | null;
  isLoading: boolean;
  error: string | null;
  createPlayer: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * 30.09.2026 — e-posta + şifre ile giriş. Başarılıysa oturum bu
   * tarayıcıya yazılır ve oyuncu yüklenir; hata FIRLATILIR (form gösterir).
   */
  loginWithPassword: (email: string, password: string) => Promise<void>;
  /** Google ile giriş (01.10.2026) — ilk girişte yeni oyuncu açılır. */
  loginWithGoogle: (idToken: string) => Promise<void>;
  /**
   * Bu cihazdan çıkış (02.10.2026): sunucuda oturum kapatılır (token ANINDA
   * geçersiz), sonra tarayıcıdan silinir. Sunucuya ulaşılamasa da yerel
   * oturum silinir. Kayıtlı hesap tekrar giriş yapılarak geri alınır,
   * MİSAFİR hesap geri alınamaz — ekran bu yüzden misafire önce kaydetmeyi söyler.
   */
  logout: () => Promise<void>;
  /** Tüm cihazlardan çıkış — hata FIRLATILIR (sunucu onaylamadan "çıkıldı" denmez). */
  logoutAll: () => Promise<void>;
  /** Hesap sunucuda silindikten SONRA yerel oturumu siler (sunucuya istek atmaz). */
  forgetSession: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function readStorage(key: string): string | null {
  return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
}

function clearStoredSession(): void {
  for (const key of Object.values(SESSION_STORAGE_KEYS)) {
    window.localStorage.removeItem(key);
  }
  setAuthToken(null);
}

/**
 * Eski oturumun yükseltmesi TEK uçuşludur: React StrictMode (geliştirme)
 * açılış efektini iki kez koşturur ve her biri ayrı bir oturum açardı
 * (yaşandı: tarayıcı denemesinde fazladan bir cihaz satırı göründü).
 */
let legacyUpgrade: Promise<SessionTokens> | null = null;

function upgradeLegacyOnce(): Promise<SessionTokens> {
  if (legacyUpgrade === null) {
    legacyUpgrade = apiClient
      .upgradeSession()
      .then((tokens) => {
        // Bileşen ömründen bağımsız olarak depoya yazılır — iptal edilen
        // efektin aldığı token kaybolursa açılan oturum yetim kalırdı.
        persistTokens(tokens);
        return tokens;
      })
      .finally(() => {
        legacyUpgrade = null;
      });
  }
  return legacyUpgrade;
}

function persistTokens(tokens: SessionTokens): void {
  setAuthToken(tokens.token);
  window.localStorage.setItem(SESSION_STORAGE_KEYS.accessToken, tokens.token);
  window.localStorage.setItem(SESSION_STORAGE_KEYS.refreshToken, tokens.refreshToken);
  window.localStorage.setItem(SESSION_STORAGE_KEYS.accessExpiresAt, tokens.accessTokenExpiresAt);
}

export function PlayerProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const mounted = useRef(true);

  const applyTokens = useCallback((tokens: SessionTokens) => {
    persistTokens(tokens);
    setAccessExpiresAt(tokens.accessTokenExpiresAt);
  }, []);

  const dropSession = useCallback(() => {
    clearStoredSession();
    setAccessExpiresAt(null);
    setPlayer(null);
  }, []);

  // api istemcisinin 401 yenileyicisi — tek tanım, sekmeler arası kilitli.
  useEffect(() => {
    mounted.current = true;
    const run = async (): Promise<string | null> => {
      const adopted = adoptableStoredToken(
        {
          token: readStorage(SESSION_STORAGE_KEYS.accessToken),
          expiresAt: readStorage(SESSION_STORAGE_KEYS.accessExpiresAt),
        },
        getAuthToken(),
        Date.now(),
      );
      if (adopted !== null) {
        setAuthToken(adopted);
        if (mounted.current) setAccessExpiresAt(readStorage(SESSION_STORAGE_KEYS.accessExpiresAt));
        return adopted;
      }
      const refreshToken = readStorage(SESSION_STORAGE_KEYS.refreshToken);
      if (refreshToken === null) return null;
      try {
        const tokens = await apiClient.refreshSession(refreshToken);
        persistTokens(tokens);
        if (mounted.current) setAccessExpiresAt(tokens.accessTokenExpiresAt);
        return tokens.token;
      } catch (err) {
        if (isUnauthorized(err) && mounted.current) dropSession();
        return null;
      }
    };
    setSessionRefresher(async (): Promise<string | null> => {
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (!locks) return run();
      return (await locks.request(REFRESH_LOCK_NAME, run)) as string | null;
    });
    return () => {
      mounted.current = false;
      setSessionRefresher(null);
    };
  }, [dropSession]);

  // Proaktif yenileme: soketler el sıkışmada token'ı okur, dolmuş token'la
  // bağlanmasınlar diye bitişten önce yenilenir.
  useEffect(() => {
    const delay = refreshDelayMs(accessExpiresAt, Date.now());
    if (delay === null || player === null) return undefined;
    const timer = window.setTimeout(() => void refreshSessionOnce(), delay);
    return () => window.clearTimeout(timer);
  }, [accessExpiresAt, player]);

  useEffect(() => {
    const storedId = readStorage(SESSION_STORAGE_KEYS.playerId);
    const storedToken = readStorage(SESSION_STORAGE_KEYS.accessToken);
    if (!storedId || !storedToken) {
      // Faz 2'den (token'sız) kalan yarım bir kayıt olabilir — ikisi de
      // yoksa temiz bir "oyuncu oluştur" durumuna dön.
      setIsLoading(false);
      return;
    }

    setAuthToken(storedToken);
    setAccessExpiresAt(readStorage(SESSION_STORAGE_KEYS.accessExpiresAt));

    let cancelled = false;
    void (async () => {
      try {
        if (readStorage(SESSION_STORAGE_KEYS.refreshToken) === null) {
          // Eski (02.10.2026 öncesi) oturum: yenilenebilir oturuma yükselt.
          // Ağ hatasında eski token'la devam edilir; yalnızca 401 siler.
          try {
            const tokens = await upgradeLegacyOnce();
            if (!cancelled) applyTokens(tokens);
          } catch (err) {
            if (isUnauthorized(err)) throw err;
          }
        }
        const existing = await apiClient.getPlayer(storedId);
        if (!cancelled) setPlayer(existing);
      } catch (err) {
        if (cancelled) return;
        if (isUnauthorized(err)) {
          // Oturum gerçekten geçersiz (kapatılmış, hesap yok) — temizle.
          dropSession();
        } else {
          setError(OFFLINE_MESSAGE);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyTokens, dropSession]);

  const applySession = useCallback(
    (session: AuthSession) => {
      applyTokens(session);
      window.localStorage.setItem(SESSION_STORAGE_KEYS.playerId, session.player.id);
      setError(null);
      setPlayer(session.player);
    },
    [applyTokens],
  );

  const createPlayer = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Depoda çözülmemiş bir oturum varsa (açılışta sunucuya ulaşılamadı)
      // önce onu dene — yeni hesap açmak onu EZER ve misafir hesabı kaybolur.
      const storedId = readStorage(SESSION_STORAGE_KEYS.playerId);
      if (storedId !== null && readStorage(SESSION_STORAGE_KEYS.accessToken) !== null) {
        try {
          setPlayer(await apiClient.getPlayer(storedId));
          return;
        } catch (err) {
          if (!isUnauthorized(err)) {
            setError(OFFLINE_MESSAGE);
            return;
          }
          dropSession();
        }
      }
      const randomSuffix = Math.floor(Math.random() * RANDOM_ID_MULTIPLIER);
      applySession(await apiClient.registerPlayer(`jokey_${randomSuffix}`, 'Harbi Seyis'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oyuncu oluşturulamadı');
    } finally {
      setIsLoading(false);
    }
  }, [applySession, dropSession]);

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      applySession(await apiClient.loginWithPassword(email, password));
    },
    [applySession],
  );

  // 01.10.2026 — Google ile giriş: `idToken` Google'ın tarayıcıda verdiği belgedir.
  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      applySession(await apiClient.loginWithGoogle(idToken));
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Sunucuya ulaşılamadı ya da oturum zaten kapalı — yerel oturum yine silinir.
    }
    dropSession();
  }, [dropSession]);

  const logoutAll = useCallback(async () => {
    await apiClient.logoutAll();
    dropSession();
  }, [dropSession]);

  const refresh = useCallback(async () => {
    setPlayer((current) => {
      if (current) {
        void apiClient.getPlayer(current.id).then(setPlayer).catch(() => undefined);
      }
      return current;
    });
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      player,
      isLoading,
      error,
      createPlayer,
      refresh,
      loginWithPassword,
      loginWithGoogle,
      logout,
      logoutAll,
      forgetSession: dropSession,
    }),
    [player, isLoading, error, createPlayer, refresh, loginWithPassword, loginWithGoogle, logout, logoutAll, dropSession],
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
