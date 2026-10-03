import { ACHIEVEMENT_METRICS, type AchievementMetric } from '@at-sevdalisi/shared-types';
import type { AchievementDefinitionConfig, AchievementsConfig } from '@at-sevdalisi/game-config';

/**
 * BAŞARIM KURALLARI (03.10.2026, brief §24/§68) — saf, framework'süz.
 *
 * - Başarım yaşam boyudur: dönem yoktur, ödül oyuncu başına TEK kez alınır.
 * - İstemcinin gönderdiği anahtar yalnızca bir arama anahtarıdır; hedef ve
 *   ödül config'ten okunur (CLAUDE.md kural 1).
 */
const ACHIEVEMENT_KEY_PATTERN = /^[a-z0-9-]{3,40}$/;

export type ResolvedAchievement = AchievementDefinitionConfig & { metric: AchievementMetric };

export function isAchievementMetric(value: unknown): value is AchievementMetric {
  return typeof value === 'string' && (ACHIEVEMENT_METRICS as readonly string[]).includes(value);
}

export function resolveAchievement(
  rawKey: unknown,
  config: Pick<AchievementsConfig, 'achievements'>,
): ResolvedAchievement | null {
  if (typeof rawKey !== 'string' || !ACHIEVEMENT_KEY_PATTERN.test(rawKey)) return null;
  const definition = config.achievements.find((achievement) => achievement.key === rawKey);
  return definition && isAchievementMetric(definition.metric) ? (definition as ResolvedAchievement) : null;
}

/** Config bütünlüğü: anahtar tekil + kalıba uygun, ölçüt bilinen, hedef/ödül pozitif tam sayı. */
export function validateAchievementConfig(config: AchievementsConfig): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const achievement of config.achievements) {
    if (!ACHIEVEMENT_KEY_PATTERN.test(achievement.key)) problems.push(`${achievement.key}: anahtar kalıba uymuyor`);
    if (seen.has(achievement.key)) problems.push(`${achievement.key}: anahtar tekrar ediyor`);
    seen.add(achievement.key);
    if (!isAchievementMetric(achievement.metric)) problems.push(`${achievement.key}: bilinmeyen ölçüt ${achievement.metric}`);
    if (!Number.isInteger(achievement.target) || achievement.target < 1) {
      problems.push(`${achievement.key}: hedef pozitif tam sayı olmalı`);
    }
    if (!Number.isInteger(achievement.rewardMoney) || achievement.rewardMoney < 1) {
      problems.push(`${achievement.key}: ödül pozitif tam sayı olmalı`);
    }
  }
  if (!Number.isInteger(config.profileLimit) || config.profileLimit < 1) problems.push('profileLimit pozitif tam sayı olmalı');
  return problems;
}
