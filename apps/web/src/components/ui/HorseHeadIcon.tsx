import { useId } from 'react';

/**
 * AT BAŞI SİLÜETİ (01.10.2026) — logo ve "Ahır" simgesi.
 *
 * Simge kütüphanesinde (`lucide-react`) at simgesi yoktur; bu silüet
 * projeye özgü olarak elle çizilmiş bir SVG yoludur (dış dosya/asset
 * DEĞİLDİR — CLAUDE.md kural 8). `currentColor` ile boyanır; `gradient`
 * verilirse logo için altın degrade kullanılır.
 */

/** PWA ikonu da (`app/pwa-icon`) AYNI yolu çizer — tek kaynak. */
export const HEAD_PATH =
  'M14 60 C13 49 15 39 19 31 C21.5 26 24.5 22 28 19 L26 7.5 C26 6.6 27 6.2 27.7 6.9 L33.3 12.4 ' +
  'C40 12 46 16 50.5 22.5 L57.5 33.5 C59 36 58.4 39.4 55.6 40 C53.8 40.4 52.2 39.8 50.8 38.8 L46 35.6 ' +
  'C43.2 34 40.4 35.6 39.8 39 C39.2 43 40.4 48 42.6 52 L46 60 Z ' +
  'M42 22 a1.9 1.9 0 1 0 0.01 0 Z M54.6 35 a1 1 0 1 0 0.01 0 Z';

export const MANE_PATH =
  'M8 54 C9 44 11 35 16 27 C19 22 23 18 27.5 15.5 C23 22 20.5 29 19.5 37 C18.8 43 18.8 49 19.5 55 Z';

export interface HorseHeadIconProps {
  size?: number;
  /** Logo için altın degrade; verilmezse `currentColor`. */
  gradient?: boolean;
  /** Yele gölgesi — küçük boyutlarda gürültü olduğu için varsayılan kapalı. */
  withMane?: boolean;
  className?: string;
}

export function HorseHeadIcon({
  size = 20,
  gradient = false,
  withMane = false,
  className,
}: HorseHeadIconProps): React.ReactElement {
  // Aynı sayfada birden çok degradeli simge olabilir — kimlik benzersiz olmalı.
  const gradientId = `horse-head-gold-${useId().replace(/:/g, '')}`;
  const fill = gradient ? `url(#${gradientId})` : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      {gradient ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f7dc8a" />
            <stop offset="1" stopColor="#b8862b" />
          </linearGradient>
        </defs>
      ) : null}
      {withMane ? <path d={MANE_PATH} fill={fill} opacity={0.75} /> : null}
      <path d={HEAD_PATH} fill={fill} fillRule="evenodd" />
    </svg>
  );
}
