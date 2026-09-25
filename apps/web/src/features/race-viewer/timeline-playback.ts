/**
 * `RaceTimeline`'ı (brief §22-25, `docs/RACE_ENGINE.md` §5) zaman ekseninde
 * "oynatmak" için saf yardımcı fonksiyonlar. Bu dosya framework'ten
 * bağımsızdır (React/Three.js importu yoktur) ve `apps/api/src/domain/
 * race/race-interpolation.ts` ile AYNI lineer ara değerleme algoritmasını
 * uygular — ancak KASITLI OLARAK ayrı bir kopyadır, çünkü `apps/web`
 * `apps/api/src/domain/*`'a bağımlı OLAMAZ (bağımlılık yönü tersine döner,
 * aynı gerekçe `packages/shared-types/src/race.ts`'teki
 * `RaceJockeyDecision` tekrarı için de geçerlidir).
 *
 * `docs/RACE_ENGINE.md` §1 ilkesi burada da geçerlidir: bu modül YENİ bir
 * simülasyon YAPMAZ, zaten hesaplanmış (ve deterministik) segment kontrol
 * noktaları arasında saf bir ara değerleme sağlar; sonucu asla değiştirmez.
 */

import type { RaceJockeyDecision, RaceSegmentSnapshot, RaceTimeline } from '@at-sevdalisi/shared-types';

export interface InterpolatedHorseState {
  positionMeters: number;
  speedMps: number;
  /**
   * Aşağıdaki alanlar OPSİYONELDİR ve `HorseVisual`/`RaceViewer`
   * sözleşmesini genişletmez (bkz. `race-viewer/README.md` "Kapsam dışı" —
   * `HorseMarker`'ın x/z/headingRadians/color/isLeader arayüzü sabit
   * kalır). Bunlar İLERİDE (gerçek at/jokey modelleri geldiğinde) animasyon
   * durumu seçimini (gait/duruş/tökezleme/sprint) beslemek için eklendi;
   * bugün hiçbir tüketicisi yok. `stamina`/`fatigue` diğer sayısal alanlar
   * gibi lineer ara değerlenir; `lane`/`tacticalState`/`blocked`/`decision`
   * KATEGORİKTİR (ara değerlenemez) — bir sonraki kontrol noktasına kadar
   * "yürürlükte olan" değeri döndürmek için en yakın ÖNCEKİ (veya ilk/son)
   * segmentten alınır.
   */
  stamina?: number;
  fatigue?: number;
  lane?: number;
  tacticalState?: string;
  blocked?: boolean;
  decision?: RaceJockeyDecision;
}

function categoricalFieldsOf(
  segment: RaceSegmentSnapshot,
): Pick<InterpolatedHorseState, 'lane' | 'tacticalState' | 'blocked' | 'decision'> {
  return {
    lane: segment.lane,
    tacticalState: segment.tacticalState,
    blocked: segment.blocked,
    decision: segment.decision,
  };
}

/**
 * Belirli bir at için, verilen `timestampMs` anındaki pozisyon/hızı, en
 * yakın iki segment kontrol noktası arasında lineer ara değerleyerek
 * döner. `timestampMs` ilk kontrol noktasından ÖNCEYSE start çizgisinden;
 * SONRAYSA son kontrol noktasında sabit kalır.
 */
export function interpolateHorseStateAtTime(
  segments: RaceSegmentSnapshot[],
  raceEntryId: string,
  timestampMs: number,
): InterpolatedHorseState {
  const horseSegments = segments
    .filter((segment) => segment.raceEntryId === raceEntryId)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (horseSegments.length === 0) {
    return { positionMeters: 0, speedMps: 0 };
  }

  const firstSegment = horseSegments[0]!;
  if (timestampMs <= firstSegment.timestampMs) {
    const fraction = firstSegment.timestampMs > 0 ? clampFraction(timestampMs / firstSegment.timestampMs) : 1;
    return {
      positionMeters: firstSegment.positionMeters * fraction,
      speedMps: firstSegment.speed,
      stamina: firstSegment.stamina,
      fatigue: firstSegment.fatigue,
      ...categoricalFieldsOf(firstSegment),
    };
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
        stamina: previous.stamina + (current.stamina - previous.stamina) * fraction,
        fatigue: previous.fatigue + (current.fatigue - previous.fatigue) * fraction,
        ...categoricalFieldsOf(previous),
      };
    }
  }

  const lastSegment = horseSegments[horseSegments.length - 1]!;
  return {
    positionMeters: lastSegment.positionMeters,
    speedMps: lastSegment.speed,
    stamina: lastSegment.stamina,
    fatigue: lastSegment.fatigue,
    ...categoricalFieldsOf(lastSegment),
  };
}

function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Bir `RaceTimeline` içindeki tüm at kimliklerini (sırasız) döner. */
export function getHorseIdsFromTimeline(timeline: RaceTimeline): string[] {
  const ids = new Set<string>();
  for (const entry of timeline.finalResult) {
    ids.add(entry.horseId);
  }
  return [...ids];
}

/** Yarışın toplam süresi (ms) — en yavaş atın bitiş zamanı. */
export function getRaceDurationMs(timeline: RaceTimeline): number {
  let maxFinishMs = 0;
  for (const entry of timeline.finalResult) {
    if (entry.finishTimeMs > maxFinishMs) {
      maxFinishMs = entry.finishTimeMs;
    }
  }
  return maxFinishMs;
}

export interface LiveLeaderboardEntry {
  horseId: string;
  rank: number;
  positionMeters: number;
  speedMps: number;
  /** Lider ata göre metre cinsinden fark (lider için her zaman 0). */
  gapToLeaderMeters: number;
  /**
   * Master Development Brief §20 "RACE HUD" — Race Engine'in zaten ürettiği
   * (bkz. `InterpolatedHorseState` doc yorumu) ama daha önce HUD'a hiç
   * TAŞINMAMIŞ olan alanlar. `stamina`/`fatigue` `interpolateHorseStateAtTime`
   * boş segment listesinde (`{ positionMeters: 0, speedMps: 0 }`) `undefined`
   * dönebildiğinden opsiyoneldir — YENİ bir veri ÜRETİLMEDİ, yalnızca
   * ZATEN VAR OLAN alanlar `LiveLeaderboardEntry`'ye kopyalandı.
   */
  stamina?: number;
  fatigue?: number;
  /** Brief'in "PACE" alanına en yakın karşılığı — motorun ürettiği taktik/stil kategorisi (bkz. `domain/race/pace.ts`). Sayısal bir "pace score" motorda YOK, uydurulmadı. */
  tacticalState?: string;
}

/**
 * `timestampMs` anındaki canlı sıralamayı (mini harita ve sıralama
 * paneli için) döner — pozisyona göre azalan sırada.
 */
export function getLiveLeaderboard(
  segments: RaceSegmentSnapshot[],
  horseIds: string[],
  timestampMs: number,
): LiveLeaderboardEntry[] {
  const states = horseIds.map((horseId) => ({
    horseId,
    ...interpolateHorseStateAtTime(segments, horseId, timestampMs),
  }));
  const sorted = [...states].sort((a, b) => b.positionMeters - a.positionMeters);
  const leaderPositionMeters = sorted[0]?.positionMeters ?? 0;

  return sorted.map((state, index) => ({
    horseId: state.horseId,
    rank: index + 1,
    positionMeters: state.positionMeters,
    speedMps: state.speedMps,
    gapToLeaderMeters: leaderPositionMeters - state.positionMeters,
    stamina: state.stamina,
    fatigue: state.fatigue,
    tacticalState: state.tacticalState,
  }));
}

/**
 * Camera Director'ın (`camera-director.ts`) OVERTAKE event'i için —
 * `timestampMs` anında herhangi bir atın bir geçiş denemesinin bloklanmış
 * olup olmadığını döner (`RaceSegmentSnapshot.blocked`, kategorik alan,
 * `interpolateHorseStateAtTime`'ın zaten hesapladığı `blocked` alanının
 * TÜM atlar üzerinde OR'lanmış hali).
 */
export function isAnyHorseBlockedAtTime(segments: RaceSegmentSnapshot[], horseIds: string[], timestampMs: number): boolean {
  return horseIds.some((horseId) => interpolateHorseStateAtTime(segments, horseId, timestampMs).blocked === true);
}

/**
 * Oynatma saatini bir kare (frame) ileri alır — `deltaMs` gerçek geçen
 * süre, `speedMultiplier` oynatma hızı (1x, 2x vb.). Sonuç her zaman
 * `[0, durationMs]` aralığına kelepçelenir (clamp), böylece oynatma
 * yarışın başından önce veya bitişinden sonra bir zamana gidemez.
 */
export function advancePlaybackTimeMs(
  currentTimeMs: number,
  deltaMs: number,
  speedMultiplier: number,
  durationMs: number,
): number {
  if (deltaMs <= 0) {
    return currentTimeMs;
  }
  const next = currentTimeMs + deltaMs * speedMultiplier;
  return Math.max(0, Math.min(durationMs, next));
}
