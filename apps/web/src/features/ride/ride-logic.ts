/**
 * OYUNCU KONTROLLÜ YARIŞ — ekranın SAF mantığı (01.10.2026). Saat ve
 * komutlar sunucudandır; burada yalnızca gösterim türetilir.
 */

import type { InteractiveRaceView, PlayerControlInput } from '@at-sevdalisi/shared-types';

/** Klavye: Boşluk/↑ kırbaç, ← sol (içe), → sağ (dışa), ↓ sakin. */
export const CONTROL_KEYS: Readonly<Record<string, PlayerControlInput>> = {
  ' ': 'whip',
  Spacebar: 'whip',
  ArrowUp: 'whip',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'ease',
};

export function controlForKey(key: string): PlayerControlInput | null {
  return CONTROL_KEYS[key] ?? null;
}

/** İstemci saatinin sunucuya göre farkı (ms): `sunucu = yerel + fark`. */
export function serverClockOffsetMs(serverNowIso: string, receivedAtLocalMs: number): number {
  return Date.parse(serverNowIso) - receivedAtLocalMs;
}

/** Yarış saati (ms) — başlangıç işaretinden itibaren, `timeScale` ile; geri sayımda negatif. */
export function raceClockMs(
  localNowMs: number,
  offsetMs: number,
  startsAtIso: string,
  timeScale = 1,
): number {
  return (localNowMs + offsetMs - Date.parse(startsAtIso)) * timeScale;
}

/** Sıradaki segmente kayıtlı komut (düğmelerin üstündeki sayaçlar için). */
export function pendingCommand(
  view: Pick<InteractiveRaceView, 'myCommands' | 'nextCommandSegment'>,
) {
  if (view.nextCommandSegment === null) {
    return null;
  }
  return (
    view.myCommands[String(view.nextCommandSegment)] ?? {
      whips: 0,
      laneShift: 0 as const,
      ease: false,
    }
  );
}

/** Oyuncu atının son gösterilen dayanıklılığı (0-100), yoksa `null`. */
export function latestStamina(
  view: Pick<InteractiveRaceView, 'segments' | 'playerLabel'>,
  raceTimeMs: number,
): number | null {
  let stamina: number | null = null;
  let previousEnd = 0;
  for (const segment of view.segments) {
    if (segment.raceEntryId !== view.playerLabel) {
      continue;
    }
    // Segment başlamışsa (önceki bitiş geçildiyse) onun sonu "şu anki" değerdir.
    if (previousEnd <= raceTimeMs) {
      stamina = segment.stamina ?? stamina;
    }
    previousEnd = segment.timestampMs;
  }
  return stamina;
}

/**
 * Bitiş sırası (01.10.2026, tribün) — her atın SON segment zamanı onun bitiş
 * süresidir; bitişte herkes aynı mesafede olduğundan sıra mesafeden çıkmaz.
 * Yalnızca bitmiş (tüm segmentleri gösterilmiş) görünümde anlamlıdır.
 */
export function finishOrder(view: Pick<InteractiveRaceView, 'segments'>): string[] {
  const finishMs = new Map<string, number>();
  for (const segment of view.segments) {
    finishMs.set(
      segment.raceEntryId,
      Math.max(finishMs.get(segment.raceEntryId) ?? 0, segment.timestampMs),
    );
  }
  return [...finishMs.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}
