/**
 * GÖREV METİNLERİ (02.10.2026, Faz 11-B) — saf veri. Hedef ve ödül
 * sunucudan gelir; burada yalnızca ölçütün insan dilindeki adı vardır.
 */
import type { QuestMetric } from '@at-sevdalisi/shared-types';

export const QUEST_METRIC_LABELS: Record<QuestMetric, string> = {
  races_entered: 'Yarış koş',
  race_wins: 'Yarış kazan',
  top3_finishes: 'İlk üçe gir',
  trainings: 'Antrenman yap',
  care_actions: 'Farklı bakım işi yap',
  horse_purchases: 'At satın al',
};

/** "Yarış koş 1/2" gibi; ilerleme hedefi aşsa da hedefte kırpılır. */
export function questProgressText(metric: QuestMetric, progress: number, target: number): string {
  return `${QUEST_METRIC_LABELS[metric]} · ${Math.min(progress, target)}/${target}`;
}

export type QuestState = 'claimed' | 'ready' | 'in_progress';

export function questState(quest: { progress: number; target: number; claimed: boolean }): QuestState {
  if (quest.claimed) return 'claimed';
  return quest.progress >= quest.target ? 'ready' : 'in_progress';
}

/** Kalan süre metni ("5 sa 12 dk", "2 gün 3 sa"); bittiyse "bitti". */
export function timeLeftText(endsAt: string, now: Date): string {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (ms <= 0) return 'bitti';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days} gün ${hours} sa`;
  return `${hours} sa ${minutes % 60} dk`;
}
