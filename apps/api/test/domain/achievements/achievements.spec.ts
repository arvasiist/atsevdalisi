import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_METRICS, QUEST_METRICS } from '@at-sevdalisi/shared-types';
import { loadAchievementsConfig } from '@at-sevdalisi/game-config';
import { resolveAchievement, validateAchievementConfig } from '../../../src/domain/achievements/achievements';

describe('başarım kuralları (saf)', () => {
  const config = loadAchievementsConfig();

  it('üretim config\'i geçerlidir ve boş değildir', () => {
    expect(validateAchievementConfig(config)).toEqual([]);
    expect(config.achievements.length).toBeGreaterThan(0);
  });

  it('player_level dışındaki her ölçüt görev sayım motorunda VARDIR (ikinci sayım kodu yok)', () => {
    for (const metric of ACHIEVEMENT_METRICS.filter((m) => m !== 'player_level')) {
      expect(QUEST_METRICS as readonly string[]).toContain(metric);
    }
  });

  it('oyuncuya bağlanamayan ölçütler (antrenman/bakım ata bağlı) başarım OLAMAZ', () => {
    // At satın alarak başkasının antrenmanıyla başarım + ödül açılmasın.
    expect(ACHIEVEMENT_METRICS as readonly string[]).not.toContain('trainings');
    expect(ACHIEVEMENT_METRICS as readonly string[]).not.toContain('care_actions');
  });

  it('anahtar yalnızca config listesinden çözülür; kalıp dışı/bilinmeyen null', () => {
    const first = config.achievements[0]!;
    expect(resolveAchievement(first.key, config)?.rewardMoney).toBe(first.rewardMoney);
    expect(resolveAchievement('olmayan-basarim', config)).toBeNull();
    expect(resolveAchievement('KÖTÜ', config)).toBeNull();
    expect(resolveAchievement(42, config)).toBeNull();
  });

  it('bozuk config yakalanır: tekrar eden anahtar, bilinmeyen ölçüt, sıfır hedef/ödül, profil sınırı', () => {
    const problems = validateAchievementConfig({
      achievements: [
        { key: 'aynisi', metric: 'races_entered', target: 1, rewardMoney: 1 },
        { key: 'aynisi', metric: 'trainings', target: 0, rewardMoney: 0 },
      ],
      profileLimit: 0,
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'aynisi: anahtar tekrar ediyor',
        'aynisi: bilinmeyen ölçüt trainings',
        'aynisi: hedef pozitif tam sayı olmalı',
        'aynisi: ödül pozitif tam sayı olmalı',
        'profileLimit pozitif tam sayı olmalı',
      ]),
    );
  });
});
