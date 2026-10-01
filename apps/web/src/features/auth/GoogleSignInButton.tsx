'use client';

/**
 * GOOGLE İLE GİRİŞ / BAĞLAMA DÜĞMESİ (01.10.2026).
 *
 * Google Identity Services (GIS) betiği yalnızca bu düğme ekrana geldiğinde
 * yüklenir ve düğmeyi Google'ın KENDİSİ çizer (marka kuralları gereği).
 * Google, kullanıcı hesabını seçince bir kimlik belgesi (`credential`, JWT)
 * verir; bu bileşen onu yalnızca `onCredential`a iletir. Belgeyi DOĞRULAYAN
 * sunucudur (`GoogleAppleIdentityProvider`) — istemci otorite değildir.
 *
 * `clientId` sunucudan gelir (`GET /auth/providers`); sunucuda kimlik bilgisi
 * yoksa ekran bu bileşeni hiç render etmez.
 */

import { useEffect, useRef, useState } from 'react';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const BUTTON_WIDTH_PX = 320;

interface GoogleCredentialResponse {
  credential?: string;
}

/** GIS'in burada kullanılan küçük alt kümesi. */
export interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

let scriptPromise: Promise<GoogleIdentityApi> | null = null;

/** GIS betiğini TEK KEZ yükler; zaten yüklüyse hemen döner. Hata olursa sonraki çağrı yeniden dener. */
export function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }
  if (scriptPromise === null) {
    scriptPromise = new Promise<GoogleIdentityApi>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (window.google?.accounts?.id) {
          resolve(window.google);
        } else {
          reject(new Error('Google girişi yüklenemedi.'));
        }
      };
      script.onerror = () => reject(new Error('Google girişi yüklenemedi.'));
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      scriptPromise = null;
      throw error;
    });
  }
  return scriptPromise;
}

export interface GoogleSignInButtonProps {
  clientId: string;
  /** `signin_with` = "Google ile oturum aç", `continue_with` = "Google ile devam et". */
  text: 'signin_with' | 'continue_with';
  onCredential: (idToken: string) => void;
}

export function GoogleSignInButton({ clientId, text, onCredential }: GoogleSignInButtonProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || containerRef.current === null) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (typeof response.credential === 'string' && response.credential !== '') {
              onCredentialRef.current(response.credential);
            }
          },
        });
        google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'rectangular',
          text,
          locale: 'tr',
          width: BUTTON_WIDTH_PX,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Google girişi yüklenemedi.');
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  return (
    <div>
      <div ref={containerRef} data-testid="google-signin-button" style={{ minHeight: '44px' }} />
      {loadError !== null ? (
        <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--color-status-critical)' }}>{loadError}</p>
      ) : null}
    </div>
  );
}
