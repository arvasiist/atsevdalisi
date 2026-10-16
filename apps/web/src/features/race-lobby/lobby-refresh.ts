import { useEffect, useRef } from 'react';

/**
 * 16.10.2026 — lobi listesinin kendiliğinden yenilenmesi. Eskiden liste
 * yalnızca açılışta ve "Yenile" ile okunuyordu: başkası katılınca sayı,
 * yarış kilitlenince durum ekranda bayat kalıyordu. Aralık config'ten
 * (`race-lobby.lobbyListRefreshSeconds`); 0 ya da geçersiz değer = kapalı.
 */
export function lobbyRefreshIntervalMs(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds * 1000);
}

/** Yenileme yalnızca sekme görünürken ve önceki istek bitmişken yapılır. */
export function shouldRunLobbyRefresh(visibility: DocumentVisibilityState | undefined, inFlight: boolean): boolean {
  return visibility !== 'hidden' && !inFlight;
}

/**
 * `refresh`i aralıkla çağırır; sekme gizliyken durur, görünür olunca hemen
 * bir kez yeniler. Aynı anda iki istek uçmaz.
 */
export function usePeriodicLobbyRefresh(refresh: () => Promise<void>, seconds: number): void {
  const inFlight = useRef(false);
  useEffect(() => {
    const intervalMs = lobbyRefreshIntervalMs(seconds);
    if (intervalMs === null || typeof document === 'undefined') return undefined;
    const run = (): void => {
      if (!shouldRunLobbyRefresh(document.visibilityState, inFlight.current)) return;
      inFlight.current = true;
      void refresh().finally(() => {
        inFlight.current = false;
      });
    };
    const timer = window.setInterval(run, intervalMs);
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, seconds]);
}
