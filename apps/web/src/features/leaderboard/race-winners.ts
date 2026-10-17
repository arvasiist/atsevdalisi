/**
 * KAZANANLAR TABLOSU (16.10.2026, brief §12) — saf yardımcılar. Satırlar
 * sunucudan (`GET /leaderboard/winners`); burada yalnızca biçim ve sorgu.
 */

/** 70250 → "1:10.25" (dakika:saniye.salise). */
export function formatFinalTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalCentis = Math.round(ms / 10);
  const minutes = Math.floor(totalCentis / 6000);
  const seconds = Math.floor((totalCentis % 6000) / 100);
  const centis = totalCentis % 100;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Ekrandaki "başlangıç / bitiş günü" (bitiş DAHİL) → sunucunun `[from, to)`
 * sorgusu. Boş alan gönderilmez; bitiş başlangıçtan önceyse sorun cümlesi.
 */
export function buildWinnersQuery(
  fromDay: string,
  toDay: string,
  before: string | null,
): { ok: true; query: Record<string, string> } | { ok: false; problem: string } {
  const query: Record<string, string> = {};
  if (fromDay) query.from = fromDay;
  if (toDay) query.to = nextDay(toDay);
  if (fromDay && toDay && toDay < fromDay) return { ok: false, problem: 'Bitiş günü başlangıçtan önce olamaz.' };
  if (before) query.before = before;
  return { ok: true, query };
}
