import { describe, expect, it } from 'vitest';
import { loadSocialConfig } from '@at-sevdalisi/game-config';
import { ListRaceCompanionsUseCase } from '../../../src/application/use-cases/list-race-companions.use-case';
import type { RaceCompanionRow, SocialRepository } from '../../../src/application/ports/social.repository';
import type { AppConfigService } from '../../../src/infrastructure/config/config.service';

/**
 * `social.raceCompanionsLimit` (08.10.2026) GERÇEKTEN okunur — ölü config
 * tuzağı (CLAUDE.md `aiFillEnabled` dersi): değeri değiştirmek sorgunun
 * sınırını değiştirmelidir.
 */
describe('ListRaceCompanionsUseCase', () => {
  const row: RaceCompanionRow = {
    playerId: 'p2',
    username: 'rakip',
    displayName: 'Rakip',
    level: 3,
    sharedRaces: 2,
    lastRacedAt: new Date('2026-10-08T10:00:00Z'),
    relation: 'none',
  };

  function build(limit: number) {
    const calls: Array<{ playerId: string; limit: number }> = [];
    const repository = {
      findRaceCompanions: async (playerId: string, max: number) => {
        calls.push({ playerId, limit: max });
        return [row];
      },
    } as unknown as SocialRepository;
    const config = { social: { ...loadSocialConfig(), raceCompanionsLimit: limit } } as unknown as AppConfigService;
    return { useCase: new ListRaceCompanionsUseCase(repository, config), calls };
  }

  it('liste sınırı config değeridir ve görünüm ISO tarih taşır', async () => {
    const { useCase, calls } = build(7);
    const result = await useCase.execute('p1');
    expect(calls).toEqual([{ playerId: 'p1', limit: 7 }]);
    expect(result).toEqual([
      {
        playerId: 'p2',
        username: 'rakip',
        displayName: 'Rakip',
        level: 3,
        sharedRaces: 2,
        lastRacedAt: '2026-10-08T10:00:00.000Z',
        relation: 'none',
      },
    ]);
  });

  it('config değeri pozitif bir tam sayıdır (saf cast — yazım hatası `LIMIT undefined` olurdu)', () => {
    const limit = loadSocialConfig().raceCompanionsLimit;
    expect(Number.isInteger(limit)).toBe(true);
    expect(limit).toBeGreaterThan(0);
  });
});
