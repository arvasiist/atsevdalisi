/**
 * FAZ 0 durum sayfası.
 *
 * Bu, brief'teki referans Ana Sayfa tasarımı (§2, §38, §70) DEĞİLDİR —
 * o ekran, gerçek API verisiyle FAZ 1'de `docs/GAME_DESIGN.md` §4'e göre
 * inşa edilecektir. Bu sayfa, FAZ 0 kapsamında sadece iskeletin ayakta
 * olduğunu ve bir sonraki adımın ne olduğunu göstermek için vardır.
 */

const modules = [
  { name: 'Player / Authentication', phase: 'FAZ 1' },
  { name: 'Economy', phase: 'FAZ 1' },
  { name: 'Horse / Stable', phase: 'FAZ 1' },
  { name: 'Training / Care', phase: 'FAZ 1' },
  { name: 'Basic Race Engine', phase: 'FAZ 1' },
  { name: 'Market', phase: 'FAZ 2' },
  { name: 'Genetics / Breeding', phase: 'FAZ 3' },
  { name: 'Farm', phase: 'FAZ 4' },
  { name: 'Advanced Race Engine', phase: 'FAZ 5' },
  { name: 'Web 3D Sunum (Three.js)', phase: 'FAZ 6' },
  { name: 'Online / Kulüp / Turnuva', phase: 'FAZ 7' },
];

export default function HomePage(): React.ReactElement {
  return (
    <main className="page-container">
      <section style={{ marginBottom: 'var(--space-xl)' }}>
        <p
          style={{
            color: 'var(--color-accent-gold)',
            fontSize: '14px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 'var(--space-sm)',
          }}
        >
          FAZ 0 — Teknik Keşif ve Planlama
        </p>
        <h1 style={{ fontSize: '36px', margin: 0, marginBottom: 'var(--space-sm)' }}>🐎 AT Sevdalısı</h1>
        <p style={{ color: 'var(--color-text-secondary)', maxWidth: '640px', lineHeight: 1.6 }}>
          Repo iskeleti, mimari kararlar ve dokümantasyon hazır. Gerçek Ana Sayfa
          (referans UI konseptindeki ahır özeti, son yarış sonuçları ve hızlı
          erişim kartlarıyla) FAZ 1&apos;de bu sayfanın yerini alacaktır.
        </p>
      </section>

      <section
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-lg)',
        }}
      >
        <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: 'var(--space-md)' }}>
          Modül durumu
        </h2>
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          {modules.map((module) => (
            <div
              key={module.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-sm) var(--space-md)',
                background: 'var(--color-bg-surface-elevated)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span style={{ color: 'var(--color-text-primary)', fontSize: '14px' }}>{module.name}</span>
              <span
                style={{
                  color: 'var(--color-accent-gold)',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '2px 10px',
                  border: '1px solid var(--color-accent-gold)',
                  borderRadius: '999px',
                }}
              >
                {module.phase}
              </span>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ marginTop: 'var(--space-xl)', color: 'var(--color-text-muted)', fontSize: '12px' }}>
        Kaynak: <code>docs/PROJECT_BRIEF.md</code> · Mimari:{' '}
        <code>docs/ARCHITECTURE.md</code> · Yol haritası: <code>docs/ROADMAP.md</code>
      </footer>
    </main>
  );
}
