import type { HorseNeedLevel, HorseNeedsView } from '@at-sevdalisi/shared-types';

/**
 * 17.10.2026 (brief §14) — yem/su ihtiyacı satırı. Düzey ve çarpan sunucudan
 * (`PublicHorse.needs`); burada yalnızca metin ve kalan süre.
 */
const NEED_LEVEL_TEXT: Record<'feed' | 'water', Record<HorseNeedLevel, string>> = {
  feed: { ok: 'Tok', due: 'Yem zamanı', urgent: 'Aç' },
  water: { ok: 'Susuz değil', due: 'Su zamanı', urgent: 'Susuz' },
};

export interface NeedLine {
  key: 'feed' | 'water';
  icon: string;
  level: HorseNeedLevel;
  text: string;
}

function hoursLeft(dueAt: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(dueAt).getTime() - now.getTime()) / 3_600_000));
}

export function describeNeeds(needs: HorseNeedsView, now: Date): NeedLine[] {
  return (['feed', 'water'] as const).map((key) => {
    const need = needs[key];
    const label = NEED_LEVEL_TEXT[key][need.level];
    const text = need.level === 'ok' ? `${label} · ${hoursLeft(need.dueAt, now)} sa sonra ${key === 'feed' ? 'yem' : 'su'}` : label;
    return { key, icon: key === 'feed' ? '🌾' : '💧', level: need.level, text };
  });
}

/** Aç/susuz atın antrenman cezası metni; ihtiyaç karşılanmışsa `null`. */
export function needsTrainingPenalty(needs: HorseNeedsView): string | null {
  if (needs.trainingFactor >= 1) return null;
  return `Antrenman verimi −%${Math.round((1 - needs.trainingFactor) * 100)} (yem ve su ver)`;
}
