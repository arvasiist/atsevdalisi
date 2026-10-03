import type { QuestMetric } from '@at-sevdalisi/shared-types';

export const QUEST_REPOSITORY = Symbol('QUEST_REPOSITORY');

export interface LiveEventRecord {
  id: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  rewardMoney: number;
  startsAt: Date;
  endsAt: Date;
  createdBy: string;
  createdAt: Date;
  archivedAt: Date | null;
  claimCount: number;
}

export interface MetricWindow {
  metric: QuestMetric;
  from: Date;
  to: Date;
}

/**
 * Talep girdisi. `progressWindow` KİLİT ALTINDA yeniden sayılır — dışarıda
 * okunmuş bir ilerlemeyle ödeme yapılmaz. `liveEventId` verilirse etkinlik
 * satırı kilitlenir ve arşivlenmemiş + talep penceresi içinde olmalıdır.
 */
export interface QuestClaimInput {
  playerId: string;
  questKey: string;
  periodStart: Date;
  progressWindow: MetricWindow;
  target: number;
  rewardMoney: number;
  ledgerType: 'quest_reward' | 'event_reward';
  liveEventId: string | null;
  /** Etkinlik ödülünün alınabileceği son an (yalnızca etkinlikte). */
  claimableUntil: Date | null;
  horsePurchaseMinPrice: number;
  now: Date;
}

export type QuestClaimOutcome =
  | { kind: 'paid'; rewardMoney: number; balanceAfter: number }
  | { kind: 'not_completed'; progress: number }
  | { kind: 'already_claimed' }
  | { kind: 'not_found' };

export interface QuestRepository {
  /** Her pencere için oyuncunun sayısı (aynı sırayla). */
  countMetrics(playerId: string, windows: MetricWindow[], horsePurchaseMinPrice: number): Promise<number[]>;
  /** Oyuncunun verilen dönem başlangıçlarından itibaren aldığı talepler (`quest_key|period_start`). */
  findClaims(playerId: string, since: Date): Promise<Set<string>>;
  claim(input: QuestClaimInput): Promise<QuestClaimOutcome>;
  /** Görünür etkinlikler: arşivlenmemiş, başlamış, talep penceresi bitmemiş. */
  listVisibleEvents(now: Date, claimGraceMs: number): Promise<LiveEventRecord[]>;
  listEventsForAdmin(limit: number): Promise<LiveEventRecord[]>;
  createEvent(input: {
    actorId: string;
    title: string;
    description: string;
    metric: QuestMetric;
    target: number;
    rewardMoney: number;
    startsAt: Date;
    endsAt: Date;
    maxLive: number;
    now: Date;
  }): Promise<LiveEventRecord | 'limit_reached'>;
  archiveEvent(actorId: string, eventId: string, now: Date): Promise<LiveEventRecord | null>;
}

export function claimId(questKey: string, periodStart: Date): string {
  return `${questKey}|${periodStart.toISOString()}`;
}
