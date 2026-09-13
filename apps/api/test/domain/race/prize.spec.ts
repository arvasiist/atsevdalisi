import { describe, expect, it } from 'vitest';
import type { EconomyConfig } from '@at-sevdalisi/game-config';
import economyConfigJson from '../../../../../config/economy.config.json';
import { applyPracticeRaceStakes, getPracticeRaceEntryFee, getPracticeRacePrize } from '../../../src/domain/race/prize';
import { InsufficientFundsError } from '../../../src/domain/economy/errors';

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

/**
 * BULUNAN HATA (CI, bu oturum): `applyPracticeRaceStakes` yazılmadan
 * önce bu mantık doğrudan use-case içinde `credit(afterEntryFee, prizeWon,
 * 'money')` olarak yazılmıştı. `prizeByFinishPosition`'ın son sırası
 * BİLEREK 0 olduğundan (yukarıdaki testler bunu doğruluyor), son sırayı
 * bitiren her oyuncu için `wallet.ts`'in "sıfır olmayan pozitif miktar"
 * kuralına takılıp `InvalidAmountError` fırlatıyordu — bu, eşlenmediği
 * için istemciye `500 Internal Server Error` olarak dönüyordu. Yerel
 * domain testleri bunu YAKALAYAMAMIŞTI (bu tam olarak o boşluğu dolduran
 * yeni testlerdir); gerçek hata GitHub'ın robotu tarafından, rastgele
 * yarış sonucunun oyuncuyu son sıraya düşürdüğü birkaç e2e senaryosunda
 * yakalandı.
 */
describe('applyPracticeRaceStakes', () => {
  it('giriş ücretini düşer, ödülü ekler (normal durum)', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 0 }, 50, 200);
    expect(result.money).toBe(1000 - 50 + 200);
  });

  it('ödül SIFIR iken (son sıra) çökmeden, sadece giriş ücretini düşer', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 0 }, 50, 0);
    expect(result.money).toBe(1000 - 50);
  });

  it('giriş ücreti SIFIR iken (varsayımsal ücretsiz yarış) çökmeden, sadece ödülü ekler', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 0 }, 0, 200);
    expect(result.money).toBe(1000 + 200);
  });

  it('hem giriş ücreti hem ödül SIFIR iken bakiyeyi hiç değiştirmez', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 0 }, 0, 0);
    expect(result.money).toBe(1000);
  });

  it('bakiye giriş ücretine yetmiyorsa InsufficientFundsError fırlatır (ödül eklenmiş olsa bile)', () => {
    expect(() => applyPracticeRaceStakes({ money: 10, gems: 0 }, 50, 200)).toThrow(InsufficientFundsError);
  });

  it('gems alanını değiştirmeden korur', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 42 }, 50, 0);
    expect(result.gems).toBe(42);
  });
});
