import { describe, expect, it } from 'vitest';
import { loadPerformanceConfig } from '@at-sevdalisi/game-config';
import {
  isQualityPreference,
  resolveQualityTier,
} from '../../../src/features/race-viewer/quality-preference';

const { maxAutoDowngrades, monitor } = loadPerformanceConfig();

describe('kalite tercihi (01.10.2026, 3D adım 10)', () => {
  it('sabit seçim otomatik düşürmeyle EZİLMEZ', () => {
    expect(resolveQualityTier('ultra', 'low', 5, maxAutoDowngrades)).toBe('ultra');
    expect(resolveQualityTier('low', 'ultra', 0, maxAutoDowngrades)).toBe('low');
  });

  it('otomatikte algılanan kademeden, config sınırına kadar iner', () => {
    expect(resolveQualityTier('auto', 'ultra', 0, maxAutoDowngrades)).toBe('ultra');
    expect(resolveQualityTier('auto', 'ultra', 1, maxAutoDowngrades)).toBe('high');
    expect(resolveQualityTier('auto', 'ultra', 99, 2)).toBe('medium');
    expect(resolveQualityTier('auto', 'medium', 99, 5)).toBe('low');
  });

  it('config değerleri tutarlı; bozuk depolama değeri tercih sayılmaz', () => {
    expect(maxAutoDowngrades).toBeGreaterThan(0);
    expect(monitor.lowerFps).toBeLessThan(monitor.upperFps);
    expect(isQualityPreference('auto')).toBe(true);
    expect(isQualityPreference('ultra')).toBe(true);
    expect(isQualityPreference('epic')).toBe(false);
    expect(isQualityPreference(null)).toBe(false);
  });
});
