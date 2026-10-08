import { redirect } from 'next/navigation';
import { stableActionHref } from '../../features/stable-actions/stable-actions';

/**
 * 08.10.2026 — ekipman artık ahırın İÇİNDEDİR (sahnedeki "Ekipman" simgesi).
 * Eski adres yer imi/bağlantı kırılmasın diye ahıra yönlenir; içerik
 * `features/stable-actions/EquipmentPanel.tsx`'tedir.
 */
export default function EquipmentPage(): never {
  redirect(stableActionHref('equipment'));
}
