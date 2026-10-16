import { describe, expect, it } from 'vitest';
import { isLeaderboardPeriod, periodWindow } from '../../../src/domain/ranking/period-window';

const istanbul = { timezoneOffsetMinutes: 180, weekStartsOn: 1 };

describe('sıralama dönemi penceresi (Faz 11)', () => {
  it('ay Türkiye saatiyle 1. gün 00:00 başlar; ay sonu gecesi hâlâ o aydır', () => {
    // 31.10 22:30 UTC = 01.11 01:30 İstanbul → Kasım.
    const nov = periodWindow('monthly', new Date('2026-10-31T22:30:00Z'), istanbul);
    expect(nov.start.toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(nov.end.toISOString()).toBe('2026-11-30T21:00:00.000Z');
    // 31.10 20:59 UTC = 23:59 İstanbul → Ekim.
    expect(periodWindow('monthly', new Date('2026-10-31T20:59:00Z'), istanbul).start.toISOString()).toBe(
      '2026-09-30T21:00:00.000Z',
    );
  });

  it('aralık → ocak yıl geçişi', () => {
    const dec = periodWindow('monthly', new Date('2026-12-15T12:00:00Z'), istanbul);
    expect(dec.end.toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });

  it('haftalık pencere görevlerle aynı (pazartesi)', () => {
    expect(periodWindow('weekly', new Date('2026-10-04T20:00:00Z'), istanbul).start.toISOString()).toBe(
      '2026-09-27T21:00:00.000Z',
    );
  });

  it('dönem adı doğrulaması', () => {
    expect(isLeaderboardPeriod('weekly')).toBe(true);
    expect(isLeaderboardPeriod('daily')).toBe(false);
  });
});
