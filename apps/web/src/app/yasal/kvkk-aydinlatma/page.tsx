import type { Metadata } from 'next';
import { LegalDocumentView } from '../../../features/legal/LegalDocumentView';

export const metadata: Metadata = { title: 'KVKK Aydınlatma Metni — At Sevdalısı' };

export default function Page(): React.ReactElement {
  return <LegalDocumentView docKey="kvkk-aydinlatma" />;
}
