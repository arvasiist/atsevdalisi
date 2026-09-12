import { describe, expect, it } from 'vitest';
import { calculateRatingRangeAtWait, findBestMatch } from '../../../src/domain/online/matchmaking';
import onlineConfigJson from '../../../../../config/online.config.json';
import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type { MatchmakingTicket } from '@at-sevdalisi/shared-types';

const onlineConfig = onlineConfigJson as unknown as OnlineConfig;

function ticket(playerId: string, rating: number, queuedSecondsAgo: number): MatchmakingTicket {
  return {
    playerId,
    horseId: `horse-${playerId}`,
    rating,
    queuedAt: new Date(Date.now() - queuedSecondsAgo * 1000).toISOString(),
  };
}

describe('calculateRatingRangeAtWait', () => {
  it('bekleme süresi arttıkça aralık genişler', () => {
    const short = calculateRatingRangeAtWait(0, onlineConfig);
    const long = calculateRatingRangeAtWait(60, onlineConfig);
    expect(long).toBeGreaterThan(short);
  });

  it('aralık asla maxRatingRangeWidth\'i aşmaz', () => {
    const veryLong = calculateRatingRangeAtWait(100000, onlineConfig);
    expect(veryLong).toBe(onlineConfig.matchmaking.maxRatingRangeWidth);
  });
});

describe('findBestMatch', () => {
  const now = new Date();

  it('aralık içindeki en yakın reytingli rakibi seçer', () => {
    const me = ticket('me', 1000, 0);
    const candidates = [ticket('far', 1080, 0), ticket('close', 1030, 0), ticket('closer', 1010, 0)];
    const match = findBestMatch(me, candidates, onlineConfig, now);
    expect(match?.playerId).toBe('closer');
  });

  it('kendisiyle eşleşmez', () => {
    const me = ticket('me', 1000, 0);
    const match = findBestMatch(me, [ticket('me', 1000, 0)], onlineConfig, now);
    expect(match).toBeNull();
  });

  it('aralık dışındaki adaylar reddedilir, uygun aday yoksa null döner', () => {
    const me = ticket('me', 1000, 0);
    const tooFar = ticket('far', 1000 + onlineConfig.matchmaking.initialRatingRangeWidth + 500, 0);
    const match = findBestMatch(me, [tooFar], onlineConfig, now);
    expect(match).toBeNull();
  });

  it('uzun süredir bekleyen bilet için genişleyen aralık sayesinde önceden reddedilen aday artık kabul edilir', () => {
    const me = ticket('me', 1000, 120); // 120 saniyedir bekliyor → geniş aralık
    const farButNowInRange = ticket('far', 1000 + onlineConfig.matchmaking.initialRatingRangeWidth + 50, 0);
    const match = findBestMatch(me, [farButNowInRange], onlineConfig, now);
    expect(match?.playerId).toBe('far');
  });
});
