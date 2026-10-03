import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_METRICS } from '@at-sevdalisi/shared-types';
import { loadAchievementsConfig } from '@at-sevdalisi/game-config';
import { achievementProgressText, achievementTitle } from '../../../src/features/quests/achievement-labels';

describe('başarım metinleri', () => {
  it('ilk başarımlar özel ad alır, diğerleri sayıyla', () => {
    expect(achievementTitle('race_wins', 1)).toBe('İlk zafer');
    expect(achievementTitle('race_wins', 10)).toBe('10 zafer');
    expect(achievementTitle('player_level', 5)).toBe('Seviye 5');
  });

  it('her ölçüt için ad üretilir ve config\'teki başarımların adları TEKİLDİR', () => {
    for (const metric of ACHIEVEMENT_METRICS) {
      expect(achievementTitle(metric, 3).length).toBeGreaterThan(0);
    }
    const titles = loadAchievementsConfig().achievements.map((a) =>
      achievementTitle(a.metric as (typeof ACHIEVEMENT_METRICS)[number], a.target),
    );
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('ilerleme hedefte kırpılır', () => {
    expect(achievementProgressText(30, 25)).toBe('25/25');
    expect(achievementProgressText(3, 25)).toBe('3/25');
  });
});
