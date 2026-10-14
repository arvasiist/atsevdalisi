import { describe, expect, it } from 'vitest';
import { loadEconomyConfig, loadJockeyConfig, type JockeyConfig } from '@at-sevdalisi/game-config';
import { calculateJockeySkillComposite } from '../../../src/domain/jockey/jockey';
import {
  createJockeyCandidate,
  findMarketBand,
  jockeySalaryFor,
  planJockeyMarketRefill,
  validateJockeyMarketConfig,
  type JockeySkillFields,
  type MarketRandom,
} from '../../../src/domain/jockey/market';

/**
 * 14.10.2026 — kiralık jokey ARZI (`docs/OYUN_DONGUSU_DENETIMI.md` B4).
 * Eskiden üretimde vitrin boştu (jokey yalnızca geliştirme seed'indeydi).
 */
const CONFIG = loadJockeyConfig();
const MARKET = CONFIG.market;

/** Testin kendi seed'li kaynağı (mulberry32) — `crypto.randomInt` imzasıyla. */
function seededRandom(seed: number): MarketRandom {
  let state = seed >>> 0;
  return (minInclusive, maxExclusive) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return minInclusive + Math.floor(unit * (maxExclusive - minInclusive));
  };
}

const SKILL_KEYS: Array<keyof JockeySkillFields> = [
  'startSkill',
  'tacticalSkill',
  'sprintSkill',
  'horseControl',
  'riskManagement',
  'trackKnowledge',
];

function uniform(value: number): JockeySkillFields {
  return Object.fromEntries(SKILL_KEYS.map((key) => [key, value])) as unknown as JockeySkillFields;
}

describe('jokey pazarı — config', () => {
  it('config geçerli (API açılışı da aynı denetimi koşar)', () => {
    expect(validateJockeyMarketConfig(MARKET)).toEqual([]);
  });

  it('YENİ OYUNCU en düşük banttan jokey kiralayabilir (başlangıç bakiyesi yeter)', () => {
    const lowest = MARKET.bands[0]!;
    const priciestInLowestBand = jockeySalaryFor(lowest.skillMax - 0.01, MARKET);
    expect(lowest.available).toBeGreaterThan(0);
    expect(priciestInLowestBand).toBeLessThanOrEqual(loadEconomyConfig().newPlayerStartingBalance.money);
  });

  it('güçlü jokey zayıftan PAHALIDIR (bedel kompozitle azalmaz)', () => {
    let previous = -1;
    for (let composite = 0; composite <= 100; composite += 0.5) {
      const salary = jockeySalaryFor(composite, MARKET);
      expect(salary).toBeGreaterThanOrEqual(previous);
      expect(salary % MARKET.salary.roundTo).toBe(0);
      previous = salary;
    }
    const lowest = MARKET.bands[0]!;
    const highest = MARKET.bands[MARKET.bands.length - 1]!;
    expect(jockeySalaryFor(highest.skillMin, MARKET)).toBeGreaterThan(jockeySalaryFor(lowest.skillMin, MARKET));
  });

  it('bozuk config REDDEDİLİR', () => {
    const band = MARKET.bands[0]!;
    const broken = (patch: Partial<JockeyConfig['market']>) => validateJockeyMarketConfig({ ...MARKET, ...patch });
    expect(broken({ bands: [] })).not.toEqual([]);
    expect(broken({ bands: [band, { ...band }] })).not.toEqual([]); // çakışan bant
    expect(broken({ bands: [{ skillMin: 2, skillMax: 20, available: 1 }] })).not.toEqual([]); // 2 − yayılım < 0
    expect(broken({ bands: [{ skillMin: 80, skillMax: 99, available: 1 }] })).not.toEqual([]); // 99 + yayılım > 100
    expect(broken({ bands: [{ ...band, available: -1 }] })).not.toEqual([]);
    expect(broken({ firstNames: [] })).not.toEqual([]);
    expect(broken({ salary: { ...MARKET.salary, roundTo: 0 } })).not.toEqual([]);
    expect(broken({ salary: { ...MARKET.salary, min: 10_000 } })).not.toEqual([]);
  });
});

describe('jokey pazarı — aday üretimi', () => {
  it('her bantta üretilen jokeyin kompoziti O BANTTA kalır; beceriler 0..100 tam sayı', () => {
    for (const [bandIndex, band] of MARKET.bands.entries()) {
      const random = seededRandom(1_000 + bandIndex);
      let varied = 0;
      const draws = 500;
      for (let i = 0; i < draws; i += 1) {
        const jockey = createJockeyCandidate({ id: `j-${i}`, band, random }, CONFIG);
        const composite = calculateJockeySkillComposite(jockey, CONFIG);
        expect(findMarketBand(composite, MARKET.bands)).toBe(band);
        for (const key of SKILL_KEYS) {
          expect(Number.isInteger(jockey[key])).toBe(true);
          expect(jockey[key]).toBeGreaterThanOrEqual(0);
          expect(jockey[key]).toBeLessThanOrEqual(100);
        }
        expect(jockey.salary).toBe(jockeySalaryFor(composite, MARKET));
        expect(jockey.experience).toBeGreaterThanOrEqual(0);
        expect(jockey.experience).toBeLessThanOrEqual(CONFIG.experienceForMaxScore);
        const [first, last] = jockey.name.split(' ');
        expect(MARKET.firstNames).toContain(first);
        expect(MARKET.lastNames).toContain(last);
        if (new Set(SKILL_KEYS.map((key) => jockey[key])).size > 1) varied += 1;
      }
      // Jokeylerin güçlü/zayıf yanı olur — hepsi düz bir sayı değildir.
      expect(varied / draws).toBeGreaterThan(0.9);
    }
  });

  it('uç rastgele değerlerde de bantta kalır (hep en düşük / hep en yüksek)', () => {
    const lowest: MarketRandom = (min) => min;
    const highest: MarketRandom = (_min, max) => max - 1;
    for (const band of MARKET.bands) {
      for (const random of [lowest, highest]) {
        const jockey = createJockeyCandidate({ id: 'x', band, random }, CONFIG);
        expect(findMarketBand(calculateJockeySkillComposite(jockey, CONFIG), [band])).toBe(band);
      }
    }
  });
});

describe('jokey pazarı — dolum planı', () => {
  it('boş vitrin: her bant `available` kadar eksik', () => {
    expect(planJockeyMarketRefill([], CONFIG)).toEqual(
      MARKET.bands.filter((band) => band.available > 0).map((band) => ({ band, missing: band.available })),
    );
  });

  it('bir bandın fazlası BAŞKA bandın eksiğini kapatmaz; bant dışı jokey sayılmaz', () => {
    const [lowest, second] = MARKET.bands;
    const crowd = Array.from({ length: 10 }, () => uniform(second!.skillMin));
    const outside = uniform(lowest!.skillMin - 1);
    const plan = planJockeyMarketRefill([...crowd, outside], CONFIG);
    expect(plan.find((shortfall) => shortfall.band === lowest)?.missing).toBe(lowest!.available);
    expect(plan.find((shortfall) => shortfall.band === second)).toBeUndefined();
  });

  it('planın ürettikleri vitrine eklenince plan BOŞALIR (her istekte şişmez)', () => {
    const random = seededRandom(42);
    for (let round = 0; round < 50; round += 1) {
      const generated = planJockeyMarketRefill([], CONFIG).flatMap(({ band, missing }) =>
        Array.from({ length: missing }, (_, i) => createJockeyCandidate({ id: `${round}-${i}`, band, random }, CONFIG)),
      );
      expect(planJockeyMarketRefill(generated, CONFIG)).toEqual([]);
    }
  });
});
