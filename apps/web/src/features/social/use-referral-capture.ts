'use client';

import { useEffect } from 'react';
import { ApiError, apiClient } from '../../lib/api-client';
import { REFERRAL_STORAGE_KEY, referralCodeFromSearch } from './referral';

/**
 * 16.10.2026 — davet bağlantısı (`/?ref=KOD`) her sayfada yakalanır ve
 * saklanır; oturum açılınca BİR KEZ sunucuya bağlanır. Kesin yanıtta (başarı
 * ya da 4xx: bağlı, pencere kapalı, geçersiz) saklanan kod silinir; ağ
 * hatasında bir sonraki açılışta yeniden denenir. Kural sunucudadır.
 */
export function useReferralCapture(playerId: string | null): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const fromUrl = referralCodeFromSearch(window.location.search);
      if (fromUrl !== null) window.localStorage.setItem(REFERRAL_STORAGE_KEY, fromUrl);
    } catch {
      // Depolama kapalıysa yakalama yapılmaz; kod /invite ekranından elle girilebilir.
    }
  }, []);

  useEffect(() => {
    if (playerId === null || typeof window === 'undefined') return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    } catch {
      return;
    }
    if (stored === null) return;
    const code = stored;
    apiClient
      .attachReferral(code)
      .then(() => window.localStorage.removeItem(REFERRAL_STORAGE_KEY))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
        }
      });
  }, [playerId]);
}
