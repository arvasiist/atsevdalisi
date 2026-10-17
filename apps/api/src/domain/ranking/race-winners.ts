/**
 * KAZANANLAR TABLOSU (16.10.2026, brief §12) — saf sorgu kuralları.
 *
 * - Sıra: tamamlanma anı (yeni → eski), eşitlikte yarış kimliği (azalan) —
 *   eşzamanlı biten yarışlar her istekte AYNI sırada görünür.
 * - Sayfalama İMLEÇLE: `before` son satırın (an, kimlik) çiftidir; sayfa
 *   arasına yeni yarış girse de satır kaybolmaz/tekrarlanmaz.
 * - Tarih aralığı `[from, to)`; en uzun `maxRangeDays`. Bozuk girdi 400 —
 *   varsayılana DÜŞMEZ (cüzdan imleciyle aynı kural: yanlış sayfa sessizce
 *   başka veri göstermesin).
 */
export interface RaceWinnersCursor {
  completedAt: Date;
  raceId: string;
}

export interface RaceWinnersQuery {
  limit: number;
  from: Date | null;
  to: Date | null;
  before: RaceWinnersCursor | null;
}

export interface RaceWinnersLimits {
  defaultLimit: number;
  maxLimit: number;
  maxRangeDays: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function encodeRaceWinnersCursor(cursor: RaceWinnersCursor): string {
  return `${cursor.completedAt.getTime()}_${cursor.raceId}`;
}

export function decodeRaceWinnersCursor(raw: string): RaceWinnersCursor | null {
  const match = /^(\d{1,15})_(.+)$/.exec(raw);
  if (!match || !UUID_PATTERN.test(match[2]!)) return null;
  const completedAt = new Date(Number(match[1]));
  return Number.isNaN(completedAt.getTime()) ? null : { completedAt, raceId: match[2]!.toLowerCase() };
}

function parseDate(raw: unknown): Date | null | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(raw)) return 'invalid';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 'invalid' : date;
}

export function parseRaceWinnersQuery(
  raw: { limit?: unknown; from?: unknown; to?: unknown; before?: unknown },
  limits: RaceWinnersLimits,
): { ok: true; value: RaceWinnersQuery } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  let limit = limits.defaultLimit;
  if (raw.limit !== undefined && raw.limit !== '') {
    const parsed = typeof raw.limit === 'string' && /^\d+$/.test(raw.limit) ? Number(raw.limit) : NaN;
    if (!Number.isInteger(parsed) || parsed < 1) problems.push('limit pozitif tam sayı olmalı.');
    else limit = Math.min(parsed, limits.maxLimit);
  }
  const from = parseDate(raw.from);
  const to = parseDate(raw.to);
  if (from === 'invalid') problems.push('from geçerli bir tarih olmalı (YYYY-AA-GG).');
  if (to === 'invalid') problems.push('to geçerli bir tarih olmalı (YYYY-AA-GG).');
  if (from instanceof Date && to instanceof Date) {
    if (!(from.getTime() < to.getTime())) problems.push('from, to tarihinden önce olmalı.');
    else if (to.getTime() - from.getTime() > limits.maxRangeDays * MS_PER_DAY) {
      problems.push(`Tarih aralığı en fazla ${limits.maxRangeDays} gün olabilir.`);
    }
  }
  let before: RaceWinnersCursor | null = null;
  if (raw.before !== undefined && raw.before !== '') {
    before = typeof raw.before === 'string' ? decodeRaceWinnersCursor(raw.before) : null;
    if (before === null) problems.push('before imleci bozuk.');
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: { limit, from: from as Date | null, to: to as Date | null, before },
  };
}

/** Bozuk sorgu (400 `VALIDATION_ERROR`). */
export class InvalidRaceWinnersQueryError extends Error {
  constructor(readonly problems: string[]) {
    super(`Kazananlar sorgusu geçersiz: ${problems.join(' ')}`);
    this.name = 'InvalidRaceWinnersQueryError';
  }
}
