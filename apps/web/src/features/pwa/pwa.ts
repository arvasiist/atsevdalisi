import type { MetadataRoute } from 'next';

/**
 * PWA (02.10.2026). İkonlar DOSYA DEĞİLDİR: logo ile aynı SVG yolundan
 * (`HorseHeadIcon` → `HEAD_PATH`) `next/og` ile üretilir — uydurma/lisanssız
 * görsel yok (CLAUDE.md kural 8). Renkler tema token'larıyla aynıdır.
 */
export const PWA_ICON_SIZES = [192, 512] as const;
export type PwaIconSize = (typeof PWA_ICON_SIZES)[number];

export const PWA_BACKGROUND = '#070b14';
export const PWA_THEME = '#070b14';

export function parsePwaIconSize(raw: string): PwaIconSize | null {
  const size = Number(raw);
  return (PWA_ICON_SIZES as readonly number[]).includes(size) ? (size as PwaIconSize) : null;
}

export function buildManifest(): MetadataRoute.Manifest {
  return {
    name: 'AT Sevdalısı',
    short_name: 'At Sevdalısı',
    description: 'At sahibi/yönetici simülasyonu ve yarış oyunu',
    lang: 'tr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: PWA_BACKGROUND,
    theme_color: PWA_THEME,
    icons: PWA_ICON_SIZES.flatMap((size) => [
      { src: `/pwa-icon/${size}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' as const },
      { src: `/pwa-icon/${size}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'maskable' as const },
    ]),
  };
}
