'use client';

/** KALİTE SEÇİCİ (01.10.2026, 3D adım 10) — `useQualityTier` tercihini değiştirir. */

import { Gauge } from 'lucide-react';
import {
  QUALITY_PREFERENCE_LABELS,
  QUALITY_TIERS_ASCENDING,
  isQualityPreference,
} from './quality-preference';
import { useQualityTier } from './use-quality-tier';

const OPTIONS = ['auto', ...QUALITY_TIERS_ASCENDING] as const;

export function QualitySelect({ style }: { style?: React.CSSProperties }): React.ReactElement {
  const { preference, tier, setPreference } = useQualityTier();
  return (
    <label className="quality-select" style={style} title="Grafik kalitesi">
      <Gauge size={14} aria-hidden="true" />
      <span className="sr-only">Grafik kalitesi</span>
      <select
        value={preference}
        onChange={(event) => {
          if (isQualityPreference(event.target.value)) setPreference(event.target.value);
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === 'auto'
              ? `${QUALITY_PREFERENCE_LABELS.auto} (${QUALITY_PREFERENCE_LABELS[tier]})`
              : QUALITY_PREFERENCE_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
