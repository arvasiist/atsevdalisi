import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AT Sevdalısı',
  description:
    'At sahibi/yönetici simülasyonu — atını yetiştir, antrenman yaptır, yarış kazan, kendi şampiyon kan hattını kur.',
};

// Mobil uyumluluk için (brief: "masaüstü ve mobil uyumlu")
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1220',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
