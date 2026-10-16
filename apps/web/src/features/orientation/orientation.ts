/**
 * YATAY EKRAN (10.10.2026, sahibinin isteği: "mobilde ekran yatay olacak").
 *
 * Telefon dikeyken oyun `RotateDevicePrompt` katmanıyla yan çevirmeye çağırır
 * (görünürlüğü YALNIZCA CSS'tedir — `globals.css` → `.rotate-prompt`; ilk
 * boyamada titreme olmasın diye JS ölçümü beklenmez). Burada yalnızca
 * "tek tuşla yatay" denemesi var: tarayıcı yönü YALNIZCA tam ekranda
 * kilitleyebilir (Android Chrome). iPhone Safari öğeleri tam ekrana almaz ve
 * yön kilidi vermez — orada düğme gösterilmez, oyuncu telefonu kendisi çevirir.
 * Kurulu uygulama (PWA) yatay açılır: `pwa.ts` → `orientation: 'landscape'`.
 */

export interface OrientationLockEnv {
  fullscreenEnabled: boolean;
  requestFullscreen?: () => Promise<void>;
  lockLandscape?: () => Promise<void>;
}

export type LandscapeRequestResult = 'locked' | 'unsupported' | 'failed';

/** Tarayıcı ortamını okur (sunucuda her şey kapalı). */
export function readOrientationEnv(): OrientationLockEnv {
  if (typeof document === 'undefined' || typeof screen === 'undefined') {
    return { fullscreenEnabled: false };
  }
  const root = document.documentElement;
  // `lock` bazı DOM tip sürümlerinde yok; çalışma anında var mı diye bakılır.
  const orientation = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
  return {
    fullscreenEnabled: document.fullscreenEnabled === true,
    requestFullscreen:
      typeof root.requestFullscreen === 'function' ? () => root.requestFullscreen({ navigationUI: 'hide' }) : undefined,
    lockLandscape:
      orientation && typeof orientation.lock === 'function' ? () => orientation.lock!('landscape') : undefined,
  };
}

/** "Tam ekran + yatay" düğmesi yalnızca ikisi de destekleniyorsa gösterilir. */
export function canRequestLandscape(env: OrientationLockEnv): boolean {
  return env.fullscreenEnabled && env.requestFullscreen !== undefined && env.lockLandscape !== undefined;
}

/**
 * Tam ekrana geçip yönü yataya kilitler. Kilit reddedilirse (cihaz/tarayıcı
 * izin vermedi) tam ekran açık kalabilir — oyuncu telefonu elle çevirir.
 */
export async function requestLandscape(env: OrientationLockEnv): Promise<LandscapeRequestResult> {
  if (!canRequestLandscape(env)) return 'unsupported';
  try {
    await env.requestFullscreen!();
    await env.lockLandscape!();
    return 'locked';
  } catch {
    return 'failed';
  }
}
