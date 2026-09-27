import { describe, expect, it } from 'vitest';
import {
  assertCanAddHorseToStable,
  canAddHorseToStable,
  getMaxDefinedStableLevel,
  getNextStableUpgradeCost,
  getNextStableUpgradeOffer,
  getStableCapacity,
  summarizeStable,
} from '../../../src/domain/stable/stable';
import { MaxStableLevelReachedError, StableCapacityExceededError } from '../../../src/domain/stable/errors';
import stableConfigJson from '../../../../../config/stable.config.json';
import type { StableConfig } from '@at-sevdalisi/game-config';

const config = stableConfigJson as unknown as StableConfig;

/** brief §32 (temel kapasite), §38-39 (Ahır Özeti / Ahır Ekranı) testleri. */
describe('getStableCapacity', () => {
  it('tanımlı seviyeler için doğru kapasiteyi döner', () => {
    expect(getStableCapacity(1, config)).toBe(5);
    expect(getStableCapacity(2, config)).toBe(8);
    expect(getStableCapacity(3, config)).toBe(12);
    // FAZ 2: seviye 4-5 (ahır yükseltme) eklendi.
    expect(getStableCapacity(4, config)).toBe(16);
    expect(getStableCapacity(5, config)).toBe(20);
  });

  it('tanımsız üst seviye için en yüksek tanımlı seviyenin kapasitesine düşer', () => {
    expect(getStableCapacity(10, config)).toBe(20);
  });

  it('tanımsız alt seviye için en düşük tanımlı seviyenin kapasitesine düşer', () => {
    expect(getStableCapacity(0, config)).toBe(5);
  });
});

describe('canAddHorseToStable / assertCanAddHorseToStable', () => {
  it('kapasite dolmadan true döner', () => {
    expect(canAddHorseToStable(4, 5)).toBe(true);
  });

  it('kapasite dolunca false döner ve assert versiyonu hata fırlatır', () => {
    expect(canAddHorseToStable(5, 5)).toBe(false);
    expect(() => assertCanAddHorseToStable(5, 5)).toThrow(StableCapacityExceededError);
  });
});

describe('summarizeStable', () => {
  it('at sayısı, ortalama kondisyon ve sağlık uyarılarını doğru hesaplar', () => {
    const summary = summarizeStable(
      [
        { name: 'Şimşek', health: 90, fitness: 80 },
        { name: 'Kara Yel', health: 40, fitness: 60 },
      ],
      5,
      config,
    );
    expect(summary.horseCount).toBe(2);
    expect(summary.capacity).toBe(5);
    expect(summary.averageCondition).toBe((85 + 50) / 2);
    expect(summary.healthWarnings).toEqual(['Kara Yel']);
  });

  it('boş ahır için sıfır/boş değerler döner', () => {
    const summary = summarizeStable([], 5, config);
    expect(summary.averageCondition).toBe(0);
    expect(summary.healthWarnings).toEqual([]);
  });
});

/** FAZ 2 — brief §32 "Upgrade örneği" (ahır yükseltme maliyeti). */
describe('getNextStableUpgradeCost / getMaxDefinedStableLevel', () => {
  it('bir sonraki seviyenin maliyetini config üzerinden döner', () => {
    const cost = getNextStableUpgradeCost(1, config);
    expect(cost.nextLevel).toBe(2);
    expect(cost).toEqual({ currency: 'money', amount: 8000, nextLevel: 2 });
  });

  it('en yüksek tanımlı seviyeye ulaşılınca hata fırlatır', () => {
    const maxLevel = getMaxDefinedStableLevel(config);
    expect(maxLevel).toBe(5);
    expect(() => getNextStableUpgradeCost(maxLevel, config)).toThrow(MaxStableLevelReachedError);
  });
});

/**
 * Ahır Özeti ekranındaki "Yükselt" düğmesinin fiyat/kapasite önizlemesi.
 * `getNextStableUpgradeCost`'tan tek farkı: tavan durumunda HATA FIRLATMAZ,
 * `null` döner (bkz. fonksiyonun doc yorumu).
 */
describe('getNextStableUpgradeOffer', () => {
  it('bir sonraki seviyenin maliyetini VE o seviyedeki yeni kapasiteyi birlikte döner', () => {
    expect(getNextStableUpgradeOffer(1, config)).toEqual({
      nextLevel: 2,
      cost: { currency: 'money', amount: 8000 },
      nextCapacity: 8,
    });
  });

  it('en yüksek tanımlı seviyede hata fırlatmak yerine null döner', () => {
    // Bu, `getNextStableUpgradeCost` ile AYNI girdide AYRI davranıştır —
    // okuma yolu hata yakalamak zorunda kalmasın diye bilinçli.
    const maxLevel = getMaxDefinedStableLevel(config);
    expect(getNextStableUpgradeOffer(maxLevel, config)).toBeNull();
    expect(() => getNextStableUpgradeCost(maxLevel, config)).toThrow(MaxStableLevelReachedError);
  });

  it('tüm seviyelerde teklifin kapasitesi getStableCapacity ile TUTARLI olmalı', () => {
    // İki fonksiyon ayrı ayrı doğru olup birbirleriyle çelişebilirdi;
    // arayüzün gösterdiği "yeni kapasite" ile yükseltme SONRASI gerçek
    // kapasite aynı kaynaktan gelmeli.
    const maxLevel = getMaxDefinedStableLevel(config);
    for (let level = 1; level < maxLevel; level += 1) {
      const offer = getNextStableUpgradeOffer(level, config);
      expect(offer).not.toBeNull();
      expect(offer!.nextCapacity).toBe(getStableCapacity(offer!.nextLevel, config));
    }
  });
});
