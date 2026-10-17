import { describe, expect, it } from 'vitest';
import type { StableUpgradeOfferView } from '@at-sevdalisi/shared-types';
import {
  describeComfort,
  describeStableUpgradeBlock,
  stableLevelState,
  stableUpgradeBlock,
} from '../../../src/features/stable-actions/stable-upgrade';

/** 16.10.2026 — ahır geliştirme paneli: düğme durumu sunucunun sayılarıyla. */
const offer: StableUpgradeOfferView = {
  nextLevel: 4,
  cost: { currency: 'money', amount: 45000 },
  nextCapacity: 16,
  nextName: 'Yarış Ahırı',
  nextRecoveryBonusPercent: 6,
  requiredPlayerLevel: 5,
};

describe('ahır geliştirme paneli', () => {
  it('engel sırası: tavan → oyuncu seviyesi → bakiye', () => {
    expect(stableUpgradeBlock(null, { level: 50, money: 1e9, gems: 0 })).toBe('max');
    expect(stableUpgradeBlock(offer, { level: 4, money: 1e9, gems: 0 })).toBe('level');
    expect(stableUpgradeBlock(offer, { level: 5, money: 44999, gems: 0 })).toBe('money');
    expect(stableUpgradeBlock(offer, { level: 5, money: 45000, gems: 0 })).toBeNull();
    expect(stableUpgradeBlock(offer, null)).toBe('money');
  });

  it('engel metni şartı sunucunun değeriyle yazar', () => {
    expect(describeStableUpgradeBlock('level', offer)).toContain('5. oyuncu seviyesi');
    expect(describeStableUpgradeBlock(null, offer)).toBeNull();
    expect(describeStableUpgradeBlock('max', null)).toContain('en yüksek');
  });

  it('konfor metni ve yol haritası durumu', () => {
    expect(describeComfort(0)).toBe('Konfor bonusu yok');
    expect(describeComfort(13)).toBe('Atlar %13 daha hızlı dinlenir');
    expect([1, 2, 3, 4].map((level) => stableLevelState({ level }, 2))).toEqual(['reached', 'current', 'next', 'locked']);
  });
});
