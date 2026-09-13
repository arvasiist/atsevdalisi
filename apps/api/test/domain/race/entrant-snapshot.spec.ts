import { describe, expect, it } from 'vitest';
import type { Horse, HorseStats } from '@at-sevdalisi/shared-types';
import {
  assertValidRaceTactic,
  buildHorseEntrantSnapshot,
  NEUTRAL_UNMODELED_TRAIT_SCORE,
  UNMODELED_SNAPSHOT_FIELDS,
} from '../../../src/domain/race/entrant-snapshot';
import { InvalidRaceTacticError } from '../../../src/domain/race/errors';

function makeHorse(overrides: Partial<Horse> = {}): Horse {
  return {
    id: 'horse-1',
    ownerId: 'player-1',
    name: 'Yıldırım',
    gender: 'stallion',
    breed: 'Arabian',
    birthDate: '2023-01-01T00:00:00.000Z',
    level: 3,
    xp: 120,
    quality: 60,
    potential: 70,
    health: 90,
    fitness: 80,
    fatigue: 20,
    energy: 75,
    morale: 65,
    weightKg: 450,
    status: 'active',
    sireId: null,
    damId: null,
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeStats(overrides: Partial<HorseStats> = {}): HorseStats {
  return {
    horseId: 'horse-1',
    speed: 65,
    acceleration: 60,
    stamina: 70,
    strength: 55,
    agility: 55,
    balance: 55,
    strideLength: null,
    strideFrequency: null,
    startSpeed: 55,
    earlySpeed: 55,
    midSpeed: 55,
    finishSpeed: 55,
    sprint: 55,
    endurance: 55,
    cornering: 55,
    positioning: 55,
    temperament: 50,
    focus: 50,
    courage: 50,
    competitiveness: 50,
    stressResistance: 50,
    obedience: 50,
    ...overrides,
  };
}

const validTactic = {
  racingStyle: 'mid_pack' as const,
  riskLevel: 'normal' as const,
  startApproach: 'balanced' as const,
  finalStretchPlan: 'normal' as const,
};

describe('assertValidRaceTactic (Hata 6/7 dersi — BAĞIMSIZ domain doğrulaması)', () => {
  it('geçerli bir taktik için hata fırlatmaz', () => {
    expect(() => assertValidRaceTactic(validTactic)).not.toThrow();
  });

  it('geçersiz racingStyle için InvalidRaceTacticError fırlatır', () => {
    expect(() => assertValidRaceTactic({ ...validTactic, racingStyle: 'sprinter' as never })).toThrow(InvalidRaceTacticError);
  });

  it('geçersiz riskLevel için InvalidRaceTacticError fırlatır', () => {
    expect(() => assertValidRaceTactic({ ...validTactic, riskLevel: 'extreme' as never })).toThrow(InvalidRaceTacticError);
  });

  it('geçersiz startApproach için InvalidRaceTacticError fırlatır', () => {
    expect(() => assertValidRaceTactic({ ...validTactic, startApproach: 'reckless' as never })).toThrow(InvalidRaceTacticError);
  });

  it('geçersiz finalStretchPlan için InvalidRaceTacticError fırlatır', () => {
    expect(() => assertValidRaceTactic({ ...validTactic, finalStretchPlan: 'panic' as never })).toThrow(InvalidRaceTacticError);
  });
});

describe('buildHorseEntrantSnapshot', () => {
  it('Horse + HorseStats alanlarını doğru şekilde RaceEntrantSnapshot alanlarına eşler', () => {
    const horse = makeHorse();
    const stats = makeStats();

    const snapshot = buildHorseEntrantSnapshot(horse, stats, validTactic);

    expect(snapshot.horseId).toBe(horse.id);
    expect(snapshot.speed).toBe(stats.speed);
    expect(snapshot.stamina).toBe(stats.stamina);
    expect(snapshot.acceleration).toBe(stats.acceleration);
    expect(snapshot.fitness).toBe(horse.fitness);
    expect(snapshot.fatigue).toBe(horse.fatigue);
    expect(snapshot.health).toBe(horse.health);
    expect(snapshot.morale).toBe(horse.morale);
    expect(snapshot.tactic).toEqual(validTactic);
  });

  it('henüz modellenmeyen alanları (surfaceCompatibility/distanceCompatibility/jockeySkillComposite/form) nötr değere ayarlar', () => {
    const snapshot = buildHorseEntrantSnapshot(makeHorse(), makeStats(), validTactic);

    expect(snapshot.surfaceCompatibility).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
    expect(snapshot.distanceCompatibility).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
    expect(snapshot.jockeySkillComposite).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
    expect(snapshot.form).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
  });

  /**
   * AUDIT_AND_HARDENING Öncelik 8 (bu oturum) — "tripwire" testi: bkz.
   * `entrant-snapshot.ts` `UNMODELED_SNAPSHOT_FIELDS` doc yorumu. Bu test
   * yukarıdaki testle AYNI şeyi, ama `UNMODELED_SNAPSHOT_FIELDS`
   * LİSTESİNİN ÜZERİNDE DÖNGÜYLE doğrular — biri gelecekte bu alanlardan
   * BİRİNİ gerçek veriyle (ör. `horse_surface_stats`) bağlayıp listeyi
   * güncellemeyi UNUTURSA, bu test KIRILIR (artık nötr olmayan bir alan
   * hâlâ "unmodeled" listesinde görünmeye devam eder ama üretilen snapshot
   * artık 50 DÖNMEZ) — gap sessizce unutulamaz.
   */
  it('[TRIPWIRE] UNMODELED_SNAPSHOT_FIELDS listesindeki HER alan GERÇEKTEN nötr değer döner', () => {
    const snapshot = buildHorseEntrantSnapshot(makeHorse(), makeStats(), validTactic);

    expect(UNMODELED_SNAPSHOT_FIELDS.length).toBeGreaterThan(0);
    for (const field of UNMODELED_SNAPSHOT_FIELDS) {
      expect(snapshot[field]).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
    }
  });

  it('geçersiz bir taktikle çağrılırsa InvalidRaceTacticError fırlatır (DTO doğrulaması atlanırsa bile)', () => {
    expect(() => buildHorseEntrantSnapshot(makeHorse(), makeStats(), { ...validTactic, riskLevel: 'extreme' as never })).toThrow(
      InvalidRaceTacticError,
    );
  });
});
