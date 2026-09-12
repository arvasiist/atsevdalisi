import { describe, expect, it } from 'vitest';
import {
  applySeasonRaceResult,
  calculateSeasonEndDate,
  getSeasonStatus,
  resetSeasonProgress,
} from '../../../src/domain/season/season';
import type { Season } from '@at-sevdalisi/shared-types';

function buildSeason(overrides: Partial<Season> = {}): Season {
  return {
    id: 's1',
    name: 'Sezon 1',
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-01-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('getSeasonStatus', () => {
  it('başlangıçtan önceyse upcoming döner', () => {
    expect(getSeasonStatus(buildSeason(), new Date('2025-12-01T00:00:00.000Z'))).toBe('upcoming');
  });

  it('başlangıç ve bitiş arasındaysa active döner', () => {
    expect(getSeasonStatus(buildSeason(), new Date('2026-01-15T00:00:00.000Z'))).toBe('active');
  });

  it('bitişten sonraysa ended döner', () => {
    expect(getSeasonStatus(buildSeason(), new Date('2026-02-01T00:00:00.000Z'))).toBe('ended');
  });
});

describe('resetSeasonProgress', () => {
  it('yeni sezon için tüm sezon-kapsamlı skorları sıfırlar', () => {
    const state = resetSeasonProgress('player-1', 'season-2');
    expect(state).toEqual({
      playerId: 'player-1',
      seasonId: 'season-2',
      seasonRankingScore: 0,
      seasonWins: 0,
      seasonRacesRun: 0,
    });
  });
});

describe('applySeasonRaceResult', () => {
  it('yarış sonucunu sezon istatistiklerine biriktirir', () => {
    const initial = resetSeasonProgress('player-1', 'season-1');
    const afterWin = applySeasonRaceResult(initial, 150, true);
    expect(afterWin.seasonRankingScore).toBe(150);
    expect(afterWin.seasonWins).toBe(1);
    expect(afterWin.seasonRacesRun).toBe(1);

    const afterLoss = applySeasonRaceResult(afterWin, 40, false);
    expect(afterLoss.seasonRankingScore).toBe(190);
    expect(afterLoss.seasonWins).toBe(1);
    expect(afterLoss.seasonRacesRun).toBe(2);
  });
});

describe('calculateSeasonEndDate', () => {
  it('başlangıca durationDays kadar gün ekler', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = calculateSeasonEndDate(start, 30);
    expect(end.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});
