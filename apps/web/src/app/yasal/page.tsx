import type { Metadata } from 'next';
import { LegalIndexView } from '../../features/legal/LegalDocumentView';

export const metadata: Metadata = { title: 'Gizlilik ve Şartlar — At Sevdalısı' };

export default function Page(): React.ReactElement {
  return <LegalIndexView />;
}
