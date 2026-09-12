import { describe, expect, it } from 'vitest';
import {
  checkTournamentEligibility,
  distributeTournamentPrizes,
  seedTournamentBracket,
} from '../../../src/domain/tournament/tournament';
import {
  InsufficientFundsForEntryFeeError,
  PlayerLevelTooLowError,
  TournamentFullError,
  TournamentNotOpenForRegistrationError,
} from '../../../src/domain/tournament/errors';
import onlineConfigJson from '../../../../../config/online.config.json';
import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type { Tournament } from '@at-sevdalisi/shared-types';

const onlineConfig = onlineConfigJson as unknown as OnlineConfig;

function buildTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'Bronz Kupa',
    tier: 'bronze',
    minPlayerLevel: 10,
    entryFee: 500,
    prizePool: 10000,
    maxParticipants: 8,
    status: 'registration',
    startsAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('checkTournamentEligibility', () => {
  it('tüm koşulları sağlayan bir oyuncuyu kabul eder', () => {
    expect(() => checkTournamentEligibility(buildTournament(), 3, 15, 1000)).not.toThrow();
  });

  it('kayıt kapalıysa reddeder', () => {
    expect(() => checkTournamentEligibility(buildTournament({ status: 'in_progress' }), 3, 15, 1000)).toThrow(
      TournamentNotOpenForRegistrationError,
    );
  });

  it('dolu turnuvayı reddeder', () => {
    expect(() => checkTournamentEligibility(buildTournament({ maxParticipants: 8 }), 8, 15, 1000)).toThrow(
      TournamentFullError,
    );
  });

  it('seviyesi yetersiz oyuncuyu reddeder', () => {
    expect(() => checkTournamentEligibility(buildTournament({ minPlayerLevel: 20 }), 3, 15, 1000)).toThrow(
      PlayerLevelTooLowError,
    );
  });

  it('parası yetmeyen oyuncuyu reddeder', () => {
    expect(() => checkTournamentEligibility(buildTournament({ entryFee: 5000 }), 3, 15, 1000)).toThrow(
      InsufficientFundsForEntryFeeError,
    );
  });
});

describe('seedTournamentBracket', () => {
  it('katılımcıları reytinge göre yüksekten düşüğe sıralar', () => {
    const seeds = seedTournamentBracket(['a', 'b', 'c'], { a: 1000, b: 1400, c: 1200 });
    expect(seeds.map((s) => s.playerId)).toEqual(['b', 'c', 'a']);
    expect(seeds.map((s) => s.seed)).toEqual([1, 2, 3]);
  });

  it('eşit reytingde alfabetik sıraya göre deterministik seed atar', () => {
    const seedsA = seedTournamentBracket(['zeta', 'alpha'], { zeta: 1000, alpha: 1000 });
    const seedsB = seedTournamentBracket(['zeta', 'alpha'], { zeta: 1000, alpha: 1000 });
    expect(seedsA).toEqual(seedsB);
    expect(seedsA[0].playerId).toBe('alpha');
  });

  it('reytingi bilinmeyen oyuncu 0 reyting varsayar', () => {
    const seeds = seedTournamentBracket(['known', 'unknown'], { known: 500 });
    expect(seeds[0].playerId).toBe('known');
  });
});

describe('distributeTournamentPrizes', () => {
  it('ödül havuzunu config oranlarına göre dağıtır', () => {
    const awards = distributeTournamentPrizes(['champion', 'runnerUp', 'third'], 10000, onlineConfig);
    expect(awards).toEqual([
      { playerId: 'champion', amount: 5000 },
      { playerId: 'runnerUp', amount: 3000 },
      { playerId: 'third', amount: 2000 },
    ]);
  });

  it('config\'te tanımlı olmayan dereceler ödül almaz', () => {
    const awards = distributeTournamentPrizes(['champion', 'runnerUp', 'third', 'fourth'], 10000, onlineConfig);
    expect(awards).toHaveLength(3);
  });
});
