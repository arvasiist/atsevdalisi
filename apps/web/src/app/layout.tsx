import { Cinzel, Inter } from 'next/font/google';
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
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter', display: 'swap' });
// Başlık/logo yazı tipi (01.10.2026 tasarım yenilemesi) — OFL lisanslı,
// Inter ile AYNI şekilde build zamanında self-host edilir.
const cinzel = Cinzel({ subsets: ['latin', 'latin-ext'], weight: ['600', '700'], variable: '--font-cinzel', display: 'swap' });

export const metadata: Metadata = {
  title: 'AT Sevdalısı',
  description:
    'At sahibi/yönetici simülasyonu — atını yetiştir, antrenman yaptır, yarış kazan, kendi şampiyon kan hattını kur.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070b14',
};

export default function RootLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <html lang="tr" className={`${inter.variable} ${cinzel.variable}`}>
      <body>
        <PlayerProvider>
          <TopBar />
          <div className="app-main">{children}</div>
        </PlayerProvider>
      </body>
    </html>
  );
}
