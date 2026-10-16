'use client';

/**
 * KARE HIZI İZLEYİCİ (01.10.2026, 3D adım 10) — `<Canvas>` içinde.
 * drei `PerformanceMonitor` ortalama kare hızını ölçer; `lowerFps` altına
 * düşünce `onDecline` çağrılır (kademe bir iner). İzleme yalnızca
 * "Otomatik" tercihte kurulur; eşikler `performance.config.json`dan.
 */

import { PerformanceMonitor } from '@react-three/drei';
import { PERFORMANCE } from './use-quality-tier';

export function SceneQualityMonitor({
  enabled,
  onDecline,
}: {
  enabled: boolean;
  onDecline: () => void;
}): React.ReactElement | null {
  if (!enabled) return null;
  return (
    <PerformanceMonitor
      bounds={() => [PERFORMANCE.monitor.lowerFps, PERFORMANCE.monitor.upperFps]}
      flipflops={PERFORMANCE.monitor.flipflops}
      onDecline={onDecline}
    />
  );
}
