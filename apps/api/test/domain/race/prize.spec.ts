import { describe, expect, it } from 'vitest';
import type { EconomyConfig } from '@at-sevdalisi/game-config';
import economyConfigJson from '../../../../../config/economy.config.json';
import { getPracticeRaceEntryFee, getPracticeRacePrize } from '../../../src/domain/race/prize';

/**
 * FAZ 1 wiring, dokuzuncu dilim — `player.spec.ts`/`market.spec.ts` ile
 * AYNI desen: gerçek `config/economy.config.json` içe aktarılır (elle
 * kurulmuş kısmi bir fixture DEĞİL) — böylece bu testler config dosyası
 * değiştiğinde de anlamlı kalır.
 */
const economyConfig = economyConfigJson as unknown as EconomyConfig;

describe('getPracticeRaceEntryFee', () => {
  it('temel ücret × çarpanı döner', () => {
    const expected = Math.round(economyConfig.practiceRace.baseEntryFee * economyConfig.raceEntryFeeMultiplier);
    expect(getPracticeRaceEntryFee(economyConfig)).toBe(expected);
  });

  it('her zaman bir tam sayı döner', () => {
    expect(Number.isInteger(getPracticeRaceEntryFee(economyConfig))).toBe(true);
  });
});

describe('getPracticeRacePrize', () => {
  it('1. sıraya config’teki tabloya göre en yüksek ödülü verir', () => {
    const firstPlacePrize = getPracticeRacePrize(1, economyConfig);
    const lastPlacePrize = getPracticeRacePrize(economyConfig.practiceRace.prizeByFinishPosition.length, economyConfig);
    expect(firstPlacePrize).toBeGreaterThan(lastPlacePrize);
  });

  it('tablodaki her pozisyon için config’teki değeri aynen döner', () => {
    economyConfig.practiceRace.prizeByFinishPosition.forEach((expectedPrize, index) => {
      expect(getPracticeRacePrize(index + 1, economyConfig)).toBe(expectedPrize);
    });
  });

  it('tablonun sınırları dışındaki bir sıralama için 0 döner (çökme yok)', () => {
    const outOfRange = economyConfig.practiceRace.prizeByFinishPosition.length + 5;
    expect(getPracticeRacePrize(outOfRange, economyConfig)).toBe(0);
  });

  it('geçersiz (0 veya negatif) bir sıralama için de 0 döner', () => {
    expect(getPracticeRacePrize(0, economyConfig)).toBe(0);
    expect(getPracticeRacePrize(-1, economyConfig)).toBe(0);
  });
});
