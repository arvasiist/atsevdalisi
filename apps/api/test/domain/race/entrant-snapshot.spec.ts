import { describe, expect, it } from 'vitest';
import type { Horse, HorseDistanceStats, HorseStats, HorseSurfaceStats, RecentRaceResultView } from '@at-sevdalisi/shared-types';
import {
  assertValidRaceTactic,
  buildHorseEntrantSnapshot,
  deriveFormFromRecentResults,
  FORM_SAMPLE_SIZE,
  NEUTRAL_UNMODELED_TRAIT_SCORE,
  type TrackFitInput,
  UNMODELED_SNAPSHOT_FIELDS,
} from '../../../src/domain/race/entrant-snapshot';
import { InvalidRaceTacticError } from '../../../src/domain/race/errors';

function makeSurfaceStats(overrides: Partial<HorseSurfaceStats> = {}): HorseSurfaceStats {
  return {
    horseId: 'horse-1',
    grass: 70,
    dirt: 30,
    wet: 40,
    heavy: 20,
    dry: 60,
    mud: 10,
    ...overrides,
  };
}

function makeDistanceStats(overrides: Partial<HorseDistanceStats> = {}): HorseDistanceStats {
  return {
    horseId: 'horse-1',
    shortDistance: 80,
    middleDistance: 55,
    longDistance: 25,
    ...overrides,
  };
}

function makeTrackFit(overrides: Partial<TrackFitInput> = {}): TrackFitInput {
  return {
    surfaceStats: makeSurfaceStats(),
    distanceStats: makeDistanceStats(),
    surface: 'grass',
    distanceMeters: 1600,
    ...overrides,
  };
}

function makeRecentResult(overrides: Partial<RecentRaceResultView> = {}): RecentRaceResultView {
  return {
    raceId: 'race-1',
    raceName: 'Pratik Yarış',
    horseId: 'horse-1',
    horseName: 'Yıldırım',
    distanceMeters: 1600,
    surface: 'grass',
    finishPosition: 1,
    finalTimeMs: 100000,
    performanceScore: 70,
    finishedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

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

  /**
   * R4 — Carried Weight, SADECE at vücut ağırlığı alt-faktörü (bu turda
   * EKLENDİ). `trackFit`'in AKSİNE opsiyonel bir parametre GEREKMEZ:
   * `horse.weightKg` `Horse` aggregate'inde ZATEN mevcuttur (bkz.
   * `carried-weight.ts`'in kendi spec'i `carried-weight.spec.ts`'te ayrı
   * test edilir — burada yalnızca `buildHorseEntrantSnapshot`'ın bu
   * değeri doğru İLETTİĞİ doğrulanır).
   */
  it("weightCompatibility, horse.weightKg'den computeWeightCompatibility ile türetilir", () => {
    const snapshot = buildHorseEntrantSnapshot(makeHorse({ weightKg: 495 }), makeStats(), validTactic);
    expect(snapshot.weightCompatibility).toBe(100);
  });

  it('horse.weightKg null ise (eski/legacy veri) weightCompatibility nötr (50) kalır', () => {
    const snapshot = buildHorseEntrantSnapshot(makeHorse({ weightKg: null }), makeStats(), validTactic);
    expect(snapshot.weightCompatibility).toBe(50);
  });

  it('trackFit verilmeden çağrılırsa surfaceCompatibility/distanceCompatibility nötr kalır (GERİYE DÖNÜK UYUMLU)', () => {
    const snapshot = buildHorseEntrantSnapshot(makeHorse(), makeStats(), validTactic);

    expect(snapshot.surfaceCompatibility).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
    expect(snapshot.distanceCompatibility).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
  });

  it('henüz modellenmeyen jockeySkillComposite alanını nötr değere ayarlar', () => {
    const snapshot = buildHorseEntrantSnapshot(makeHorse(), makeStats(), validTactic);

    expect(snapshot.jockeySkillComposite).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
  });

  /**
   * R3 — Track Fit (bu turda EKLENDİ). `trackFit` verilirse
   * surfaceCompatibility/distanceCompatibility artık `track-fit.ts`'teki
   * saf fonksiyonlardan (kendi spec'i `track-fit.spec.ts`'te ayrıca test
   * edilir) türetilir — burada yalnızca `buildHorseEntrantSnapshot`'ın bu
   * değeri doğru İLETTİĞİ doğrulanır.
   */
  it('trackFit verilirse surfaceCompatibility/distanceCompatibility bu veriden türetilir', () => {
    const trackFit = makeTrackFit({
      surfaceStats: makeSurfaceStats({ grass: 82 }),
      distanceStats: makeDistanceStats({ middleDistance: 67 }),
      surface: 'grass',
      distanceMeters: 1600,
    });
    const snapshot = buildHorseEntrantSnapshot(makeHorse(), makeStats(), validTactic, [], trackFit);

    expect(snapshot.surfaceCompatibility).toBe(82);
    expect(snapshot.distanceCompatibility).toBe(67);
  });

  it('trackFit açıkça null verilirse (ör. henüz backfill edilmemiş bir at) nötr kalır', () => {
    const snapshot = buildHorseEntrantSnapshot(makeHorse(), makeStats(), validTactic, [], null);

    expect(snapshot.surfaceCompatibility).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
    expect(snapshot.distanceCompatibility).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
  });

  /**
   * AUDIT_REPORT.md Bulgu R3 (bu oturum) — `form` artık `UNMODELED_
   * SNAPSHOT_FIELDS` listesinde DEĞİL (yukarıdaki testten BİLEREK
   * çıkarıldı); `recentResults` verilmeden çağrılırsa (eski çağıranlarla
   * GERİYE DÖNÜK uyumluluk) hâlâ nötr 50 döner — bkz. aşağıdaki
   * `deriveFormFromRecentResults` testleri gerçek geçmişle davranışı.
   */
  it('recentResults verilmeden çağrılırsa form nötr (50) kalır', () => {
    const snapshot = buildHorseEntrantSnapshot(makeHorse(), makeStats(), validTactic);
    expect(snapshot.form).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
  });

  it('recentResults verilirse form bu geçmişten türetilir', () => {
    const snapshot = buildHorseEntrantSnapshot(makeHorse(), makeStats(), validTactic, [
      makeRecentResult({ performanceScore: 80 }),
      makeRecentResult({ performanceScore: 60 }),
    ]);
    expect(snapshot.form).toBe(70);
  });

  /**
   * AUDIT_AND_HARDENING Öncelik 8 (önceki oturum) — "tripwire" testi: bkz.
   * `entrant-snapshot.ts` `UNMODELED_SNAPSHOT_FIELDS` doc yorumu. Bu test
   * yukarıdaki testle AYNI şeyi, ama `UNMODELED_SNAPSHOT_FIELDS`
   * LİSTESİNİN ÜZERİNDE DÖNGÜYLE doğrular — biri gelecekte bu alanlardan
   * BİRİNİ gerçek veriyle (ör. jokey ataması) bağlayıp listeyi
   * güncellemeyi UNUTURSA, bu test KIRILIR (artık nötr olmayan bir alan
   * hâlâ "unmodeled" listesinde görünmeye devam eder ama üretilen snapshot
   * artık 50 DÖNMEZ) — gap sessizce unutulamaz. R3 — Track Fit (bu turda
   * TAMAMLANDI) sayesinde liste ARTIK yalnızca `jockeySkillComposite`
   * içeriyor (`surfaceCompatibility`/`distanceCompatibility` çıkarıldı,
   * `form`'un daha önce çıkarılmasıyla AYNI desen).
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

describe('deriveFormFromRecentResults (AUDIT_REPORT.md Bulgu R3, bu oturum)', () => {
  it('hiç geçmiş yoksa nötr değer (50) döner — "formsuz" değil "bilinmiyor"', () => {
    expect(deriveFormFromRecentResults([])).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
  });

  it('tek bir sonuç varsa doğrudan onun performanceScore\'unu döner', () => {
    expect(deriveFormFromRecentResults([makeRecentResult({ performanceScore: 83 })])).toBe(83);
  });

  it('birden fazla sonucun ortalamasını (yuvarlanmış) döner', () => {
    const results = [makeRecentResult({ performanceScore: 90 }), makeRecentResult({ performanceScore: 91 }), makeRecentResult({ performanceScore: 89 })];
    // (90+91+89)/3 = 90
    expect(deriveFormFromRecentResults(results)).toBe(90);
  });

  it(`FORM_SAMPLE_SIZE'dan (${FORM_SAMPLE_SIZE}) FAZLA sonuç verilse bile yalnızca İLK ${FORM_SAMPLE_SIZE} tanesini kullanır (repository zaten en yeniden eskiye sıralı döner)`, () => {
    const newest = Array.from({ length: FORM_SAMPLE_SIZE }, () => makeRecentResult({ performanceScore: 100 }));
    const stale = [makeRecentResult({ performanceScore: 0 })];
    expect(deriveFormFromRecentResults([...newest, ...stale])).toBe(100);
  });

  it('0-100 aralığında clamp eder (performanceScore teorik olarak aralık dışına taşsa bile)', () => {
    expect(deriveFormFromRecentResults([makeRecentResult({ performanceScore: 150 })])).toBe(100);
    expect(deriveFormFromRecentResults([makeRecentResult({ performanceScore: -20 })])).toBe(0);
  });
});
