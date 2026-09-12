import { describe, expect, it } from 'vitest';
import { calculateRankingScore } from '../../../src/domain/ranking/ranking-score';
import onlineConfigJson from '../../../../../config/online.config.json';
import type { OnlineConfig } from '@at-sevdalisi/game-config';

const onlineConfig = onlineConfigJson as unknown as OnlineConfig;

describe('calculateRankingScore', () => {
  it('sadece race performansı olan (kazanmayan, dereceye giremeyen) bir sonuç için sadece o bileşeni sayar', () => {
    const score = calculateRankingScore(
      { racePerformanceScore: 100, isWin: false, placement: 5, tournamentBonus: 0 },
      onlineConfig,
    );
    expect(score).toBe(Math.round(100 * onlineConfig.ranking.racePerformanceWeight));
  });

  it('galibiyet WinBonus ekler', () => {
    const withoutWin = calculateRankingScore(
      { racePerformanceScore: 100, isWin: false, placement: 2, tournamentBonus: 0 },
      onlineConfig,
    );
    const withWin = calculateRankingScore(
      { racePerformanceScore: 100, isWin: true, placement: 1, tournamentBonus: 0 },
      onlineConfig,
    );
    // hem WinBonus hem 1. derece PlacementBonus'u aynı anda eklenir
    expect(withWin).toBeGreaterThan(withoutWin);
  });

  it('bilinen bir derece için PlacementBonus tam olarak config değeriyle eşleşir', () => {
    const score = calculateRankingScore(
      { racePerformanceScore: 0, isWin: false, placement: 3, tournamentBonus: 0 },
      onlineConfig,
    );
    expect(score).toBe(onlineConfig.ranking.placementBonusByPlacement['3']);
  });

  it('listede olmayan bir derece (örn. 10.) PlacementBonus almaz', () => {
    const score = calculateRankingScore(
      { racePerformanceScore: 0, isWin: false, placement: 10, tournamentBonus: 0 },
      onlineConfig,
    );
    expect(score).toBe(0);
  });

  it('placement null ise (dereceye giremedi) PlacementBonus 0 olur', () => {
    const score = calculateRankingScore(
      { racePerformanceScore: 0, isWin: false, placement: null, tournamentBonus: 0 },
      onlineConfig,
    );
    expect(score).toBe(0);
  });

  it('TournamentBonus çarpanla birlikte eklenir', () => {
    const score = calculateRankingScore(
      { racePerformanceScore: 0, isWin: false, placement: null, tournamentBonus: 100 },
      onlineConfig,
    );
    expect(score).toBe(Math.round(100 * onlineConfig.ranking.tournamentBonusMultiplier));
  });
});
