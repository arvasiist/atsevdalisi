import { describe, expect, it } from 'vitest';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';
import { loadBreedsConfig, loadEconomyConfig, type EconomyConfig } from '@at-sevdalisi/game-config';
import { breedRacingPower } from '../../../src/domain/horse/breeds';
import {
  findPracticeRaceClass,
  horseRacingPower,
  isHorseAllowedInPracticeClass,
  practiceBotStatRange,
  validatePracticeRaceClasses,
} from '../../../src/domain/race/practice-class';
import { DEFAULT_RACE_TACTIC } from '../../../src/domain/race/validation';
import { computeSurfaceCompatibility } from '../../../src/domain/race/track-fit';
import { computeWeightCompatibility } from '../../../src/domain/race/carried-weight';
import { HORSE_WEIGHT_POPULATION_MEAN_KG } from '../../../src/domain/horse/weight';
import { measurePracticeEv } from './race-balance-harness';

/**
 * 14.10.2026 — PRATİK YARIŞ SINIFLARI (`docs/OYUN_DONGUSU_DENETIMI.md` B1/S2).
 * Eskiden bütün kademelerin botları 45–75'ti: ücretsiz başlangıç atı en ucuz
 * kademede girişin ~%97'sini kaybediyor ve hiç kazanamıyordu.
 */
const ECONOMY = loadEconomyConfig();
const BREEDS = loadBreedsConfig();
const TRIALS = 400;

function tier(id: string) {
  return ECONOMY.raceTiers.find((entry) => entry.id === id)!;
}

/**
 * Gerçek atların ağırlık uyumu ~100'dür (botlar nötr 50). Sınıflar bu değerle
 * ölçülüp seçildi; 50 ile kurulan at canlı oyunla TUTMAZ (yaşandı: CI'da −%62).
 */
const REAL_HORSE_WEIGHT_COMPATIBILITY = computeWeightCompatibility(HORSE_WEIGHT_POPULATION_MEAN_KG);

/** Güç `power`, başlangıç atı vitalleri (sağlık 100, kondisyon 50, moral 80). */
function entrant(power: number, surfaceCompatibility = 50): RaceEntrantSnapshot {
  return {
    horseId: 'player',
    speed: power,
    stamina: power,
    acceleration: power,
    fitness: 50,
    fatigue: 0,
    health: 100,
    morale: 80,
    surfaceCompatibility,
    distanceCompatibility: 50,
    jockeySkillComposite: 50,
    form: 50,
    weightCompatibility: REAL_HORSE_WEIGHT_COMPATIBILITY,
    temperament: 50,
    tactic: DEFAULT_RACE_TACTIC,
    equipmentModifier: 1,
  } as RaceEntrantSnapshot;
}

function evShare(tierId: string, snapshot: RaceEntrantSnapshot): number {
  const raceClass = findPracticeRaceClass(ECONOMY, tierId)!;
  const result = measurePracticeEv({
    player: snapshot,
    botStatRange: practiceBotStatRange(raceClass, snapshot.speed),
    tier: tier(tierId),
    economy: ECONOMY,
    trials: TRIALS,
    seedPrefix: `practice-class-${tierId}`,
  });
  return result.meanNet / tier(tierId).entryFee;
}

describe('pratik yarış sınıfları — config', () => {
  it('config geçerli (API açılışı aynı denetimi koşar)', () => {
    expect(validatePracticeRaceClasses(ECONOMY)).toEqual([]);
  });

  it('sınıf gücü ırk gücüyle AYNI tanımdır', () => {
    for (const breed of BREEDS.breeds) {
      const stats = { speed: breed.stats.speed ?? 50, acceleration: breed.stats.acceleration ?? 50, stamina: breed.stats.stamina ?? 50 };
      expect(horseRacingPower(stats)).toBeCloseTo(breedRacingPower(breed), 10);
    }
  });

  it('ücretsiz başlangıç atı (jitter dahil) en ucuz kademeye girebilir', () => {
    const starter = BREEDS.breeds.find((breed) => breed.key === BREEDS.starterBreed)!;
    const cheapest = ECONOMY.raceTiers[0]!;
    const maxStarterPower = breedRacingPower(starter) + BREEDS.statJitter;
    expect(isHorseAllowedInPracticeClass(maxStarterPower, findPracticeRaceClass(ECONOMY, cheapest.id)!)).toBe(true);
  });

  it('kapı: tavana ULAŞAN at giremez, tavansız sınıfa herkes girer', () => {
    const local = findPracticeRaceClass(ECONOMY, 'local')!;
    expect(isHorseAllowedInPracticeClass(local.maxHorsePower! - 0.01, local)).toBe(true);
    expect(isHorseAllowedInPracticeClass(local.maxHorsePower!, local)).toBe(false);
    const top = ECONOMY.practiceRaceClasses.find((entry) => entry.maxHorsePower === null)!;
    expect(isHorseAllowedInPracticeClass(100, top)).toBe(true);
  });

  it('bozuk config REDDEDİLİR', () => {
    const broken = (practiceRaceClasses: EconomyConfig['practiceRaceClasses']) =>
      validatePracticeRaceClasses({ ...ECONOMY, practiceRaceClasses });
    const classes = ECONOMY.practiceRaceClasses;
    expect(broken(classes.slice(1))).not.toEqual([]); // bir kademenin sınıfı yok
    expect(broken(classes.map((entry) => ({ ...entry, maxHorsePower: 90 })))).not.toEqual([]); // tavansız yok + artmıyor
    expect(broken([{ ...classes[0]!, botStatRange: [60, 40] }, ...classes.slice(1)])).not.toEqual([]);
    expect(broken([...classes, { tierId: 'yok', botStatRange: [40, 60], maxHorsePower: null }])).not.toEqual([]);
    const swapped = [classes[1]!, classes[0]!, ...classes.slice(2)].map((entry, index) => ({ ...entry, tierId: classes[index]!.tierId }));
    expect(broken(swapped)).not.toEqual([]); // alt kademe üstten güçlü
  });
});

describe('pratik yarış sınıfları — ölçülen denge (motor değişmedi)', () => {
  it('başlangıç atı en ucuz kademede YAKLAŞIK BAŞA BAŞ (eskiden girişin ~%97si kayıptı)', () => {
    const starter = BREEDS.breeds.find((breed) => breed.key === BREEDS.starterBreed)!;
    const snapshot = entrant(
      breedRacingPower(starter),
      computeSurfaceCompatibility({ horseId: 'p', ...starter.surface } as never, 'grass'),
    );
    const share = evShare(ECONOMY.raceTiers[0]!.id, snapshot);
    expect(share).toBeGreaterThan(-0.35);
    expect(share).toBeLessThan(0.15);
  });

  it('aynı kademede güçlü at daha çok kazanır (antrenmanın karşılığı var)', () => {
    for (const raceTier of ECONOMY.raceTiers) {
      const [low, high] = findPracticeRaceClass(ECONOMY, raceTier.id)!.botStatRange;
      const middle = (low + high) / 2;
      expect(evShare(raceTier.id, entrant(middle + 6))).toBeGreaterThan(evShare(raceTier.id, entrant(middle)));
    }
  });

  it('tavana ulaşıp üst kademeye geçen at orada umutsuz değildir', () => {
    ECONOMY.raceTiers.forEach((raceTier, index) => {
      const ceiling = findPracticeRaceClass(ECONOMY, raceTier.id)!.maxHorsePower;
      const next = ECONOMY.raceTiers[index + 1];
      if (ceiling === null || next === undefined) return;
      expect(evShare(next.id, entrant(ceiling))).toBeGreaterThan(-0.6);
    });
  });
});

describe('S4 — tavansız sınıfta handikap (16.10.2026)', () => {
  const top = ECONOMY.practiceRaceClasses.find((entry) => entry.maxHorsePower === null)!;

  it('bot aralığı atın gücüyle yükselir, sınıf aralığının altına inmez, 100ü aşmaz', () => {
    expect(practiceBotStatRange(top, 50)).toEqual(top.botStatRange);
    const [low, high] = practiceBotStatRange(top, 90);
    expect(low).toBe(90 - top.handicap!.powerOffsetBelow);
    expect(high).toBe(Math.min(100, 90 + top.handicap!.powerOffsetAbove));
    expect(practiceBotStatRange(top, 100)[1]).toBe(100);
    const capped = findPracticeRaceClass(ECONOMY, 'local')!;
    expect(practiceBotStatRange(capped, 54)).toEqual(capped.botStatRange);
  });

  it('handikap yalnızca tavansız sınıfta ve pozitif ofsetle kabul edilir', () => {
    const classes = ECONOMY.practiceRaceClasses;
    const withHandicap = (index: number, handicap: { powerOffsetBelow: number; powerOffsetAbove: number }) =>
      validatePracticeRaceClasses({
        ...ECONOMY,
        practiceRaceClasses: classes.map((entry, at) => (at === index ? { ...entry, handicap } : entry)),
      });
    expect(withHandicap(0, { powerOffsetBelow: 12, powerOffsetAbove: 8 })).not.toEqual([]);
    expect(withHandicap(classes.indexOf(top), { powerOffsetBelow: 0, powerOffsetAbove: 8 })).not.toEqual([]);
  });

  it('ölçülen: güçlü at tavansız sınıfta evin parasını SINIRSIZ toplayamaz (eskiden güç 85te +%357)', () => {
    for (const power of [80, 90]) {
      const share = evShare(top.tierId, entrant(power));
      expect(share).toBeLessThan(1);
      expect(share).toBeGreaterThan(-0.6);
    }
  });
});
