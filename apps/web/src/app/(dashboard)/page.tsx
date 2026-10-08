'use client';

/**
 * Ana Sayfa (`/`). 08.10.2026 — sahibinin isteği: "ana sayfa kişinin ahırı
 * olsun, her şey ahırda başlasın". Hesabı olan oyuncu doğrudan `/stable`a
 * yönlenir (eski ana sayfanın kartları ahır sahnesinin altında,
 * `PlayerOverview`). Hesabı olmayan ziyaretçi 3D tanıtımı görür ve oyuncu
 * oluşturunca ahırına geçer.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HomeHero } from '../../features/home-scene/HomeHero';
import { usePlayer } from '../../lib/player-context';
import { HOME_FOR_PLAYERS } from '../../features/home/home-route';

export default function HomePage(): React.ReactElement {
  const { player, isLoading, error, createPlayer } = usePlayer();
  const router = useRouter();

  useEffect(() => {
    if (player) {
      router.replace(HOME_FOR_PLAYERS);
    }
  }, [player, router]);

  // Girişli oyuncu yönlenirken tanıtım sahnesi kurulmaz (3D yükü + titreme).
  if (isLoading || player) {
    return (
      <main className="page-container" style={{ color: 'var(--color-text-muted)' }}>
        Ahırına gidiliyor…
      </main>
    );
  }

  return (
    <main>
      <HomeHero />
      <div className="page-container">
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Henüz giriş yapmış bir seyis/jokey hesabın yok.
          </p>
          <button type="button" onClick={() => void createPlayer()} className="btn-gold">
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: 0 }}>
            Kayıtlı hesabın var mı?{' '}
            <Link href="/account" style={{ color: 'var(--color-accent-focus)', fontWeight: 600 }}>
              Giriş yap
            </Link>
          </p>
          {error ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{error}</p> : null}
        </GlassPanel>
      </div>
    </main>
  );
}
