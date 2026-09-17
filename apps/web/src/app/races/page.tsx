'use client';

/**
 * Yarışlar (takvim) — `docs/GAME_DESIGN.md` §2'de tanımlı ama backend
 * tarafında bir `GET /races` (yarış takvimi) endpoint'i HENÜZ YOK (yalnızca
 * `POST /horses/:id/practice-race` var, bkz. Faz 2 araştırma notları).
 * Sahte bir takvim göstermek yerine dürüst bir "yakında" durumu + gerçek
 * pratik yarış demosuna (`/races/demo`, Faz 1) bir yönlendirme sunulur.
 */

import Link from 'next/link';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ComingSoon } from '../../components/ui/ComingSoon';

export default function RacesPage(): React.ReactElement {
  // NOT: `<ComingSoon>` kendi `<main className="page-container">` sarmalayıcısını
  // ZATEN içerir — burada ikinci bir `<main>` AÇMIYORUZ (iç içe `<main>` geçersiz
  // HTML olurdu). Ekstra "demo'yu dene" paneli, ComingSoon'un panelinin ALTINA,
  // aynı `<main>` içinde ikinci bir bölüm olarak eklenir.
  return (
    <ComingSoon
      icon="🏁"
      title="Yarış Takvimi"
      description="Planlanmış yarışlar ve turnuva takvimi yakında burada olacak. Şimdilik atınla gerçek Race Engine'i çalıştıran pratik yarışı deneyebilirsin."
      extra={
        <GlassPanel style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
          <Link href="/races/demo" style={{ color: 'var(--color-accent-focus)', fontWeight: 600 }}>
            3D Yarış Görüntüleyiciyi Dene →
          </Link>
        </GlassPanel>
      }
    />
  );
}
