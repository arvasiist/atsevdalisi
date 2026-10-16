import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_EXPORT_SECTIONS } from '@at-sevdalisi/shared-types';
import { loadLegalConfig, type LegalConfig } from '@at-sevdalisi/game-config';
import {
  DATA_CATEGORY_BY_EXPORT_SECTION,
  LEGAL_DOC_ORDER,
  LEGAL_PLACEHOLDER,
  buildLegalDocuments,
  dataCategories,
  isLegalDraft,
  legalHref,
  missingLegalFields,
} from '../../../src/features/legal/legal-documents';
import { NAV_LINKS } from '../../../src/components/layout/nav-links';

const SRC = join(__dirname, '../../../src');
const FILLED: LegalConfig = {
  status: 'final',
  lastUpdated: '2026-10-16',
  controller: { name: 'Örnek A.Ş.', address: 'İstanbul', contactEmail: 'kvkk@ornek.test', mersisNo: '0000', kepAddress: null },
  minimumAge: 13,
  hostingProvider: 'Örnek Bulut',
  backupRetention: '30 gün',
  jurisdiction: 'İstanbul',
};

describe('yasal metinler (16.10.2026)', () => {
  it('aydınlatma metni dışa aktarılan HER veri bölümünü bir kategoride anlatır', () => {
    for (const section of ACCOUNT_EXPORT_SECTIONS) expect(DATA_CATEGORY_BY_EXPORT_SECTION[section]).toBeTruthy();
    for (const category of dataCategories()) expect(category.detail.length).toBeGreaterThan(20);
  });

  it('şirket bilgisi yokken TASLAK ve "[eklenecek]"; doldurulunca yer tutucu kalmaz', () => {
    const current = loadLegalConfig();
    expect(isLegalDraft(current)).toBe(true);
    expect(missingLegalFields(current)).toContain('şirket unvanı');
    expect(JSON.stringify(buildLegalDocuments(current))).toContain(LEGAL_PLACEHOLDER);

    expect(isLegalDraft(FILLED)).toBe(false);
    const filled = JSON.stringify(buildLegalDocuments(FILLED));
    expect(filled).not.toContain(LEGAL_PLACEHOLDER);
    expect(filled).toContain('Örnek A.Ş.');
    expect(isLegalDraft({ ...FILLED, status: 'draft' })).toBe(true);
  });

  it('her belgenin sayfası var; menüden, hesap kaydından ve mağazadan bağlanır', () => {
    for (const key of LEGAL_DOC_ORDER) {
      expect(readFileSync(join(SRC, `app${legalHref(key)}/page.tsx`), 'utf8')).toContain(`docKey="${key}"`);
      expect(buildLegalDocuments(FILLED)[key].sections.length).toBeGreaterThan(2);
    }
    expect(NAV_LINKS.some((link) => link.href === '/yasal')).toBe(true);
    const account = readFileSync(join(SRC, 'app/account/page.tsx'), 'utf8');
    expect(account).toContain('href="/yasal/kullanim-sartlari"');
    expect(account).toContain('href="/yasal/kvkk-aydinlatma"');
    expect(readFileSync(join(SRC, 'app/store/page.tsx'), 'utf8')).toContain('href="/yasal/kullanim-sartlari"');
  });
});
