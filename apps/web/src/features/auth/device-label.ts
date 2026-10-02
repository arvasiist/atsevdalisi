/**
 * Oturum listesinde cihaz etiketi (02.10.2026) — kullanıcı aracısı
 * metninden kaba "Tarayıcı · Sistem". Yalnızca görüntü içindir; güvenlik
 * kararı DEĞİLDİR (kullanıcı aracısı istemcinin beyanıdır).
 */
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iOS/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

export function deviceLabel(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim() === '') return 'Bilinmeyen cihaz';
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser === undefined && system === undefined) return userAgent.slice(0, 40);
  return [browser, system].filter((part) => part !== undefined).join(' · ');
}
