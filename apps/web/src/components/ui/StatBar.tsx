'use client';

/**
 * 0-100 aralığındaki bir at durumunu (health/fitness/fatigue/energy/morale
 * — `PublicHorse`, `packages/shared-types/src/horse.ts`) yatay bir çubuk
 * olarak gösterir. Bu bileşen bilinçli olarak YENİ hiçbir veri İCAT ETMEZ
 * — yalnızca zaten var olan 0-100 sayısal alanları görselleştirir.
 */
export interface StatBarProps {
  label: string;
  value: number;
  /**
   * `false` ise (ör. `fatigue`) düşük değer İYİ demektir, renk skalası
   * TERSİNE çevrilir (yüksek yorgunluk = kritik/kırmızı).
   */
  higherIsBetter?: boolean;
  /** Etiketin solunda gösterilecek simge (01.10.2026 tasarım yenilemesi). */
  icon?: React.ReactNode;
  /**
   * Sabit renk (01.10.2026). Doluluk gibi "iyi/kötü" olmayan ölçüler için:
   * renk eşiğe göre değil bu değerle boyanır (ör. ahır kapasitesi altın).
   */
  color?: string;
}

const CRITICAL_THRESHOLD = 30;
const WARNING_THRESHOLD = 60;

function colorForValue(value: number, higherIsBetter: boolean): string {
  const effective = higherIsBetter ? value : 100 - value;
  if (effective < CRITICAL_THRESHOLD) return 'var(--color-status-critical)';
  if (effective < WARNING_THRESHOLD) return 'var(--color-status-warning)';
  return 'var(--color-status-positive)';
}

export function StatBar({ label, value, higherIsBetter = true, icon, color }: StatBarProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  const fill = color ?? colorForValue(clamped, higherIsBetter);
  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)' }}>
          {icon}
          {label}
        </span>
        <span style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(clamped)}
        </span>
      </div>
      <div
        style={{
          height: '7px',
          borderRadius: '999px',
          background: 'rgba(0, 0, 0, 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            borderRadius: '999px',
            background: fill,
            // Parlak üst kenar + hafif ışıma (01.10.2026 tasarım yenilemesi).
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0) 60%)',
            boxShadow: `0 0 8px ${fill}`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}
