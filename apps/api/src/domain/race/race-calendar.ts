import type { RaceCalendarProgram, RaceLobbyConfig } from '@at-sevdalisi/game-config';
import type { RaceCreationInput } from './lobby';

/**
 * YARIŞ TAKVİMİ (01.10.2026) — saf yuva hesabı.
 *
 * Bir programın yuvaları UTC çağından hizalıdır: başlangıç dakikası
 * `k × intervalMinutes + offsetMinutes`. Hizalama sayesinde sunucu
 * yeniden başlasa ya da iki örnek aynı anda çalışsa da AYNI anlar üretilir
 * — tekrar koruması `race_calendar_slots (program_id, start_time)` birincil
 * anahtarıdır, saat kayması bir "ikinci yarış" doğuramaz.
 *
 * `now` parametredir (gizli zaman kaynağı yok — `validateRaceCreation` ile
 * aynı ilke).
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

export interface CalendarWindow {
  horizonHours: number;
  minLeadMinutes: number;
}

/** `[now + minLead, now + horizon]` aralığındaki yuva başlangıçları (artan). */
export function computeCalendarSlotTimes(
  now: Date,
  program: Pick<RaceCalendarProgram, 'intervalMinutes' | 'offsetMinutes'>,
  window: CalendarWindow,
): Date[] {
  const intervalMs = program.intervalMinutes * MS_PER_MINUTE;
  const offsetMs = program.offsetMinutes * MS_PER_MINUTE;
  if (!(intervalMs > 0)) return [];
  const earliest = now.getTime() + window.minLeadMinutes * MS_PER_MINUTE;
  const latest = now.getTime() + window.horizonHours * MS_PER_HOUR;
  const slots: Date[] = [];
  let k = Math.ceil((earliest - offsetMs) / intervalMs);
  for (let t = k * intervalMs + offsetMs; t <= latest; k += 1, t = k * intervalMs + offsetMs) {
    slots.push(new Date(t));
  }
  return slots;
}

/** Bir programı oyuncunun yarış açma girdisine çevirir — AYNI doğrulayıcıdan geçsin diye. */
export function calendarProgramToCreationInput(
  program: RaceCalendarProgram,
  startTime: Date,
): RaceCreationInput {
  return {
    name: program.name,
    fieldSize: program.fieldSize,
    maxPlayers: program.maxPlayers,
    entryFee: program.entryFee,
    raceType: program.entryFee > 0 ? 'paid' : 'free',
    startTime: startTime.toISOString(),
    surface: program.surface,
    weather: program.weather,
    distanceMeters: program.distanceMeters,
    tribuneFee: program.tribuneFee,
    spectatorCapacity: program.spectatorCapacity,
    playerControl: program.playerControl ?? false,
  };
}

/** Program listesinin yapısal sorunları (yarış tanımı sorunları `validateRaceCreation`ın işidir). */
export function validateCalendarPrograms(calendar: RaceLobbyConfig['calendar']): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const program of calendar.programs) {
    if (!/^[a-z0-9-]{1,40}$/.test(program.id)) {
      problems.push(`Program kimliği geçersiz: "${program.id}".`);
    }
    if (ids.has(program.id)) {
      problems.push(`Program kimliği tekrar ediyor: "${program.id}".`);
    }
    ids.add(program.id);
    if (!Number.isInteger(program.intervalMinutes) || program.intervalMinutes < 1) {
      problems.push(`"${program.id}": intervalMinutes pozitif tam sayı olmalı.`);
    }
    if (
      !Number.isInteger(program.offsetMinutes) ||
      program.offsetMinutes < 0 ||
      program.offsetMinutes >= program.intervalMinutes
    ) {
      problems.push(`"${program.id}": offsetMinutes [0, intervalMinutes) aralığında olmalı.`);
    }
    // 02.10.2026 — program ufku: pozitif ve genel pencerenin alt sınırından büyük.
    if (
      program.horizonHours !== undefined &&
      !(Number.isFinite(program.horizonHours) && program.horizonHours * 60 > calendar.minLeadMinutes)
    ) {
      problems.push(`"${program.id}": horizonHours pozitif ve minLeadMinutes'tan uzun olmalı.`);
    }
  }
  if (!(calendar.minLeadMinutes >= 0) || !(calendar.horizonHours * 60 > calendar.minLeadMinutes)) {
    problems.push(
      'Takvim penceresi boş: horizonHours × 60, minLeadMinutes değerinden büyük olmalı.',
    );
  }
  return problems;
}
