/**
 * GÖREVLER + ETKİNLİKLER (02.10.2026, Faz 11-B, brief §68).
 *
 * İlerleme SAYILMAZ, TÜRETİLİR: her ölçüt mevcut tablolardan (yarış
 * katılımı, antrenman, bakım günlüğü, defter) pencere içinde sayılır —
 * ikinci bir sayaç tutulmaz, yani gerçek oyunla ayrışamaz.
 */
export const QUEST_METRICS = [
  'races_entered',
  'race_wins',
  'top3_finishes',
  'trainings',
  'care_actions',
  'horse_purchases',
] as const;

export type QuestMetric = (typeof QUEST_METRICS)[number];

export type QuestPeriod = 'daily' | 'weekly';

export interface QuestView {
  key: string;
  metric: QuestMetric;
  target: number;
  /** Pencere içinde sayılan değer (hedefi aşabilir; istemci kırpar). */
  progress: number;
  rewardMoney: number;
  claimed: boolean;
}

export interface QuestPeriodView {
  period: QuestPeriod;
  startsAt: string;
  endsAt: string;
  quests: QuestView[];
}

export interface LiveEventView {
  id: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  progress: number;
  rewardMoney: number;
  startsAt: string;
  endsAt: string;
  /** Etkinlik bittikten sonra ödülün alınabileceği son an. */
  claimableUntil: string;
  claimed: boolean;
}

export interface QuestBoardView {
  daily: QuestPeriodView;
  weekly: QuestPeriodView;
  events: LiveEventView[];
}

export interface QuestClaimResult {
  rewardMoney: number;
  balanceAfter: number;
}

export interface AdminLiveEventView {
  id: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  rewardMoney: number;
  startsAt: string;
  endsAt: string;
  createdBy: string;
  createdAt: string;
  archivedAt: string | null;
  claimCount: number;
}
