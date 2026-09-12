/**
 * Sürekli (continuous) pozisyon ara değerlemesi — brief'in FAZ 5 kapsamında
 * ayrı bir madde olarak listelediği "Continuous simulation". Race Engine'in
 * kendisi (§4 segment sistemi, brief §19) HALA ayrık (200m'lik) kontrol
 * noktaları üretir — bu, `docs/RACE_ENGINE.md` §7 determinism garantisiyle
 * doğrudan uyumludur ve DEĞİŞTİRİLMEMİŞTİR.
 *
 * "Sürekli simülasyon" ihtiyacı asıl olarak SUNUM katmanından gelir (brief
 * §22-23: Three.js sahnesi atı akıcı hareket ettirmeli, 200m'de bir
 * "ışınlanma" değil) — `docs/RACE_ENGINE.md` §1 "3D katman sonucu asla
 * değiştiremez" ilkesiyle tutarlı kalarak, bu modül YENİ bir simülasyon
 * YAPMAZ; zaten hesaplanmış segment kontrol noktaları arasında SAF bir
 * lineer ara değerleme (interpolation) sağlar. Kameralar (brief FAZ 5
 * "Cameras") ve gerçek 3D render tamamen `apps/web`/FAZ 6 kapsamındadır;
 * bu fonksiyon sadece o katmanın ihtiyaç duyacağı "t anındaki pozisyon"
 * sorgusunu karşılar.
 */

import type { RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';

export interface InterpolatedRacePosition {
  positionMeters: number;
  speedMps: number;
}

/**
 * Belirli bir at için, verilen `timestampMs` anındaki pozisyon/hızı,
 * en yakın iki segment kontrol noktası arasında lineer ara değerleyerek
 * döner. `timestampMs` ilk kontrol noktasından ÖNCEYSE start çizgisinden
 * (0m, t=0) o noktaya; SONRAYSA son kontrol noktasında sabit kalır.
 */
export function interpolateHorsePositionAtTime(
  segments: RaceSegmentSnapshot[],
  horseId: string,
  timestampMs: number,
): InterpolatedRacePosition {
  const horseSegments = segments.filter((s) => s.raceEntryId === horseId).sort((a, b) => a.timestampMs - b.timestampMs);

  if (horseSegments.length === 0) {
    return { positionMeters: 0, speedMps: 0 };
  }

  const firstSegment = horseSegments[0]!;
  if (timestampMs <= firstSegment.timestampMs) {
    const fraction = firstSegment.timestampMs > 0 ? clampFraction(timestampMs / firstSegment.timestampMs) : 1;
    return { positionMeters: firstSegment.positionMeters * fraction, speedMps: firstSegment.speed };
  }

  for (let i = 1; i < horseSegments.length; i += 1) {
    const previous = horseSegments[i - 1]!;
    const current = horseSegments[i]!;
    if (timestampMs <= current.timestampMs) {
      const span = current.timestampMs - previous.timestampMs;
      const fraction = span > 0 ? clampFraction((timestampMs - previous.timestampMs) / span) : 1;
      return {
        positionMeters: previous.positionMeters + (current.positionMeters - previous.positionMeters) * fraction,
        speedMps: previous.speed + (current.speed - previous.speed) * fraction,
      };
    }
  }

  const lastSegment = horseSegments[horseSegments.length - 1]!;
  return { positionMeters: lastSegment.positionMeters, speedMps: lastSegment.speed };
}

function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, value));
}
