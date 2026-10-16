import { describe, expect, it } from 'vitest';
import { loadCareConfig, loadRaceConfig, type CareConfig } from '@at-sevdalisi/game-config';
import {
  applyPassiveRecovery,
  applyRaceConditionCost,
  computeRaceConditionCost,
  creditedRecoverySeconds,
  estimateRaceReadyAt,
  validateRaceConditionConfig,
} from '../../../src/domain/care/race-condition';
import { checkRaceReadiness } from '../../../src/domain/race/readiness';
import { PRACTICE_RACE_DISTANCE_METERS } from '../../../src/domain/race/validation';

/**
 * 15.10.2026 — S3 (`docs/OYUN_DONGUSU_DENETIMI.md` B2/B3): yarış ata bedel
 * yazar, at zamanla toparlanır. Eskiden 12 ardışık yarışta enerji 100,
 * yorgunluk 0 kalıyordu.
 */
const CARE = loadCareConfig();
const READINESS = loadRaceConfig().readiness;
const RECOVERY = CARE.passiveRecovery;
const FRESH = { health: 100, fitness: 50, fatigue: 0, energy: 100, morale: 80 };
const NOW = new Date(Date.UTC(2026, 9, 15, 12, 0, 0));
/** 15.10.2026 — B12: yetişkin at (yarış yaşı engeli bu dosyanın konusu değil). */
const ADULT = 48;

describe('yarış bedeli + toparlanma — config', () => {
  it('config geçerli (API açılışı aynı denetimi koşar)', () => {
    expect(validateRaceConditionConfig(CARE)).toEqual([]);
  });

  it('bozuk config REDDEDİLİR', () => {
    const broken = (patch: Partial<CareConfig>) => validateRaceConditionConfig({ ...CARE, ...patch });
    expect(broken({ raceCondition: { energyPerKm: -1, fatiguePerKm: 1 } })).not.toEqual([]);
    expect(broken({ passiveRecovery: { ...RECOVERY, tickSeconds: 0 } })).not.toEqual([]);
    expect(broken({ passiveRecovery: { ...RECOVERY, maxCreditSeconds: RECOVERY.tickSeconds - 1 } })).not.toEqual([]);
    expect(broken({ passiveRecovery: { ...RECOVERY, fatiguePerHour: -2 } })).not.toEqual([]);
  });
});

describe('yarış bedeli', () => {
  it('mesafeyle orantılıdır ve iki haneye yuvarlanır (NUMERIC(5,2))', () => {
    const cost = computeRaceConditionCost(1600, { energyPerKm: 15, fatiguePerKm: 12.345 });
    expect(cost).toEqual({ energy: 24, fatigue: 19.75 });
    expect(computeRaceConditionCost(0, CARE.raceCondition)).toEqual({ energy: 0, fatigue: 0 });
  });

  it('enerji 0 altına, yorgunluk 100 üstüne çıkmaz', () => {
    expect(applyRaceConditionCost({ energy: 5, fatigue: 95 }, { energy: 24, fatigue: 24 })).toEqual({ energy: 0, fatigue: 100 });
  });

  it('OYUN KURALI: dinlenmiş at art arda 2–4 pratik yarış koşabilir, sonra dinlenmek zorundadır', () => {
    const cost = computeRaceConditionCost(PRACTICE_RACE_DISTANCE_METERS, CARE.raceCondition);
    let vitals = { ...FRESH };
    let races = 0;
    while (checkRaceReadiness('active', vitals, READINESS, ADULT).ready && races < 50) {
      vitals = { ...vitals, ...applyRaceConditionCost(vitals, cost) };
      races += 1;
    }
    expect(races).toBeGreaterThanOrEqual(2);
    expect(races).toBeLessThanOrEqual(4);
  });
});

describe('zamanla toparlanma', () => {
  it('bir tur en fazla `maxCreditSeconds` sayar, negatif süre saymaz', () => {
    expect(creditedRecoverySeconds(-30, RECOVERY)).toBe(0);
    expect(creditedRecoverySeconds(RECOVERY.maxCreditSeconds * 10, RECOVERY)).toBe(RECOVERY.maxCreditSeconds);
  });

  it('saatlik hızla toparlar ve 0..100 içinde kalır', () => {
    const oneTick = RECOVERY.tickSeconds;
    const recovered = applyPassiveRecovery({ energy: 50, fatigue: 50 }, oneTick, RECOVERY);
    expect(recovered.energy).toBeCloseTo(50 + (RECOVERY.energyPerHour * oneTick) / 3600, 2);
    expect(recovered.fatigue).toBeCloseTo(50 - (RECOVERY.fatiguePerHour * oneTick) / 3600, 2);
    expect(applyPassiveRecovery({ energy: 99.9, fatigue: 0.1 }, RECOVERY.maxCreditSeconds, RECOVERY)).toEqual({ energy: 100, fatigue: 0 });
  });

  it('OYUN KURALI: art arda yarışlardan bitmiş at bir gecede (≤ 12 sa) tamamen toparlanır', () => {
    const cost = computeRaceConditionCost(PRACTICE_RACE_DISTANCE_METERS, CARE.raceCondition);
    let vitals = { ...FRESH };
    while (checkRaceReadiness('active', vitals, READINESS, ADULT).ready) vitals = { ...vitals, ...applyRaceConditionCost(vitals, cost) };
    let seconds = 0;
    let state = { energy: vitals.energy, fatigue: vitals.fatigue };
    while ((state.energy < 100 || state.fatigue > 0) && seconds < 48 * 3600) {
      state = applyPassiveRecovery(state, RECOVERY.tickSeconds, RECOVERY);
      seconds += RECOVERY.tickSeconds;
    }
    expect(seconds).toBeLessThanOrEqual(12 * 3600);
  });
});

describe('ne zaman hazır olur', () => {
  it('hazır at, sağlık/durum engeli ve kapalı toparlanma için `null`', () => {
    expect(estimateRaceReadyAt('active', FRESH, READINESS, RECOVERY, NOW, ADULT)).toBeNull();
    expect(estimateRaceReadyAt('injured', { ...FRESH, fatigue: 90 }, READINESS, RECOVERY, NOW, ADULT)).toBeNull();
    expect(estimateRaceReadyAt('active', { ...FRESH, health: 10, fatigue: 90 }, READINESS, RECOVERY, NOW, ADULT)).toBeNull();
    expect(estimateRaceReadyAt('active', { ...FRESH, fatigue: 90 }, READINESS, { ...RECOVERY, enabled: false }, NOW, ADULT)).toBeNull();
    // Yaş engeli toparlanmayla geçmez → tahmin yok (ekran yaşı ayrıca gösterir).
    expect(estimateRaceReadyAt('active', { ...FRESH, fatigue: 90 }, READINESS, RECOVERY, NOW, 0)).toBeNull();
  });

  it('yorgunluk ve enerjiden geç olanını alır, tur aralığına yukarı yuvarlar; o anda at gerçekten hazırdır', () => {
    const tired = { ...FRESH, fatigue: READINESS.maxFatigue + 5, energy: READINESS.minEnergy - 1 };
    const readyAt = estimateRaceReadyAt('active', tired, READINESS, RECOVERY, NOW, ADULT)!;
    const waitSeconds = (readyAt.getTime() - NOW.getTime()) / 1000;
    expect(waitSeconds % RECOVERY.tickSeconds).toBe(0);
    expect(waitSeconds).toBeGreaterThanOrEqual((5 / RECOVERY.fatiguePerHour) * 3600);
    // O süre boyunca turlarla toparlanan at kapıdan geçer.
    let state = { energy: tired.energy, fatigue: tired.fatigue };
    for (let elapsed = 0; elapsed < waitSeconds; elapsed += RECOVERY.tickSeconds) {
      state = applyPassiveRecovery(state, RECOVERY.tickSeconds, RECOVERY);
    }
    expect(checkRaceReadiness('active', { ...tired, ...state }, READINESS, ADULT).ready).toBe(true);
  });
});
