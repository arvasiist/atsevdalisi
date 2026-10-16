import { describe, expect, it } from 'vitest';
import { formatRaceStart, formatTimeUntil } from '../../src/lib/format-time';

const TZ = 'Europe/Istanbul';
const NOW = new Date('2026-10-01T07:00:00Z'); // İstanbul 10:00

describe('formatRaceStart', () => {
  it('aynı gün "Bugün SS:DD" — saat dilimi uygulanır (UTC değil)', () => {
    expect(formatRaceStart('2026-10-01T07:26:00Z', NOW, TZ)).toBe('Bugün 10:26');
  });

  it('ertesi gün "Yarın SS:DD"', () => {
    expect(formatRaceStart('2026-10-02T06:00:00Z', NOW, TZ)).toBe('Yarın 09:00');
  });

  it('daha ileri tarih gün + kısa ay adıyla', () => {
    expect(formatRaceStart('2026-10-05T11:30:00Z', NOW, TZ)).toMatch(/^5 Eki 14:30$/);
  });
});

describe('formatTimeUntil', () => {
  it('dakika, saat+dakika, tam saat, gün ve geçmiş', () => {
    expect(formatTimeUntil('2026-10-01T07:45:00Z', NOW)).toBe('45 dk sonra');
    expect(formatTimeUntil('2026-10-01T12:58:00Z', NOW)).toBe('5 sa 58 dk sonra');
    expect(formatTimeUntil('2026-10-01T09:00:00Z', NOW)).toBe('2 sa sonra');
    expect(formatTimeUntil('2026-10-03T08:00:00Z', NOW)).toBe('2 gün sonra');
    expect(formatTimeUntil('2026-10-01T06:59:00Z', NOW)).toBe('başladı');
  });
});
