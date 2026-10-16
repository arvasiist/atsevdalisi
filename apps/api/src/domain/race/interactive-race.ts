import type { InteractiveRaceConfig, RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { RaceTimeline } from '@at-sevdalisi/shared-types';
import type { PlayerSegmentCommand } from './race-engine';
import { InvalidPlayerControlError } from './errors';

/**
 * OYUNCU KONTROLLÜ PRATİK YARIŞ (01.10.2026) — canlı oturumun SAF kuralları.
 *
 * Yarış sunucuda determinist motorla, o ana kadar verilmiş komutlarla
 * baştan hesaplanır. Motorun "önek değişmezliği" sayesinde (komut yalnızca
 * kendi segmentinden itibaren etkiler) gösterilmiş segmentler sonradan gelen
 * komutla DEĞİŞMEZ; komut her zaman İLK GÖSTERİLMEMİŞ segmente yazılır.
 */

export type PlayerControlInput = 'whip' | 'left' | 'right' | 'ease';
export const PLAYER_CONTROL_INPUTS: readonly PlayerControlInput[] = [
  'whip',
  'left',
  'right',
  'ease',
];

/** Segment indeksi (metin anahtar, JSONB uyumu) → komut. */
export type PlayerCommandLog = Record<string, PlayerSegmentCommand>;

export function parsePlayerControlInput(raw: unknown): PlayerControlInput {
  if (typeof raw !== 'string' || !PLAYER_CONTROL_INPUTS.includes(raw as PlayerControlInput)) {
    throw new InvalidPlayerControlError(raw);
  }
  return raw as PlayerControlInput;
}

/**
 * Bir düğmeye basışı segment komutuna işler (yeni nesne döner):
 * kırbaç sayacı artar (kayıt sınırına kadar) ve "sakin"i iptal eder;
 * "sakin" kırbacı sıfırlar; sol/sağ kulvar kaymasını bir yöne çeker
 * (segment başına en fazla bir kulvar, ters basış iptal eder).
 */
export function applyPlayerControl(
  log: PlayerCommandLog,
  segmentIndex: number,
  control: PlayerControlInput,
  config: RaceBalanceConfig['playerControl'],
): PlayerCommandLog {
  const key = String(segmentIndex);
  const current: PlayerSegmentCommand = log[key] ?? { whips: 0, laneShift: 0, ease: false };
  let next: PlayerSegmentCommand;
  switch (control) {
    case 'whip':
      next = {
        ...current,
        whips: Math.min(config.maxWhipsPerSegment, current.whips + 1),
        ease: false,
      };
      break;
    case 'ease':
      next = { ...current, whips: 0, ease: true };
      break;
    case 'left':
      next = { ...current, laneShift: current.laneShift === 1 ? 0 : -1 };
      break;
    case 'right':
      next = { ...current, laneShift: current.laneShift === -1 ? 0 : 1 };
      break;
  }
  return { ...log, [key]: next };
}

/** Kayıttaki komutları motorun beklediği haritaya çevirir. */
export function toPlayerCommandMap(
  horseId: string,
  log: PlayerCommandLog,
): ReadonlyMap<string, ReadonlyMap<number, PlayerSegmentCommand>> {
  return new Map([
    [horseId, new Map(Object.entries(log).map(([key, value]) => [Number(key), value]))],
  ]);
}

/** Zaman çizelgesindeki segment sayısı (indeks başına `entryCount` satır). */
export function segmentCountOf(timeline: RaceTimeline, entryCount: number): number {
  return entryCount === 0 ? 0 : Math.floor(timeline.segments.length / entryCount);
}

/**
 * Yarış saatinde (`elapsedMs`, başlangıç işaretinden itibaren) KAÇ segment
 * indeksi gösterilmiş: segment `j`, herhangi bir at `j`'ye başladığında
 * (önceki segmentinin bitiş anı; `j = 0` için 0) eksi `revealLeadMs` anında
 * açılır. Her at, bulunduğu anın segmentini hep gösterilmiş bulur.
 */
export function revealedSegmentCount(
  timeline: RaceTimeline,
  entryCount: number,
  elapsedMs: number,
  revealLeadMs: number,
): number {
  const total = segmentCountOf(timeline, entryCount);
  let revealed = 0;
  for (let j = 0; j < total; j += 1) {
    let earliestStart = 0;
    if (j > 0) {
      earliestStart = Infinity;
      for (const segment of timeline.segments.slice((j - 1) * entryCount, j * entryCount)) {
        earliestStart = Math.min(earliestStart, segment.timestampMs);
      }
    }
    if (earliestStart - revealLeadMs > elapsedMs) {
      break;
    }
    revealed = j + 1;
  }
  return revealed;
}

/** Son atın bitiş anı (yarış saati, ms). */
export function raceEndMs(timeline: RaceTimeline): number {
  return timeline.finalResult.reduce((max, entry) => Math.max(max, entry.finishTimeMs), 0);
}

/** Birden çok oyuncunun komut kayıtları → motorun haritası (lobi kontrollü yarışı). */
export function toPlayerCommandMaps(
  entries: { horseId: string; commands: PlayerCommandLog }[],
): ReadonlyMap<string, ReadonlyMap<number, PlayerSegmentCommand>> {
  return new Map(
    entries.map((entry) => [
      entry.horseId,
      new Map(Object.entries(entry.commands).map(([key, value]) => [Number(key), value] as const)),
    ]),
  );
}

/** Canlı yarış saati (ms, yarış zamanı): gerçek geçen süre × `timeScale`; başlangıç yoksa −∞. */
export function liveElapsedMs(
  liveStartsAt: Date | null,
  now: Date,
  config: Pick<InteractiveRaceConfig, 'timeScale'>,
): number {
  return liveStartsAt === null
    ? -Infinity
    : (now.getTime() - liveStartsAt.getTime()) * config.timeScale;
}

/** Kesinleşmeye kalan YARIŞ zamanı (ms); ≤ 0 ise yarış bitmiştir. */
export function liveRemainingMs(
  race: { liveStartsAt: Date | null },
  timeline: RaceTimeline,
  now: Date,
  config: Pick<InteractiveRaceConfig, 'timeScale' | 'finishGraceMs'>,
): number {
  if (race.liveStartsAt === null) {
    return Infinity;
  }
  return raceEndMs(timeline) + config.finishGraceMs - liveElapsedMs(race.liveStartsAt, now, config);
}

/**
 * Komutun yazılacağı segment: gösterim sınırı, `commandSafetyMs` kadar
 * İLERİDEN hesaplanır — hesap ile yazım arasında sınır ilerlese bile komut
 * hâlâ gösterilmemiş bir segmente düşer (gösterilen geçmiş değişmez).
 */
export function commandTargetSegment(
  timeline: RaceTimeline,
  entryCount: number,
  elapsedMs: number,
  config: Pick<InteractiveRaceConfig, 'revealLeadMs' | 'commandSafetyMs'>,
): number {
  return revealedSegmentCount(
    timeline,
    entryCount,
    elapsedMs + config.commandSafetyMs,
    config.revealLeadMs,
  );
}
