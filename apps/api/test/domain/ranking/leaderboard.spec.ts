import { describe, expect, it } from 'vitest';
import { buildLeaderboard, filterLeaderboardByScope, findPlayerRank } from '../../../src/domain/ranking/leaderboard';
import type { LeaderboardEntry } from '@at-sevdalisi/shared-types';

function entry(playerId: string, score: number, scope: LeaderboardEntry['scope'] = 'global', scopeKey: string | null = null): LeaderboardEntry {
  return { playerId, score, scope, scopeKey, updatedAt: new Date().toISOString() };
}

describe('buildLeaderboard', () => {
  it('puana göre yüksekten düşüğe sıralar', () => {
    const ranked = buildLeaderboard([entry('low', 10), entry('high', 100), entry('mid', 50)]);
    expect(ranked.map((r) => r.playerId)).toEqual(['high', 'mid', 'low']);
  });

  it('rank 1\'den başlar', () => {
    const ranked = buildLeaderboard([entry('a', 100), entry('b', 50)]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });

  it('eşit puanlılar aynı rank\'i paylaşır, bir sonraki rank atlanır (standart yarışma sıralaması)', () => {
    const ranked = buildLeaderboard([entry('a', 100), entry('b', 100), entry('c', 50)]);
    const byId = Object.fromEntries(ranked.map((r) => [r.playerId, r.rank]));
    expect(byId.a).toBe(1);
    expect(byId.b).toBe(1);
    expect(byId.c).toBe(3); // 2 atlanır (iki kişi 1. oldu)
  });

  it('boş listede boş dizi döner', () => {
    expect(buildLeaderboard([])).toEqual([]);
  });
});

describe('filterLeaderboardByScope', () => {
  it('sadece verilen scope + scopeKey\'e ait girdileri döner', () => {
    const entries = [
      entry('a', 100, 'club', 'club-1'),
      entry('b', 90, 'club', 'club-2'),
      entry('c', 80, 'global', null),
    ];
    const clubOne = filterLeaderboardByScope(entries, 'club', 'club-1');
    expect(clubOne).toHaveLength(1);
    expect(clubOne[0].playerId).toBe('a');
  });
});

describe('findPlayerRank', () => {
  it('oyuncunun sıralanmış tablodaki satırını bulur', () => {
    const ranked = buildLeaderboard([entry('a', 100), entry('b', 50)]);
    expect(findPlayerRank(ranked, 'b')?.rank).toBe(2);
  });

  it('tabloda olmayan oyuncu için null döner', () => {
    const ranked = buildLeaderboard([entry('a', 100)]);
    expect(findPlayerRank(ranked, 'nonexistent')).toBeNull();
  });
});
