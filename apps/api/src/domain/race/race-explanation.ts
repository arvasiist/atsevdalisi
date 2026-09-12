/**
 * "Neden kazandım/kaybettim?" açıklaması — brief §85, `docs/RACE_ENGINE.md`
 * §9. Race Engine'den AYRI, saf bir fonksiyondur; `RaceTimeline`'ın zaten
 * ürettiği segment telemetrisinden 2-4 en belirgin (pozitif/negatif)
 * faktörü türetir. Yeni bir hesaplama YAPMAZ — sadece zaten var olan
 * segment verisini yorumlar.
 */

import type { RaceExplanation, RaceFinishEntry, RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';

/** İki veya daha fazla bloklanma "sık trafik" sayılır; hiç bloklanmama "temiz koşu" sayılır. */
const FREQUENT_BLOCK_THRESHOLD = 2;

function groupSegmentsByHorse(segments: RaceSegmentSnapshot[]): Map<string, RaceSegmentSnapshot[]> {
  const map = new Map<string, RaceSegmentSnapshot[]>();
  for (const segment of segments) {
    const list = map.get(segment.raceEntryId) ?? [];
    list.push(segment);
    map.set(segment.raceEntryId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.timestampMs - b.timestampMs);
  }
  return map;
}

export function explainRace(segments: RaceSegmentSnapshot[], finalResult: RaceFinishEntry[]): RaceExplanation[] {
  const byHorse = groupSegmentsByHorse(segments);
  const explanations: RaceExplanation[] = [];

  for (const finish of finalResult) {
    const horseSegments = byHorse.get(finish.horseId) ?? [];
    const positives: string[] = [];
    const negatives: string[] = [];

    if (horseSegments.length > 0) {
      const first = horseSegments[0]!;
      const last = horseSegments[horseSegments.length - 1]!;

      if (last.currentRank < first.currentRank) {
        positives.push(
          `Yarışın başında ${first.currentRank}. sıradayken, bitişte ${last.currentRank}. sıraya yükseldi.`,
        );
      } else if (last.currentRank > first.currentRank) {
        negatives.push(
          `Yarışın başında ${first.currentRank}. sıradayken, bitişte ${last.currentRank}. sıraya düştü.`,
        );
      }

      const minStamina = Math.min(...horseSegments.map((s) => s.stamina));
      if (minStamina <= 0) {
        negatives.push('Yarış sırasında enerjisi tamamen tükendi, son bölümde performansı düştü.');
      }

      const blockedCount = horseSegments.filter((s) => s.blocked).length;
      if (blockedCount >= FREQUENT_BLOCK_THRESHOLD) {
        negatives.push('Birden fazla kez trafiğe takılıp bloklandı.');
      } else if (blockedCount === 0) {
        positives.push('Yarış boyunca hiç bloklanmadan temiz bir koşu çıkardı.');
      }

      const sprintedSegments = horseSegments.filter((s) => s.decision === 'push_for_finish').length;
      if (sprintedSegments > 0) {
        positives.push('Finiş çizgisine güçlü bir final sprintiyle geldi.');
      }
    }

    explanations.push({ horseId: finish.horseId, positives, negatives });
  }

  return explanations;
}
