import { describe, expect, it } from 'vitest';
import {
  assembleEconomyReport,
  reportBucketKey,
  reportBucketKeys,
  reportRangeStart,
} from '../../../src/domain/economy/economy-report';

/** Türkiye saati (+180 dk) — görevlerle aynı tek takvim saat dilimi. */
const TR = 180;

describe('gelir-gider raporu', () => {
  it('dönem anahtarı oyun saat diliminde (UTC 22:30 = TR ertesi gün)', () => {
    expect(reportBucketKey(new Date('2026-10-16T22:30:00Z'), 'daily', TR)).toBe('2026-10-17');
    expect(reportBucketKey(new Date('2026-10-31T22:30:00Z'), 'monthly', TR)).toBe('2026-11');
  });

  it('son N dönem eskiden yeniye; aralık başı ilk dönemin TR gece yarısı', () => {
    const now = new Date('2026-10-17T09:00:00Z');
    expect(reportBucketKeys(now, 'daily', TR, 3)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(reportBucketKeys(now, 'monthly', TR, 3)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(reportRangeStart(now, 'daily', TR, 3).toISOString()).toBe('2026-10-14T21:00:00.000Z');
    expect(reportBucketKeys(new Date('2026-03-01T09:00:00Z'), 'monthly', TR, 3)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('kanonik aileye katlar, boş dönemleri sıfırla doldurur, toplamlar tutarlı', () => {
    const now = new Date('2026-10-17T09:00:00Z');
    const report = assembleEconomyReport(
      [
        { bucket: '2026-10-16', type: 'lobby_race_prize', income: 300, expense: 0 },
        { bucket: '2026-10-16', type: 'lobby_race_entry_fee', income: 0, expense: 100 },
        { bucket: '2026-10-17', type: 'feed_purchase', income: 0, expense: 40 },
        { bucket: '2026-10-17', type: 'equipment_purchase', income: 0, expense: 60 },
        { bucket: '2020-01-01', type: 'daily_reward', income: 999, expense: 0 },
      ],
      'daily',
      now,
      TR,
      3,
    );
    expect(report.buckets).toEqual([
      { key: '2026-10-15', income: 0, expense: 0, net: 0 },
      { key: '2026-10-16', income: 300, expense: 100, net: 200 },
      { key: '2026-10-17', income: 0, expense: 100, net: -100 },
    ]);
    expect(report.totals).toEqual({ income: 300, expense: 200, net: 100 });
    expect(report.categories).toEqual([
      { category: 'ENTRY_FEE', income: 0, expense: 100 },
      { category: 'PRIZE', income: 300, expense: 0 },
      { category: 'UPKEEP', income: 0, expense: 100 },
    ]);
  });
});
