import { redirect } from 'next/navigation';
import { stableActionHref } from '../../features/stable-actions/stable-actions';

/**
 * 08.10.2026 — bakım artık ahırın İÇİNDEDİR (sahnedeki "Bakım" simgesi).
 * Eski adres yer imi/bağlantı kırılmasın diye ahıra yönlenir; içerik
 * `features/stable-actions/CarePanel.tsx`'tedir.
 */
export default function CarePage(): never {
  redirect(stableActionHref('care'));
}
