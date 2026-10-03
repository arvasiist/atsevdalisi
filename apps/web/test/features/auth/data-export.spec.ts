import { describe, expect, it } from 'vitest';
import type { AccountDataExport } from '@at-sevdalisi/shared-types';
import { exportFileName, truncatedSections } from '../../../src/features/auth/data-export';

describe('veri dışa aktarma yardımcıları', () => {
  it('dosya adı tarihten', () => {
    expect(exportFileName('2026-10-02T23:59:00.000Z')).toBe('at-sevdalisi-verilerim-2026-10-02.json');
  });
  it('kırpılan bölümler listelenir', () => {
    const data = {
      exportedAt: '',
      playerId: 'p',
      sections: { messages: { rows: [], truncated: true }, horses: { rows: [], truncated: false } },
    } as unknown as AccountDataExport;
    expect(truncatedSections(data)).toEqual(['messages']);
  });
});
