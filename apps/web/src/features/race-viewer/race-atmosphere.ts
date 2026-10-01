/**
 * YARIŞ ATMOSFERİ (01.10.2026, 3D adım 5) — saf fonksiyonlar.
 *
 * Kalabalık heyecanı (0..1) yarışın gerçek ilerlemesinden türetilir: yarış
 * öncesi sakin, koşu boyunca orta, final düzlüğüne girince (kameranın
 * "final_stretch" eşiğiyle AYNI eşik) yükselir, bitişte zirve, coşku
 * `finishCelebrationSeconds` sonra söner. Tribün hareketi ve kalabalık sesi
 * (adım 9) bu tek değeri okur. Sonuca etkisi yoktur (salt sunum).
 */

import { useEffect, useState } from 'react';
import type { AtmosphereConfig } from '@at-sevdalisi/game-config';

export interface CrowdExcitementInput {
  leaderPositionMeters: number;
  raceDistanceMeters: number;
  /** Final düzlüğü eşiği (kalan metre) — `camera.config.json` ile aynı değer verilmeli. */
  finalStretchRemainingMeters: number;
  isRaceFinished: boolean;
  /** Bitişten bu yana geçen süre (saniye); bilinmiyorsa 0. */
  secondsSinceFinish?: number;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function computeCrowdExcitement(
  input: CrowdExcitementInput,
  config: AtmosphereConfig,
): number {
  const crowd = config.crowd;
  if (input.isRaceFinished) {
    const fade = smoothstep(
      (input.secondsSinceFinish ?? 0) / Math.max(0.001, crowd.finishCelebrationSeconds),
    );
    return crowd.finishExcitement + (crowd.raceExcitement - crowd.finishExcitement) * fade;
  }
  if (input.raceDistanceMeters <= 0 || input.leaderPositionMeters <= 0)
    return crowd.preRaceExcitement;
  const remaining = input.raceDistanceMeters - input.leaderPositionMeters;
  if (remaining > input.finalStretchRemainingMeters) return crowd.raceExcitement;
  const progress = 1 - remaining / Math.max(1, input.finalStretchRemainingMeters);
  return (
    crowd.raceExcitement +
    (crowd.finalStretchExcitement - crowd.raceExcitement) * smoothstep(progress)
  );
}

/** Saf: bir seyircinin anlık yüksekliği (ayağa kalkma + zıplama). */
export function spectatorLift(
  excitement: number,
  phase: number,
  timeSeconds: number,
  config: AtmosphereConfig,
): number {
  const crowd = config.crowd;
  const standing = excitement >= crowd.standUpThreshold ? 0.25 : 0;
  const bob = Math.max(0, Math.sin(timeSeconds * (2 + 4 * excitement) + phase * Math.PI * 2));
  return standing + bob * crowd.maxBobMeters * excitement * excitement;
}

/** Saf: deterministik seyrekleştirme — `density` oranında koltuk dolu kalır. */
export function keepSpectator(seed: number, density: number): boolean {
  return seed < density;
}

/**
 * Bitişten bu yana geçen saniye (bitmemişse 0). Coşku sönerken yeniden
 * çizim için yarım saniyede bir güncellenir; `finishCelebrationSeconds`
 * dolunca sayaç durur.
 */
export function useSecondsSinceFinish(isRaceFinished: boolean, celebrationSeconds: number): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!isRaceFinished) {
      setSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= celebrationSeconds) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [isRaceFinished, celebrationSeconds]);
  return seconds;
}
