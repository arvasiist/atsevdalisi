import type { HorsePersonalityView } from '@at-sevdalisi/shared-types';
import { personalityChips } from './personality-labels';

/** Ahır kartında atın huyu: etiket + ne işe yaradığı (title + ekran okuyucu metni). */
export function PersonalityChips({ personality }: { personality: HorsePersonalityView | undefined }) {
  const chips = personalityChips(personality);
  if (chips.length === 0) return null;
  return (
    <div className="personality-chips" aria-label="Kişilik">
      {chips.map((chip) => (
        <span key={chip.key} className="personality-chip" title={chip.hint}>
          {chip.label}
          <span className="sr-only"> — {chip.hint}</span>
        </span>
      ))}
    </div>
  );
}
