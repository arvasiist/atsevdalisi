/**
 * Yasal metin görünümü (16.10.2026). Metin `legal-documents.ts`ten, şirket
 * bilgileri `config/legal.config.json`dan. Taslakken üstte uyarı: eksik alanlar
 * listelenir — metin hukuki incelemeden geçmeden kesinleşmiş gibi görünmez.
 */
import Link from 'next/link';
import { loadLegalConfig } from '@at-sevdalisi/game-config';
import { GlassPanel } from '../../components/ui/GlassPanel';
import {
  LEGAL_DOC_ORDER,
  buildLegalDocuments,
  isLegalDraft,
  legalHref,
  missingLegalFields,
  type LegalDocKey,
} from './legal-documents';

const config = loadLegalConfig();

export function LegalDraftNotice(): React.ReactElement | null {
  if (!isLegalDraft(config)) return null;
  const missing = missingLegalFields(config);
  return (
    <p className="legal-draft" role="note" data-testid="legal-draft">
      TASLAK — bu metin hukuki incelemeden geçmedi
      {missing.length > 0 ? `; eksik bilgiler: ${missing.join(', ')}` : ''}.
    </p>
  );
}

export function LegalDocumentView({ docKey }: { docKey: LegalDocKey }): React.ReactElement {
  const doc = buildLegalDocuments(config)[docKey];
  return (
    <main className="page-container legal-page" data-testid={`legal-${docKey}`}>
      <p className="legal-breadcrumb">
        <Link href="/yasal">Gizlilik ve Şartlar</Link>
      </p>
      <h1 className="page-title">{doc.title}</h1>
      <LegalDraftNotice />
      <p className="legal-summary">
        {doc.summary} Son güncelleme: {config.lastUpdated}.
      </p>
      <GlassPanel>
        {doc.sections.map((section) => (
          <section key={section.heading} className="legal-section">
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.items ? (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </GlassPanel>
      <nav className="legal-links" aria-label="Diğer yasal metinler">
        {LEGAL_DOC_ORDER.filter((key) => key !== docKey).map((key) => (
          <Link key={key} href={legalHref(key)}>
            {buildLegalDocuments(config)[key].title}
          </Link>
        ))}
      </nav>
    </main>
  );
}

export function LegalIndexView(): React.ReactElement {
  const docs = buildLegalDocuments(config);
  return (
    <main className="page-container legal-page" data-testid="legal-index">
      <h1 className="page-title">Gizlilik ve Şartlar</h1>
      <LegalDraftNotice />
      <ul className="legal-index">
        {LEGAL_DOC_ORDER.map((key) => (
          <li key={key}>
            <GlassPanel>
              <Link href={legalHref(key)}>
                <strong>{docs[key].title}</strong>
              </Link>
              <p>{docs[key].summary}</p>
            </GlassPanel>
          </li>
        ))}
      </ul>
    </main>
  );
}
