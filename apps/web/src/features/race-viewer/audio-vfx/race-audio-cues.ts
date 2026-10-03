/**
 * YARIŞ SES İŞARETLERİ (01.10.2026, 3D adım 9) — oynatma durumundan
 * `RaceAudioManager` olaylarını türeten SAF fonksiyon. Motor ses olayı
 * yaymaz; olaylar istemcide, zaten ekranda olan durumdan (lider, final
 * düzlüğü, bitiş) çıkarılır — yeni bir sunucu verisi gerekmez ve hiçbir
 * sonuç/para değeri buradan etkilenmez (yalnızca ses).
 */

import type { RaceAudioEventType } from './audio-manager';

export interface RaceAudioFrame {
  /** Oynatma saati (ms). */
  timeMs: number;
  /** Kapılar açıldı mı (saat > 0 / lider yola çıktı). */
  started: boolean;
  leaderHorseId: string | undefined;
  inFinalStretch: boolean;
  isFinished: boolean;
}

export interface RaceAudioCueResult {
  events: RaceAudioEventType[];
  /** Geri sarıldı (başlamamış duruma dönüldü) → bütün döngüler susmalı. */
  reset: boolean;
  /** Son "overtake" zamanı (bir sonraki çağrıya geri verilir). */
  lastOvertakeAtMs: number | null;
}

/**
 * `prev === null` = ses yeni açıldı (ya da bileşen yeni bağlandı): yarış
 * sürüyorsa yalnızca döngüler başlar (`race_start`), kapı/işaret sesleri
 * geçmişte kaldığı için ÇALINMAZ.
 */
export function deriveRaceAudioCues(
  prev: RaceAudioFrame | null,
  next: RaceAudioFrame,
  lastOvertakeAtMs: number | null,
  config: { overtakeCooldownMs: number },
): RaceAudioCueResult {
  const events: RaceAudioEventType[] = [];
  if (prev === null) {
    if (next.started && !next.isFinished) {
      events.push('race_start');
      if (next.inFinalStretch) events.push('final_stretch');
    }
    return { events, reset: false, lastOvertakeAtMs };
  }
  if (prev.started && !next.started) {
    return { events, reset: true, lastOvertakeAtMs: null };
  }
  if (!prev.started && next.started) {
    events.push('race_start', 'gate_open', 'start_signal');
  }
  let overtakeAt = lastOvertakeAtMs;
  if (
    prev.started &&
    next.started &&
    !next.isFinished &&
    prev.leaderHorseId !== undefined &&
    next.leaderHorseId !== undefined &&
    prev.leaderHorseId !== next.leaderHorseId &&
    (overtakeAt === null || next.timeMs - overtakeAt >= config.overtakeCooldownMs)
  ) {
    events.push('overtake');
    overtakeAt = next.timeMs;
  }
  if (!prev.inFinalStretch && next.inFinalStretch && !next.isFinished) {
    events.push('final_stretch');
  }
  if (!prev.isFinished && next.isFinished && next.started) {
    events.push('finish', 'winner');
  }
  return { events, reset: false, lastOvertakeAtMs: overtakeAt };
}
