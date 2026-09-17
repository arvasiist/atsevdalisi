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
}

const CRITICAL_THRESHOLD = 30;
const WARNING_THRESHOLD = 60;

function colorForValue(value: number, higherIsBetter: boolean): string {
  const effective = higherIsBetter ? value : 100 - value;
  if (effective < CRITICAL_THRESHOLD) return 'var(--color-status-critical)';
  if (effective < WARNING_THRESHOLD) return 'var(--color-status-warning)';
  return 'var(--color-status-positive)';
}

export function StatBar({ label, value, higherIsBetter = true }: StatBarProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(clamped)}
        </span>
      </div>
      <div
        style={{
          height: '6px',
          borderRadius: '999px',
          background: 'rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            borderRadius: '999px',
            background: colorForValue(clamped, higherIsBetter),
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}
