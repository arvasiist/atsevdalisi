import { describe, expect, it } from 'vitest';
import { buildWinnersQuery, formatFinalTime } from '../../../src/features/leaderboard/race-winners';

describe('kazananlar tablosu yardımcıları', () => {
  it('derece biçimi', () => {
    expect(formatFinalTime(70_250)).toBe('1:10.25');
    expect(formatFinalTime(59_999)).toBe('1:00.00');
    expect(formatFinalTime(null)).toBe('—');
  });

  it('bitiş günü dahil → sunucuya ertesi gün (to hariç); boş alan gönderilmez', () => {
    expect(buildWinnersQuery('2026-10-01', '2026-10-16', null)).toEqual({
      ok: true,
      query: { from: '2026-10-01', to: '2026-10-17' },
    });
    expect(buildWinnersQuery('', '', 'imlec')).toEqual({ ok: true, query: { before: 'imlec' } });
    expect(buildWinnersQuery('2026-10-10', '2026-10-01', null).ok).toBe(false);
  });
});
