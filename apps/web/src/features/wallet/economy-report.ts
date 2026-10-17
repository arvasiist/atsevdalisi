/**
 * GELİR-GİDER RAPORU — saf görüntü yardımcıları (sayılar sunucudan).
 */
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** `2026-10-16` → "16 Eki"; `2026-10` → "Eki 2026". */
export function formatReportBucket(key: string, period: 'daily' | 'monthly'): string {
  const [year, month, day] = key.split('-');
  const name = MONTHS[Number(month) - 1] ?? month;
  return period === 'monthly' ? `${name} ${year}` : `${Number(day)} ${name}`;
}

/** Çubuk genişlikleri (%): en büyük gelir/gider değerine göre; boş rapor 0. */
export function reportBarWidths(
  bucket: { income: number; expense: number },
  all: ReadonlyArray<{ income: number; expense: number }>,
): { income: number; expense: number } {
  const max = Math.max(0, ...all.map((row) => Math.max(row.income, row.expense)));
  if (max === 0) return { income: 0, expense: 0 };
  return {
    income: Math.round((bucket.income / max) * 50),
    expense: Math.round((bucket.expense / max) * 50),
  };
}
