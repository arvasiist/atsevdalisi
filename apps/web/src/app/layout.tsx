import { Inter } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { PlayerProvider } from '../lib/player-context';
import './globals.css';

/**
 * `theme.ts`/`globals.css`'teki `--font-family` daha önce 'Inter'i yalnızca
 * bir CSS `font-family` ADI olarak referans veriyordu ama hiçbir yerde
 * GERÇEKTEN yüklenmiyordu — tarayıcı sistemde kurulu değilse sessizce
 * system-ui'ye düşüyordu. `next/font/google`, fontu build zamanında
 * indirip kendi sunucusundan (self-host) servis eder; harici bir çalışma
 * zamanı isteği YOKTUR (gizlilik + performans).
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

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
    <html lang="tr" className={inter.variable}>
      <body>
        <PlayerProvider>
          <TopBar />
          <div className="app-main">{children}</div>
        </PlayerProvider>
      </body>
    </html>
  );
}
