'use client';

/**
 * KALİTE KANCASI (01.10.2026, 3D adım 10) — üç sahnenin (ana sayfa, yarış,
 * ahır) ortak kalite kaynağı. Tercih tarayıcıda saklanır ve açık sahneler
 * arasında eşitlenir; otomatik düşürme sayfa ömrü boyunca sürer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadPerformanceConfig } from '@at-sevdalisi/game-config';
import { detectQualityTier } from './detect-quality-tier';
import {
  isQualityPreference,
  resolveQualityTier,
  type QualityPreference,
} from './quality-preference';
import {
  getQualityTierRenderSettings,
  type QualityTier,
  type QualityTierRenderSettings,
} from './quality-tier';

export const PERFORMANCE = loadPerformanceConfig();
const STORAGE_KEY = 'at-sevdalisi:quality';
const CHANGE_EVENT = 'at-sevdalisi:quality-change';
const DOWNGRADE_EVENT = 'at-sevdalisi:quality-downgrade';

/** Sayfa ömrü boyunca otomatik düşürme sayısı (sahne yeniden kurulunca sıfırlanmasın). */
let sessionAutoDowngrades = 0;

function readPreference(): QualityPreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isQualityPreference(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export interface QualityTierState {
  preference: QualityPreference;
  tier: QualityTier;
  settings: QualityTierRenderSettings;
  setPreference: (preference: QualityPreference) => void;
  /** Kare hızı düştü (yalnızca "Otomatik"te etkili). */
  reportPerformanceDecline: () => void;
}

export function useQualityTier(): QualityTierState {
  const detected = useMemo(() => detectQualityTier(), []);
  const [preference, setPreferenceState] = useState<QualityPreference>('auto');
  const [downgrades, setDowngrades] = useState(sessionAutoDowngrades);

  useEffect(() => {
    setPreferenceState(readPreference());
    const syncPreference = (): void => setPreferenceState(readPreference());
    const syncDowngrades = (): void => setDowngrades(sessionAutoDowngrades);
    window.addEventListener(CHANGE_EVENT, syncPreference);
    window.addEventListener(DOWNGRADE_EVENT, syncDowngrades);
    return () => {
      window.removeEventListener(CHANGE_EVENT, syncPreference);
      window.removeEventListener(DOWNGRADE_EVENT, syncDowngrades);
    };
  }, []);

  const setPreference = useCallback((next: QualityPreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Depolama kapalıysa tercih yalnızca bu sayfada yaşar.
    }
    sessionAutoDowngrades = 0;
    setPreferenceState(next);
    setDowngrades(0);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    window.dispatchEvent(new Event(DOWNGRADE_EVENT));
  }, []);

  const reportPerformanceDecline = useCallback(() => {
    if (readPreference() !== 'auto') return;
    if (sessionAutoDowngrades >= PERFORMANCE.maxAutoDowngrades) return;
    sessionAutoDowngrades += 1;
    window.dispatchEvent(new Event(DOWNGRADE_EVENT));
  }, []);

  const tier = resolveQualityTier(preference, detected, downgrades, PERFORMANCE.maxAutoDowngrades);
  const settings = useMemo(() => getQualityTierRenderSettings(tier), [tier]);
  return { preference, tier, settings, setPreference, reportPerformanceDecline };
}
