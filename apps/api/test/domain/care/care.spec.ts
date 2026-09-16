import { describe, expect, it } from 'vitest';
import { applyCareAction, applyFeed, canPerformCareAction, canRecoverFromInjury, getCareActionCost, getFeedCost } from '../../../src/domain/care/care';
import { CareActionOnCooldownError, InvalidCareInputError } from '../../../src/domain/care/errors';
import careConfig from '../../../../../config/care.config.json';
import type { CareConfig } from '@at-sevdalisi/game-config';

const config = careConfig as unknown as CareConfig;
const vitals = { health: 80, fitness: 70, fatigue: 30, energy: 60, morale: 60 };
const health = { injuryRisk: 20, recoveryRate: 40, jointCondition: 70, weightCondition: 50 };

/** brief §11 Bakım Sistemi testleri. */
describe('applyCareAction — groom (tımar)', () => {
  it('moral ve health artırır', () => {
    const result = applyCareAction(config, 'groom', vitals, health, null, new Date());
    expect(result.vitals.morale).toBeGreaterThan(vitals.morale);
    expect(result.vitals.health).toBeGreaterThan(vitals.health);
  });
});

describe('cooldown kontrolü', () => {
  it('cooldown dolmadan tekrar eylem CareActionOnCooldownError fırlatır', () => {
    const now = new Date('2026-09-12T12:00:00Z');
    expect(() => applyCareAction(config, 'groom', vitals, health, now, now)).toThrow(CareActionOnCooldownError);
  });

  it('cooldown dolunca tekrar izin verir', () => {
    const now = new Date('2026-09-12T12:00:00Z');
    const later = new Date(now.getTime() + config.actions.groom.cooldownMinutes * 60 * 1000 + 1000);
    expect(canPerformCareAction(now, later, config.actions.groom.cooldownMinutes).allowed).toBe(true);
    expect(() => applyCareAction(config, 'groom', vitals, health, now, later)).not.toThrow();
  });
});

describe('applyCareAction — vet (veteriner) & farrier (nalbant)', () => {
  it('veteriner injuryRisk azaltır, recoveryRate artırır', () => {
    const result = applyCareAction(config, 'vet', vitals, health, null, new Date());
    expect(result.health.injuryRisk).toBeLessThan(health.injuryRisk);
    expect(result.health.recoveryRate).toBeGreaterThan(health.recoveryRate);
  });

  it('nalbant jointCondition artırır, injuryRisk azaltır', () => {
    const result = applyCareAction(config, 'farrier', vitals, health, null, new Date());
    expect(result.health.jointCondition).toBeGreaterThan(health.jointCondition);
    expect(result.health.injuryRisk).toBeLessThan(health.injuryRisk);
  });

  it('değerler [0, 100] aralığını aşmaz', () => {
    const nearMax = { injuryRisk: 2, recoveryRate: 99, jointCondition: 99, weightCondition: 50 };
    const result = applyCareAction(config, 'vet', vitals, nearMax, null, new Date());
    expect(result.health.recoveryRate).toBeLessThanOrEqual(100);
    expect(result.health.injuryRisk).toBeGreaterThanOrEqual(0);
  });
});

describe('applyCareAction — rest (dinlendir)', () => {
  it('fatigue azaltır, energy artırır', () => {
    const result = applyCareAction(config, 'rest', vitals, health, null, new Date());
    expect(result.vitals.fatigue).toBeLessThan(vitals.fatigue);
    expect(result.vitals.energy).toBeGreaterThan(vitals.energy);
  });
});

describe('applyFeed (brief §12)', () => {
  it('performans yemi enerjiyi çok artırır ama weightCondition düşürür ("pahalı = her zaman iyi değil")', () => {
    const result = applyFeed(config, 'performance', vitals, health);
    expect(result.vitals.energy).toBeGreaterThan(vitals.energy);
    expect(result.health.weightCondition).toBeLessThan(health.weightCondition);
  });

  it('protein yemi weightCondition artırır', () => {
    const result = applyFeed(config, 'protein', vitals, health);
    expect(result.health.weightCondition).toBeGreaterThan(health.weightCondition);
  });
});

/**
 * AUDIT_REPORT.md H1 düzeltmesi (bu oturum): `injured` bir atın `vet`
 * bakımıyla `active`'e dönebilmesi için eşik kontrolü.
 */
describe('canRecoverFromInjury (AUDIT_REPORT.md H1)', () => {
  it('yalnızca config.injuryRecovery.action ile eşleşen eylem türü için true dönebilir', () => {
    // config.injuryRecovery.action === 'vet' (care.config.json).
    expect(canRecoverFromInjury(config, 'groom', 100, 0)).toBe(false);
    expect(canRecoverFromInjury(config, 'farrier', 100, 0)).toBe(false);
  });

  it('vet sonrası health ve injuryRisk eşikleri karşılanırsa true döner', () => {
    // care.config.json: injuryRecovery = { minHealth: 50, maxInjuryRisk: 40 }.
    expect(canRecoverFromInjury(config, 'vet', 50, 40)).toBe(true);
    expect(canRecoverFromInjury(config, 'vet', 100, 0)).toBe(true);
  });

  it('health eşiğin altındaysa false döner', () => {
    expect(canRecoverFromInjury(config, 'vet', 49, 0)).toBe(false);
  });

  it('injuryRisk eşiğin üstündeyse false döner', () => {
    expect(canRecoverFromInjury(config, 'vet', 100, 41)).toBe(false);
  });
});

describe('maliyet okuma', () => {
  it('getCareActionCost ve getFeedCost doğru değerleri döner', () => {
    expect(getCareActionCost(config, 'vet')).toEqual({ currency: 'money', amount: 250 });
    expect(getFeedCost(config, 'performance')).toEqual({ currency: 'gems', amount: 5 });
  });
});

/**
 * FAZ 1 wiring, beşinci dilim — Antrenman dilimindeki CI Hata 7'nin
 * dersi (bkz. `domain/care/errors.ts` `InvalidCareInputError` üstündeki
 * not): DTO doğrulaması esbuild altında atlanabildiği için domain
 * katmanı BAĞIMSIZ olarak da doğrulamalı.
 */
describe('geçersiz bakım girdisi', () => {
  it('tanımsız bir eylem türü için InvalidCareInputError fırlatır', () => {
    expect(() =>
      applyCareAction(
        config,
        // @ts-expect-error — kasıtlı olarak geçersiz bir değer test ediliyor.
        'not-a-real-action',
        vitals,
        health,
        null,
        new Date(),
      ),
    ).toThrow(InvalidCareInputError);
  });

  it('tanımsız bir yem türü için InvalidCareInputError fırlatır', () => {
    expect(() =>
      applyFeed(
        config,
        // @ts-expect-error — kasıtlı olarak geçersiz bir değer test ediliyor.
        'not-a-real-feed',
        vitals,
        health,
      ),
    ).toThrow(InvalidCareInputError);
  });

  it('getCareActionCost/getFeedCost tanımsız değerler için de aynı hatayı fırlatır', () => {
    // @ts-expect-error — kasıtlı olarak geçersiz bir değer test ediliyor.
    expect(() => getCareActionCost(config, 'not-a-real-action')).toThrow(InvalidCareInputError);
    // @ts-expect-error — kasıtlı olarak geçersiz bir değer test ediliyor.
    expect(() => getFeedCost(config, 'not-a-real-feed')).toThrow(InvalidCareInputError);
  });
});
