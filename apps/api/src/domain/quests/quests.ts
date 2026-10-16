import { QUEST_METRICS, type QuestMetric, type QuestPeriod } from '@at-sevdalisi/shared-types';
import type { QuestDefinitionConfig, QuestsConfig } from '@at-sevdalisi/game-config';
import { InvalidLiveEventError } from './errors';

/**
 * GÖREV KURALLARI (02.10.2026, Faz 11-B, brief §68) — saf, framework'süz.
 *
 * - Dönem penceresi `timezoneOffsetMinutes` saat diliminde gün/hafta
 *   başından başlar (Türkiye'de gece yarısı, UTC'de değil).
 * - Görev anahtarı config'deki listeden çözülür; istemcinin gönderdiği
 *   anahtar YALNIZCA bir arama anahtarıdır (hedef/ödül config'den okunur).
 * - Etkinlik talep anahtarı `event:<id>`, dönemi etkinliğin başlangıcıdır —
 *   görevlerle AYNI tekil talep kısıtı çift ödemeyi keser.
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const DAYS_PER_WEEK = 7;
const QUEST_KEY_PATTERN = /^[a-z0-9-]{3,40}$/;

export interface QuestWindow {
  start: Date;
  end: Date;
}

export function questWindow(
  period: QuestPeriod,
  now: Date,
  config: Pick<QuestsConfig, 'timezoneOffsetMinutes' | 'weekStartsOn'>,
): QuestWindow {
  const offsetMs = config.timezoneOffsetMinutes * MS_PER_MINUTE;
  const local = now.getTime() + offsetMs;
  const localDayStart = Math.floor(local / MS_PER_DAY) * MS_PER_DAY;
  if (period === 'daily') {
    return { start: new Date(localDayStart - offsetMs), end: new Date(localDayStart - offsetMs + MS_PER_DAY) };
  }
  const weekday = new Date(localDayStart).getUTCDay();
  const sinceWeekStart = (weekday - config.weekStartsOn + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const start = localDayStart - sinceWeekStart * MS_PER_DAY - offsetMs;
  return { start: new Date(start), end: new Date(start + DAYS_PER_WEEK * MS_PER_DAY) };
}

export function isQuestMetric(value: unknown): value is QuestMetric {
  return typeof value === 'string' && (QUEST_METRICS as readonly string[]).includes(value);
}

export interface ResolvedQuest {
  period: QuestPeriod;
  definition: QuestDefinitionConfig & { metric: QuestMetric };
}

/** İstemcinin gönderdiği anahtarı config listesinden çözer; yoksa `null`. */
export function resolveQuest(rawKey: unknown, config: Pick<QuestsConfig, 'daily' | 'weekly'>): ResolvedQuest | null {
  if (typeof rawKey !== 'string' || !QUEST_KEY_PATTERN.test(rawKey)) return null;
  for (const period of ['daily', 'weekly'] as const) {
    const definition = config[period].find((quest) => quest.key === rawKey);
    if (definition && isQuestMetric(definition.metric)) {
      return { period, definition: definition as ResolvedQuest['definition'] };
    }
  }
  return null;
}

/**
 * Config bütünlüğü (test + açılışta kullanılabilir): anahtarlar tekil ve
 * kalıba uygun, ölçüt bilinen, hedef ve ödül pozitif tam sayı. Boş liste
 * kabul edilir (dönem kapatılabilir).
 */
export function validateQuestConfig(config: QuestsConfig): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const period of ['daily', 'weekly'] as const) {
    for (const quest of config[period]) {
      if (!QUEST_KEY_PATTERN.test(quest.key)) problems.push(`${quest.key}: anahtar kalıba uymuyor`);
      if (seen.has(quest.key)) problems.push(`${quest.key}: anahtar tekrar ediyor`);
      seen.add(quest.key);
      if (!isQuestMetric(quest.metric)) problems.push(`${quest.key}: bilinmeyen ölçüt ${quest.metric}`);
      if (!Number.isInteger(quest.target) || quest.target < 1) problems.push(`${quest.key}: hedef pozitif tam sayı olmalı`);
      if (!Number.isInteger(quest.rewardMoney) || quest.rewardMoney < 1) {
        problems.push(`${quest.key}: ödül pozitif tam sayı olmalı`);
      }
    }
  }
  if (!Number.isInteger(config.weekStartsOn) || config.weekStartsOn < 0 || config.weekStartsOn > DAYS_PER_WEEK - 1) {
    problems.push('weekStartsOn 0-6 olmalı');
  }
  return problems;
}

export function eventClaimKey(eventId: string): string {
  return `event:${eventId}`;
}

export function eventClaimableUntil(endsAt: Date, config: Pick<QuestsConfig['events'], 'claimGraceHours'>): Date {
  return new Date(endsAt.getTime() + config.claimGraceHours * MS_PER_HOUR);
}

/** Etkinlik oyuncuya görünür mü (yayında ya da bitmiş ama ödülü hâlâ alınabilir). */
export function isEventVisible(
  event: { startsAt: Date; endsAt: Date; archivedAt: Date | null },
  now: Date,
  config: Pick<QuestsConfig['events'], 'claimGraceHours'>,
): boolean {
  return (
    event.archivedAt === null &&
    event.startsAt.getTime() <= now.getTime() &&
    now.getTime() < eventClaimableUntil(event.endsAt, config).getTime()
  );
}

export interface LiveEventDraft {
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  rewardMoney: number;
  startsAt: Date;
  endsAt: Date;
}

function parseDate(raw: unknown, field: string): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new InvalidLiveEventError(`${field} ISO tarih olmalıdır.`);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new InvalidLiveEventError(`${field} geçerli bir tarih değil.`);
  return date;
}

function parsePositiveInt(raw: unknown, field: string, max: number): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > max) {
    throw new InvalidLiveEventError(`${field} 1-${max} arası tam sayı olmalıdır.`);
  }
  return raw;
}

/** Yönetimin gönderdiği ham gövdeyi doğrular (DTO doğrulaması esbuild altında atlanır — CLAUDE.md kural 5). */
export function parseLiveEvent(
  raw: Record<string, unknown>,
  config: QuestsConfig['events'],
  now: Date,
): LiveEventDraft {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (title === '' || title.length > config.titleMaxLength) {
    throw new InvalidLiveEventError(`Başlık 1-${config.titleMaxLength} karakter olmalıdır.`);
  }
  if (description.length > config.descriptionMaxLength) {
    throw new InvalidLiveEventError(`Açıklama en fazla ${config.descriptionMaxLength} karakter olabilir.`);
  }
  if (!isQuestMetric(raw.metric)) {
    throw new InvalidLiveEventError(`Ölçüt şunlardan biri olmalıdır: ${QUEST_METRICS.join(', ')}.`);
  }
  const target = parsePositiveInt(raw.target, 'Hedef', config.maxTarget);
  const rewardMoney = parsePositiveInt(raw.rewardMoney, 'Ödül', config.maxRewardMoney);
  const startsAt = parseDate(raw.startsAt, 'startsAt') ?? now;
  const endsAt = parseDate(raw.endsAt, 'endsAt');
  if (endsAt === null) throw new InvalidLiveEventError('Etkinliğin bitişi zorunludur.');
  if (endsAt.getTime() <= startsAt.getTime() || endsAt.getTime() <= now.getTime()) {
    throw new InvalidLiveEventError('Bitiş hem başlangıçtan hem şimdiden sonra olmalıdır.');
  }
  if (endsAt.getTime() - startsAt.getTime() > config.maxDurationDays * MS_PER_DAY) {
    throw new InvalidLiveEventError(`Etkinlik en fazla ${config.maxDurationDays} gün sürebilir.`);
  }
  return { title, description, metric: raw.metric, target, rewardMoney, startsAt, endsAt };
}
