'use client';

/**
 * Ortak "cam panel" kabuğu — `race-viewer/RaceHud.tsx`'teki `panelStyle()`
 * ile AYNI görsel dil (yarı saydam koyu lacivert + blur + ince kenarlık),
 * Faz 2'nin (Ana Sayfa/Ahırım) tüm panelleri bu dille tutarlı olsun diye
 * paylaşılan tek bir bileşene çıkarıldı (DRY — `RaceHud.tsx`'in kendisi
 * three.js'e bağımlı `race-viewer` özelliğine ait olduğundan buradan
 * import EDİLMEZ, aynı stil burada bağımsız olarak tutulur).
 */
export interface GlassPanelProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  as?: 'div' | 'section' | 'article';
}

export function GlassPanel({ children, style, as = 'div' }: GlassPanelProps): React.ReactElement {
  const Tag = as;
  return (
    <Tag
      style={{
        background: 'rgba(18, 27, 46, 0.72)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        backdropFilter: 'blur(6px)',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
