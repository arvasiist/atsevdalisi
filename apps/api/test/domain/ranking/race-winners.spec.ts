import { describe, expect, it } from 'vitest';
import {
  decodeRaceWinnersCursor,
  encodeRaceWinnersCursor,
  parseRaceWinnersQuery,
} from '../../../src/domain/ranking/race-winners';

const limits = { defaultLimit: 20, maxLimit: 50, maxRangeDays: 366 };
const raceId = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('kazananlar tablosu — sorgu kuralları', () => {
  it('imleç gidip gelir; bozuk imleç null', () => {
    const cursor = { completedAt: new Date('2026-10-16T10:00:00.123Z'), raceId };
    expect(decodeRaceWinnersCursor(encodeRaceWinnersCursor(cursor))).toEqual(cursor);
    for (const bad of ['', 'abc', '123_degil-uuid', `x_${raceId}`]) expect(decodeRaceWinnersCursor(bad)).toBeNull();
  });

  it('varsayılanlar ve üst sınır', () => {
    expect(parseRaceWinnersQuery({}, limits)).toEqual({
      ok: true,
      value: { limit: 20, from: null, to: null, before: null },
    });
    const capped = parseRaceWinnersQuery({ limit: '500' }, limits);
    expect(capped.ok && capped.value.limit).toBe(50);
  });

  it('bozuk girdi 400 (varsayılana düşmez)', () => {
    for (const raw of [
      { limit: '0' },
      { limit: 'abc' },
      { from: 'dün' },
      { to: '2026-13-45' },
      { from: '2026-10-10', to: '2026-10-01' },
      { from: '2024-01-01', to: '2026-01-01' },
      { before: 'bozuk' },
    ]) {
      expect(parseRaceWinnersQuery(raw, limits).ok, JSON.stringify(raw)).toBe(false);
    }
  });

  it('geçerli aralık ve imleç kabul edilir', () => {
    const result = parseRaceWinnersQuery(
      { from: '2026-10-01', to: '2026-10-17', before: encodeRaceWinnersCursor({ completedAt: new Date(5), raceId }) },
      limits,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.from?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(result.value.before?.raceId).toBe(raceId);
    }
  });
});
