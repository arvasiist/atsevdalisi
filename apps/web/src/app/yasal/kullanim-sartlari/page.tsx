import type { Metadata } from 'next';
import { LegalDocumentView } from '../../../features/legal/LegalDocumentView';

export const metadata: Metadata = { title: 'Kullanım Şartları — At Sevdalısı' };

export default function Page(): React.ReactElement {
  return <LegalDocumentView docKey="kullanim-sartlari" />;
}
