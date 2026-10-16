import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminLiveEventView,
  LiveEventView,
  QuestBoardView,
  QuestClaimResult,
  QuestPeriodView,
} from '@at-sevdalisi/shared-types';
import { loadQuestsConfig } from '@at-sevdalisi/game-config';
import { assertStaffPermission } from '../../domain/admin/staff';
import {
  LiveEventLimitReachedError,
  LiveEventNotFoundError,
  QuestAlreadyClaimedError,
  QuestNotCompletedError,
  QuestNotFoundError,
} from '../../domain/quests/errors';
import {
  eventClaimKey,
  eventClaimableUntil,
  parseLiveEvent,
  questWindow,
  resolveQuest,
} from '../../domain/quests/quests';
import { MODERATION_REPOSITORY, type ModerationRepository } from '../ports/moderation.repository';
import {
  QUEST_REPOSITORY,
  claimId,
  type LiveEventRecord,
  type MetricWindow,
  type QuestClaimOutcome,
  type QuestRepository,
} from '../ports/quest.repository';

const config = loadQuestsConfig();
const MS_PER_HOUR = 60 * 60 * 1000;

function toAdminView(event: LiveEventRecord): AdminLiveEventView {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    metric: event.metric,
    target: event.target,
    rewardMoney: event.rewardMoney,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    createdBy: event.createdBy,
    createdAt: event.createdAt.toISOString(),
    archivedAt: event.archivedAt?.toISOString() ?? null,
    claimCount: event.claimCount,
  };
}

function settleOutcome(outcome: QuestClaimOutcome, target: number): QuestClaimResult {
  switch (outcome.kind) {
    case 'paid':
      return { rewardMoney: outcome.rewardMoney, balanceAfter: outcome.balanceAfter };
    case 'not_completed':
      throw new QuestNotCompletedError(outcome.progress, target);
    case 'already_claimed':
      throw new QuestAlreadyClaimedError();
    case 'not_found':
      throw new QuestNotFoundError();
  }
}

/**
 * GÖREVLER + ETKİNLİKLER (02.10.2026, Faz 11-B). İstemci yalnızca "hangi
 * görev" der; hedef, ödül ve ilerleme sunucudadır ve ödeme anında KİLİT
 * ALTINDA yeniden sayılır (CLAUDE.md kural 1).
 */
@Injectable()
export class QuestUseCase {
  constructor(
    @Inject(QUEST_REPOSITORY) private readonly repository: QuestRepository,
    @Inject(MODERATION_REPOSITORY) private readonly moderation: ModerationRepository,
  ) {}

  async board(playerId: string, now: Date = new Date()): Promise<QuestBoardView> {
    const daily = questWindow('daily', now, config);
    const weekly = questWindow('weekly', now, config);
    const events = await this.repository.listVisibleEvents(now, config.events.claimGraceHours * MS_PER_HOUR);

    const windows: MetricWindow[] = [
      ...config.daily.map((quest) => ({ metric: quest.metric, from: daily.start, to: daily.end }) as MetricWindow),
      ...config.weekly.map((quest) => ({ metric: quest.metric, from: weekly.start, to: weekly.end }) as MetricWindow),
      ...events.map((event) => ({ metric: event.metric, from: event.startsAt, to: event.endsAt })),
    ];
    const counts = await this.repository.countMetrics(playerId, windows, config.horsePurchaseMinPrice);
    const earliest = events.reduce((min, event) => (event.startsAt < min ? event.startsAt : min), weekly.start);
    const claims = await this.repository.findClaims(playerId, earliest);

    let index = 0;
    const periodView = (period: 'daily' | 'weekly', window: { start: Date; end: Date }): QuestPeriodView => ({
      period,
      startsAt: window.start.toISOString(),
      endsAt: window.end.toISOString(),
      quests: config[period].map((quest) => ({
        key: quest.key,
        metric: quest.metric as QuestPeriodView['quests'][number]['metric'],
        target: quest.target,
        progress: counts[index++] ?? 0,
        rewardMoney: quest.rewardMoney,
        claimed: claims.has(claimId(quest.key, window.start)),
      })),
    });
    const dailyView = periodView('daily', daily);
    const weeklyView = periodView('weekly', weekly);
    const eventViews: LiveEventView[] = events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      metric: event.metric,
      target: event.target,
      progress: counts[index++] ?? 0,
      rewardMoney: event.rewardMoney,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      claimableUntil: eventClaimableUntil(event.endsAt, config.events).toISOString(),
      claimed: claims.has(claimId(eventClaimKey(event.id), event.startsAt)),
    }));
    return { daily: dailyView, weekly: weeklyView, events: eventViews };
  }

  async claimQuest(playerId: string, rawKey: unknown, now: Date = new Date()): Promise<QuestClaimResult> {
    const resolved = resolveQuest(rawKey, config);
    if (resolved === null) throw new QuestNotFoundError();
    const window = questWindow(resolved.period, now, config);
    const outcome = await this.repository.claim({
      playerId,
      questKey: resolved.definition.key,
      periodStart: window.start,
      progressWindow: { metric: resolved.definition.metric, from: window.start, to: window.end },
      target: resolved.definition.target,
      rewardMoney: resolved.definition.rewardMoney,
      ledgerType: 'quest_reward',
      liveEventId: null,
      claimableUntil: null,
      horsePurchaseMinPrice: config.horsePurchaseMinPrice,
      now,
    });
    return settleOutcome(outcome, resolved.definition.target);
  }

  async claimEvent(playerId: string, eventId: string, now: Date = new Date()): Promise<QuestClaimResult> {
    const events = await this.repository.listVisibleEvents(now, config.events.claimGraceHours * MS_PER_HOUR);
    const event = events.find((candidate) => candidate.id === eventId);
    if (!event) throw new QuestNotFoundError();
    const outcome = await this.repository.claim({
      playerId,
      questKey: eventClaimKey(event.id),
      periodStart: event.startsAt,
      progressWindow: { metric: event.metric, from: event.startsAt, to: event.endsAt },
      target: event.target,
      rewardMoney: event.rewardMoney,
      ledgerType: 'event_reward',
      liveEventId: event.id,
      claimableUntil: eventClaimableUntil(event.endsAt, config.events),
      horsePurchaseMinPrice: config.horsePurchaseMinPrice,
      now,
    });
    return settleOutcome(outcome, event.target);
  }

  async createEvent(actorId: string, raw: Record<string, unknown>, now: Date = new Date()): Promise<AdminLiveEventView> {
    await this.assertCanManage(actorId);
    const draft = parseLiveEvent(raw, config.events, now);
    const created = await this.repository.createEvent({ actorId, ...draft, maxLive: config.events.maxLive, now });
    if (created === 'limit_reached') throw new LiveEventLimitReachedError(config.events.maxLive);
    return toAdminView(created);
  }

  async archiveEvent(actorId: string, eventId: string, now: Date = new Date()): Promise<AdminLiveEventView> {
    await this.assertCanManage(actorId);
    const archived = await this.repository.archiveEvent(actorId, eventId, now);
    if (archived === null) throw new LiveEventNotFoundError();
    return toAdminView(archived);
  }

  async listEventsForAdmin(actorId: string): Promise<AdminLiveEventView[]> {
    await this.assertCanManage(actorId);
    return (await this.repository.listEventsForAdmin(config.events.adminListLimit)).map(toAdminView);
  }

  /** 403 önce, 404 sonra — yetki veri okumadan ÖNCE (CLAUDE.md). */
  private async assertCanManage(actorId: string): Promise<void> {
    assertStaffPermission(await this.moderation.findRole(actorId), 'events.manage');
  }
}
