/**
 * Yarış saatlerini okunur biçimde gösterme (01.10.2026 tasarım yenilemesi).
 *
 * Önceden lobi satırları `2026-10-01 07:26 UTC` gibi HAM bir zaman
 * yazıyordu: oyuncu hem UTC'yi kendi saatine çevirmek hem de "ne kadar
 * kaldı"yı hesaplamak zorundaydı. Burada yerel saat + göreli süre üretilir.
 * Saf fonksiyonlardır (`now` ve saat dilimi parametre) — test edilebilir.
 */

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

function dayKey(date: Date, timeZone: string | undefined): string {
  return date.toLocaleDateString('tr-TR', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** "Bugün 10:26" · "Yarın 09:00" · "3 Eki 14:30" */
export function formatRaceStart(iso: string, now: Date = new Date(), timeZone?: string): string {
  const start = new Date(iso);
  const time = start.toLocaleTimeString('tr-TR', { timeZone, hour: '2-digit', minute: '2-digit' });
  const tomorrow = new Date(now.getTime() + HOURS_PER_DAY * MINUTES_PER_HOUR * MS_PER_MINUTE);
  if (dayKey(start, timeZone) === dayKey(now, timeZone)) return `Bugün ${time}`;
  if (dayKey(start, timeZone) === dayKey(tomorrow, timeZone)) return `Yarın ${time}`;
  const day = start.toLocaleDateString('tr-TR', { timeZone, day: 'numeric', month: 'short' });
  return `${day} ${time}`;
}

/** "45 dk sonra" · "5 sa 58 dk sonra" · "2 gün sonra" · "başladı" */
export function formatTimeUntil(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((new Date(iso).getTime() - now.getTime()) / MS_PER_MINUTE);
  if (minutes <= 0) return 'başladı';
  if (minutes < MINUTES_PER_HOUR) return `${minutes} dk sonra`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    const rest = minutes % MINUTES_PER_HOUR;
    return rest === 0 ? `${hours} sa sonra` : `${hours} sa ${rest} dk sonra`;
  }
  return `${Math.floor(hours / HOURS_PER_DAY)} gün sonra`;
}
