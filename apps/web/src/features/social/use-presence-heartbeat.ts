'use client';

import { useEffect } from 'react';
import { apiClient } from '../../lib/api-client';
import { PRESENCE_HEARTBEAT_MS } from './presence';

/**
 * 16.10.2026 — çevrimiçi nabzı: oturum varken ve sekme GÖRÜNÜRKEN config
 * aralığıyla (`social.presence.heartbeatSeconds`) gönderilir; sekmeye dönünce
 * hemen bir kez. Hata sessizdir (durum bir sonraki nabızda düzelir).
 */
export function usePresenceHeartbeat(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    const beat = (): void => {
      if (document.visibilityState === 'hidden') return;
      void apiClient.sendPresenceHeartbeat().catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active]);
}
