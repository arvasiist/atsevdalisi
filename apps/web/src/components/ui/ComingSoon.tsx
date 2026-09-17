'use client';

import Link from 'next/link';
import { GlassPanel } from './GlassPanel';

/**
 * `docs/GAME_DESIGN.md` §2'nin ekran haritasında yer alan ama backend
 * tarafında henüz bir HTTP katmanı (controller) OLMAYAN alanlar için
 * (Yarışlar takvimi, Antrenman, Çiftlik, Online, Sıralama, Kulüp — bkz.
 * Faz 2 planı araştırma notları: domain mantığı `apps/api/src/domain/`
 * altında var, ama dışa açılmış bir endpoint yok) dürüst bir "yakında"
 * sayfası. SAHTE veri göstermek yerine (ör. uydurma bir sıralama tablosu)
 * bu, kapsam dışı olduğunu AÇIKÇA belirtir — `docs/ARCHITECTURE.md`'nin
 * "gerçek veri yoksa uydurma" karşıtı ilkesiyle tutarlıdır.
 */
export interface ComingSoonProps {
  title: string;
  icon: string;
  description: string;
  /** Ana panelin ALTINA, aynı `<main>` içinde eklenecek isteğe bağlı ek içerik
   *  (ör. `races/page.tsx`'in "demo'yu dene" linki) — ikinci bir `<main>` AÇMADAN
   *  sayfaya özel ekstra bir bölüm eklemek için. */
  extra?: React.ReactNode;
}

export function ComingSoon({ title, icon, description, extra }: ComingSoonProps): React.ReactElement {
  return (
    <main className="page-container">
      <GlassPanel
        style={{
          textAlign: 'center',
          maxWidth: '520px',
          margin: '48px auto',
          padding: 'var(--space-xl)',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: 'var(--space-md)' }}>{icon}</div>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', color: 'var(--color-text-primary)' }}>{title}</h1>
        <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{description}</p>
        <div
          style={{
            display: 'inline-block',
            marginTop: 'var(--space-md)',
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '12px',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-gold)',
            border: '1px solid var(--color-accent-gold)',
          }}
        >
          Yakında
        </div>
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <Link href="/" style={{ color: 'var(--color-accent-focus)' }}>
            ← Ana Sayfaya dön
          </Link>
        </div>
      </GlassPanel>
      {extra ? <div style={{ marginTop: 'var(--space-lg)' }}>{extra}</div> : null}
    </main>
  );
}
