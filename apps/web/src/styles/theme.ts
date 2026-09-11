/**
 * Merkezi tema config. Brief §47: "Renkler tema config üzerinden
 * yönetilmelidir." Hiçbir bileşen renk/spacing/breakpoint değerini kendi
 * içinde sabit (hard-coded) tutmaz; bu dosyadan veya buradan türetilen CSS
 * değişkenlerinden (bkz. `globals.css`) okur.
 *
 * Renk paleti, referans UI konseptindeki (koyu lacivert hipodrom sahnesi +
 * altın/amber vurgular + yeşil/kırmızı durum çubukları) premium hissi
 * özgün bir şekilde yorumlar (brief §2 son paragraf — birebir kopya değil).
 */

export const colors = {
  background: {
    base: '#0b1220', // koyu lacivert - hero/sahne zemini
    surface: '#121b2e', // kart/panel zemini
    surfaceElevated: '#1a2740', // üst bilgi çubuğu, modal
  },
  accent: {
    gold: '#e3b341', // para, premium, kupa vurguları
    gem: '#7dd3fc', // premium currency (gem) vurgusu
    focus: '#38bdf8', // interaktif odak/link
  },
  status: {
    positive: '#4ade80', // sağlık/moral/kondisyon yüksek
    warning: '#facc15', // dikkat gerektiren durum
    critical: '#f87171', // sağlık/enerji düşük, hata
  },
  text: {
    primary: '#f5f7fa',
    secondary: '#a8b3c7',
    muted: '#6b7690',
  },
  border: 'rgba(255, 255, 255, 0.08)',
} as const;

export const breakpoints = {
  mobile: '360px',
  tablet: '768px',
  desktopSmall: '1024px',
  desktopWide: '1440px',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '40px',
} as const;

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '16px',
} as const;

export const typography = {
  fontFamily:
    "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  scale: {
    caption: '12px',
    body: '14px',
    subtitle: '16px',
    title: '20px',
    heading: '28px',
    hero: '36px',
  },
} as const;

export type Theme = {
  colors: typeof colors;
  breakpoints: typeof breakpoints;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
};

export const theme: Theme = { colors, breakpoints, spacing, radii, typography };
