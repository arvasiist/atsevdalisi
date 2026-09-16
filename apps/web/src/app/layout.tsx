import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Header } from '../components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'AT Sevdalısı',
  description:
    'At sahibi/yönetici simülasyonu — atını yetiştir, antrenman yaptır, yarış kazan, kendi şampiyon kan hattını kur.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1220',
};

export default function RootLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <html lang="tr">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}