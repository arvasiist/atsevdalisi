import { describe, expect, it } from 'vitest';
import {
  buildLeaderboard,
  filterLeaderboardByScope,
  findPlayerRank,
  sumRankingScores,
  type PlayerRaceOutcome,
} from '../../../src/domain/ranking/leaderboard';
import { calculateRankingScore } from '../../../src/domain/ranking/ranking-score';
import type { LeaderboardEntry } from '@at-sevdalisi/shared-types';
import type { OnlineConfig } from '@at-sevdalisi/game-config';
import onlineConfigJson from '../../../../../config/online.config.json';

const config = onlineConfigJson as unknown as OnlineConfig;

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

/**
 * brief §43 — `GET /api/v1/leaderboard`'un puan toplama adımı.
 * Beklenen değerler `config/online.config.json`'dan elle doğrulanmıştır:
 * racePerformanceWeight=1, winBonus=50, placementBonusByPlacement={1:100,2:60,3:30}.
 */
describe('sumRankingScores', () => {
  function outcome(
    playerId: string,
    performanceScore: number,
    finishPosition: number,
    finishedAt = '2026-09-01T00:00:00.000Z',
  ): PlayerRaceOutcome {
    return { playerId, performanceScore, finishPosition, finishedAt };
  }

  it('bir galibiyetin puanı performans + galibiyet bonusu + birincilik bonusudur (80 + 50 + 100)', () => {
    const totals = sumRankingScores([outcome('a', 80, 1)], config);
    expect(totals).toHaveLength(1);
    expect(totals[0].score).toBe(230);
    expect(totals[0].raceCount).toBe(1);
  });

  it('dereceye girmeyen (4.) yarış yalnızca ham performans puanı verir — bonus tablosunda 4 YOK', () => {
    const totals = sumRankingScores([outcome('a', 60, 4)], config);
    expect(totals[0].score).toBe(60);
  });

  it('aynı oyuncunun birden çok yarışı TOPLANIR ve yarış sayısı sayılır (ortalama DEĞİL)', () => {
    // 80+50+100 = 230 (galibiyet), 70+0+60 = 130 (ikincilik) → 360
    const totals = sumRankingScores([outcome('a', 80, 1), outcome('a', 70, 2)], config);
    expect(totals).toHaveLength(1);
    expect(totals[0].score).toBe(360);
    expect(totals[0].raceCount).toBe(2);
  });

  it('oyuncuları ayrı ayrı toplar', () => {
    const totals = sumRankingScores([outcome('a', 80, 1), outcome('b', 60, 4)], config);
    const byId = Object.fromEntries(totals.map((t) => [t.playerId, t.score]));
    expect(byId.a).toBe(230);
    expect(byId.b).toBe(60);
  });

  it('lastFinishedAt GİRDİ SIRASINDAN BAĞIMSIZ olarak en yeni tarihi taşır', () => {
    const totals = sumRankingScores(
      [
        outcome('a', 50, 2, '2026-09-05T00:00:00.000Z'),
        outcome('a', 50, 2, '2026-09-01T00:00:00.000Z'),
        outcome('a', 50, 2, '2026-09-09T00:00:00.000Z'),
      ],
      config,
    );
    expect(totals[0].lastFinishedAt).toBe('2026-09-09T00:00:00.000Z');
  });

  it('hiç kayıt yoksa boş dizi döner', () => {
    expect(sumRankingScores([], config)).toEqual([]);
  });

  it('puan formülü TEKRAR YAZILMAMIŞTIR: tek yarışlık sonuç calculateRankingScore ile birebir aynıdır', () => {
    // Bu testin amacı, config değiştiğinde iki fonksiyonun sessizce
    // ayrışmasını ENGELLEMEK. Elle hesaplanmış bir sayı yerine doğrudan
    // `calculateRankingScore` ile karşılaştırılır.
    for (const finishPosition of [1, 2, 3, 4]) {
      const performanceScore = 77;
      const expected = calculateRankingScore(
        { racePerformanceScore: performanceScore, isWin: finishPosition === 1, placement: finishPosition, tournamentBonus: 0 },
        config,
      );
      const totals = sumRankingScores([outcome('a', performanceScore, finishPosition)], config);
      expect(totals[0].score).toBe(expected);
    }
  });
});
