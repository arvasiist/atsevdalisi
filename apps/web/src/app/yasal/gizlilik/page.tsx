import type { Metadata } from 'next';
import { LegalDocumentView } from '../../../features/legal/LegalDocumentView';

export const metadata: Metadata = { title: 'Gizlilik ve Çerez Politikası — At Sevdalısı' };

export default function Page(): React.ReactElement {
  return <LegalDocumentView docKey="gizlilik" />;
}
