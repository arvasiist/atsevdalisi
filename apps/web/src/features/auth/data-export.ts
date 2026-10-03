/**
 * Kişisel veri dışa aktarma (02.10.2026, KVKK/GDPR) — saf yardımcılar.
 * Dosya adı istemcide üretilir; içerik sunucudan GELDİĞİ GİBİ yazılır.
 */
import type { AccountDataExport } from '@at-sevdalisi/shared-types';

/** `at-sevdalisi-verilerim-2026-10-02.json` (tarih UTC'den, dosya adında saat yok). */
export function exportFileName(exportedAt: string): string {
  return `at-sevdalisi-verilerim-${exportedAt.slice(0, 10)}.json`;
}

/** Kırpılmış bölüm adları — ekranda dürüstçe söylenir. */
export function truncatedSections(data: AccountDataExport): string[] {
  return Object.entries(data.sections)
    .filter(([, section]) => section.truncated)
    .map(([name]) => name);
}
