import { describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig, type RaceCalendarProgram } from '@at-sevdalisi/game-config';
import {
  calendarFieldRule,
  defaultFieldRule,
  effectiveAiFill,
  validateFieldRulesConfig,
} from '../../../src/domain/race/field-rule';
import { validateRaceCreation } from '../../../src/domain/race/lobby';
import { computePrizePayouts } from '../../../src/domain/race/prize-distribution';
import { loadEconomyConfig } from '@at-sevdalisi/game-config';

/**
 * 15.10.2026 (Aşama 3) — YETERSİZ OYUNCU KURALI. Saf kurallar burada; kilit
 * anındaki iptal + iade + bildirim `race-field-rule.e2e-spec.ts`te.
 */
const LOBBY = loadRaceLobbyConfig();
const RULES = LOBBY.fieldRules;

describe('defaultFieldRule', () => {
  it('ücretli yarış en az paidMinRealPlayers, ücretsiz freeMinRealPlayers ister', () => {
    expect(defaultFieldRule(100, true, RULES)).toEqual({ minRealPlayers: RULES.paidMinRealPlayers, aiFill: true });
    expect(defaultFieldRule(0, true, RULES)).toEqual({ minRealPlayers: RULES.freeMinRealPlayers, aiFill: true });
  });

  it('botsuz yarış en az botlessMinRealPlayers ister (ücretsiz de olsa)', () => {
    expect(defaultFieldRule(0, false, RULES).minRealPlayers).toBe(
      Math.max(RULES.freeMinRealPlayers, RULES.botlessMinRealPlayers),
    );
    expect(defaultFieldRule(100, false, RULES).aiFill).toBe(false);
  });

  it('GEREKÇE KİLİDİ: ücretli lobide tek gerçek oyuncu birinci gelse bile ücretini geri ALAMAZ', () => {
    // Havuz yalnızca gerçek oyuncunun ücreti; bota düşen pay yanar. Bu yüzden
    // ücretli varsayılan 1 olamaz — olursa bu test kırılmalı ve kural yeniden
    // tartışılmalı (oyuncudan güvenceli para almak).
    const fee = 100;
    const top5 = loadEconomyConfig().prizeDistributions.find((distribution) => distribution.id === 'top5')!;
    const [firstPrize] = computePrizePayouts(fee, top5.shares);
    expect(firstPrize!).toBeLessThan(fee);
    expect(RULES.paidMinRealPlayers).toBeGreaterThanOrEqual(2);
  });
});

describe('calendarFieldRule', () => {
  const base = LOBBY.calendar.programs[0]!;

  it('kuralı olmayan program varsayılanı alır', () => {
    const program: RaceCalendarProgram = { ...base, fieldRule: undefined };
    expect(calendarFieldRule(program, RULES)).toEqual(defaultFieldRule(program.entryFee, true, RULES));
  });

  it('programın kuralı varsayılanı ezer; eksik alan varsayılandan', () => {
    const program: RaceCalendarProgram = { ...base, entryFee: 100, fieldRule: { aiFill: false } };
    expect(calendarFieldRule(program, RULES)).toEqual({
      minRealPlayers: Math.max(RULES.paidMinRealPlayers, RULES.botlessMinRealPlayers),
      aiFill: false,
    });
    expect(calendarFieldRule({ ...program, fieldRule: { minRealPlayers: 4 } }, RULES)).toEqual({
      minRealPlayers: 4,
      aiFill: true,
    });
  });
});

describe('effectiveAiFill', () => {
  it('bot YALNIZCA yarış kuralı VE global düğme izin verirse koşar', () => {
    expect(effectiveAiFill({ minRealPlayers: 2, aiFill: true }, true)).toBe(true);
    expect(effectiveAiFill({ minRealPlayers: 2, aiFill: false }, true)).toBe(false);
    expect(effectiveAiFill({ minRealPlayers: 2, aiFill: true }, false)).toBe(false);
  });
});

describe('validateFieldRulesConfig', () => {
  it('depodaki config geçerlidir (API açılışında aynı denetim koşar)', () => {
    expect(validateFieldRulesConfig(LOBBY, LOBBY.calendar.programs)).toEqual([]);
  });

  it('bozuk değerleri reddeder', () => {
    const smallest = Math.min(...LOBBY.fieldSizes);
    expect(validateFieldRulesConfig({ ...LOBBY, fieldRules: { ...RULES, paidMinRealPlayers: 0 } }, [])).not.toEqual([]);
    expect(validateFieldRulesConfig({ ...LOBBY, fieldRules: { ...RULES, botlessMinRealPlayers: 1 } }, [])).not.toEqual(
      [],
    );
    expect(
      validateFieldRulesConfig({ ...LOBBY, fieldRules: { ...RULES, freeMinRealPlayers: smallest + 1 } }, []),
    ).not.toEqual([]);
  });

  it('programın asgari oyuncusu maxPlayersı aşamaz; botsuz program en az 2 ister', () => {
    const base = LOBBY.calendar.programs[0]!;
    expect(
      validateFieldRulesConfig(LOBBY, [{ ...base, fieldRule: { minRealPlayers: base.maxPlayers + 1 } }]),
    ).not.toEqual([]);
    expect(validateFieldRulesConfig(LOBBY, [{ ...base, fieldRule: { minRealPlayers: 1, aiFill: false } }])).not.toEqual(
      [],
    );
  });
});

describe('validateRaceCreation — yetersiz oyuncu kuralı', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const valid = {
    name: 'Kural Kupası',
    fieldSize: 8,
    maxPlayers: 8,
    entryFee: 100,
    raceType: 'paid',
    startTime: new Date(now.getTime() + 10 * 60_000).toISOString(),
    surface: 'grass',
    weather: 'sunny',
    distanceMeters: 1_600,
    tribuneFee: 0,
    spectatorCapacity: 500,
  };

  it('aiFill varsayılanı true; false kabul edilir; boolean olmayan reddedilir', () => {
    expect(validateRaceCreation(valid, LOBBY, now).value?.aiFill).toBe(true);
    expect(validateRaceCreation({ ...valid, aiFill: false }, LOBBY, now).value?.aiFill).toBe(false);
    expect(validateRaceCreation({ ...valid, aiFill: 'no' }, LOBBY, now).value).toBeNull();
  });

  it('asgari gerçek oyuncu maxPlayersı aşan yarış AÇILAMAZ (her zaman iade edilecek yarış satılmaz)', () => {
    // Bugünkü config (`minPlayers` 8) bunu zaten imkânsız kılar; kural config
    // gevşerse de geçerli kalsın diye gevşek bir config ile denenir.
    const loose = { ...LOBBY, minPlayers: 1 };
    const { value, problems } = validateRaceCreation({ ...valid, maxPlayers: 1 }, loose, now);
    expect(value).toBeNull();
    expect(problems.join(' ')).toMatch(/en az \d+ gerçek oyuncu/);
    expect(validateRaceCreation({ ...valid, maxPlayers: 1, entryFee: 0, raceType: 'free' }, loose, now).value).not.toBeNull();
  });
});
