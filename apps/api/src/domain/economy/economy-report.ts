import type { CanonicalTransactionType, LedgerTransactionType } from '@at-sevdalisi/shared-types';
import { CANONICAL_BY_LEDGER_TYPE, CANONICAL_TRANSACTION_TYPES } from '@at-sevdalisi/shared-types';

/**
 * GELİR-GİDER RAPORU (16.10.2026, brief §19) — saf. Defter satırları SQL'de
 * (dönem, ince tür) başına toplanır; burada kanonik aileye (`CANONICAL_BY_
 * LEDGER_TYPE` — cüzdanla AYNI eşleme) katlanır ve boş dönemler sıfırla
 * doldurulur. Dönem sınırı oyunun TEK takvim saat dilimidir
 * (`quests.timezoneOffsetMinutes`, görev/haftalık sıralamayla aynı). Yalnızca
 * çip (`money`); defterde olmayan hiçbir tutar uydurulmaz.
 */
export type EconomyReportPeriod = 'daily' | 'monthly';

export const ECONOMY_REPORT_PERIODS: readonly EconomyReportPeriod[] = ['daily', 'monthly'];

export interface LedgerBucketRow {
  /** `YYYY-MM-DD` (günlük) ya da `YYYY-MM` (aylık), oyunun saat diliminde. */
  bucket: string;
  type: LedgerTransactionType;
  income: number;
  /** Pozitif sayı (harcanan). */
  expense: number;
}

export interface EconomyReportBucket {
  key: string;
  income: number;
  expense: number;
  net: number;
}

export interface EconomyReportCategory {
  category: CanonicalTransactionType;
  income: number;
  expense: number;
}

export interface EconomyReport {
  period: EconomyReportPeriod;
  /** Eskiden yeniye, son `bucketCount` dönem (boşlar sıfır). */
  buckets: EconomyReportBucket[];
  /** Raporun bütün aralığı için kanonik aile toplamları (sıfır olanlar düşer). */
  categories: EconomyReportCategory[];
  totals: { income: number; expense: number; net: number };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `now`un oyun saat dilimindeki dönem anahtarı. */
export function reportBucketKey(date: Date, period: EconomyReportPeriod, offsetMinutes: number): string {
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  const month = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}`;
  return period === 'monthly' ? month : `${month}-${pad(local.getUTCDate())}`;
}

/** Son `count` dönemin anahtarları, eskiden yeniye. */
export function reportBucketKeys(now: Date, period: EconomyReportPeriod, offsetMinutes: number, count: number): string[] {
  const local = new Date(now.getTime() + offsetMinutes * 60_000);
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const point =
      period === 'monthly'
        ? new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - back, 1))
        : new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back));
    keys.push(reportBucketKey(point, period, 0));
  }
  return keys;
}

/** Aralığın başı (UTC an): ilk dönemin oyun saat dilimindeki başlangıcı. */
export function reportRangeStart(now: Date, period: EconomyReportPeriod, offsetMinutes: number, count: number): Date {
  const first = reportBucketKeys(now, period, offsetMinutes, count)[0]!;
  const [year, month, day] = first.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day ?? 1) - offsetMinutes * 60_000);
}

export function assembleEconomyReport(
  rows: readonly LedgerBucketRow[],
  period: EconomyReportPeriod,
  now: Date,
  offsetMinutes: number,
  bucketCount: number,
): EconomyReport {
  const keys = reportBucketKeys(now, period, offsetMinutes, bucketCount);
  const byBucket = new Map(keys.map((key) => [key, { key, income: 0, expense: 0, net: 0 }]));
  const byCategory = new Map<CanonicalTransactionType, EconomyReportCategory>();
  for (const row of rows) {
    const bucket = byBucket.get(row.bucket);
    if (!bucket) continue; // aralık dışı satır (sorgu sınırıyla oluşmaz; savunma)
    bucket.income += row.income;
    bucket.expense += row.expense;
    const category = CANONICAL_BY_LEDGER_TYPE[row.type] ?? 'ADJUSTMENT';
    const entry = byCategory.get(category) ?? { category, income: 0, expense: 0 };
    entry.income += row.income;
    entry.expense += row.expense;
    byCategory.set(category, entry);
  }
  const buckets = keys.map((key) => {
    const bucket = byBucket.get(key)!;
    return { ...bucket, net: bucket.income - bucket.expense };
  });
  const income = buckets.reduce((sum, bucket) => sum + bucket.income, 0);
  const expense = buckets.reduce((sum, bucket) => sum + bucket.expense, 0);
  return {
    period,
    buckets,
    categories: CANONICAL_TRANSACTION_TYPES.flatMap((category) => {
      const entry = byCategory.get(category);
      return entry && (entry.income > 0 || entry.expense > 0) ? [entry] : [];
    }),
    totals: { income, expense, net: income - expense },
  };
}

/** Bozuk dönem (400 `VALIDATION_ERROR`). */
export class InvalidEconomyReportPeriodError extends Error {
  constructor(readonly period: unknown) {
    super(`Rapor dönemi "daily" ya da "monthly" olmalı.`);
    this.name = 'InvalidEconomyReportPeriodError';
  }
}

export function parseEconomyReportPeriod(raw: unknown): EconomyReportPeriod {
  if (raw === undefined || raw === '') return 'daily';
  if (raw === 'daily' || raw === 'monthly') return raw;
  throw new InvalidEconomyReportPeriodError(raw);
}
