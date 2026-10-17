/**
 * Antrenman tipi etiketleri — antrenman ekranı ve antrenör uzmanlığı (personel
 * ekranı) AYNI etiketleri kullanır.
 */
import type { StaffView, TrainingType } from '@at-sevdalisi/shared-types';

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  speed: 'Hız',
  sprint: 'Sprint',
  stamina: 'Dayanıklılık',
  start: 'Çıkış',
  cornering: 'Viraj',
  tempo: 'Tempo',
  rest: 'Dinlenme',
};

const percent = (multiplier: number): string => `+%${Math.round((multiplier - 1) * 100)}`;

/**
 * 17.10.2026 (brief §13) — antrenörün uzmanlık + gelişim satırı. Çarpanlar ve
 * kalan seans sunucudan (`trainerFocus`, `sessionsToNextSkill`); antrenör
 * değilse `null`.
 */
export function describeTrainer(staff: Pick<StaffView, 'role' | 'specialization' | 'trainerFocus' | 'bonusMultiplier' | 'sessionsToNextSkill' | 'experience'>): string | null {
  if (staff.role !== 'trainer') return null;
  const label = staff.specialization ? (TRAINING_TYPE_LABELS[staff.specialization as TrainingType] ?? staff.specialization) : null;
  const focus =
    label && staff.trainerFocus
      ? `Uzmanlık: ${label} (${percent(staff.trainerFocus.matched)}; diğer antrenmanlar ${percent(staff.trainerFocus.other)})`
      : `Genel antrenör (her antrenmanda ${percent(staff.bonusMultiplier)})`;
  const growth =
    staff.sessionsToNextSkill === null
      ? `Deneyim ${staff.experience} · beceri tavanda`
      : `Deneyim ${staff.experience} · ${staff.sessionsToNextSkill} seans sonra beceri +1`;
  return `${focus} · ${growth}`;
}
