import { describe, expect, it } from 'vitest';
import { formatReportBucket, reportBarWidths } from '../../../src/features/wallet/economy-report';

describe('gelir-gider raporu görünümü', () => {
  it('dönem etiketi', () => {
    expect(formatReportBucket('2026-10-06', 'daily')).toBe('6 Eki');
    expect(formatReportBucket('2026-01', 'monthly')).toBe('Oca 2026');
  });

  it('çubuklar en büyük değere oranlı (her biri en fazla %50); boş rapor 0', () => {
    const all = [{ income: 200, expense: 100 }, { income: 0, expense: 50 }];
    expect(reportBarWidths(all[0]!, all)).toEqual({ income: 50, expense: 25 });
    expect(reportBarWidths({ income: 0, expense: 0 }, [{ income: 0, expense: 0 }])).toEqual({ income: 0, expense: 0 });
  });
});
