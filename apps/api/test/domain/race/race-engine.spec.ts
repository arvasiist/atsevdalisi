import { describe, expect, it } from 'vitest';
import { simulateRace, type RaceSimulationInput } from '../../../src/domain/race/race-engine';
import raceConfigJson from '../../../../../config/race.config.json';
import weatherConfigJson from '../../../../../config/weather.config.json';
import type { RaceBalanceConfig, WeatherConfig } from '@at-sevdalisi/game-config';
import type { RaceEntrantSnapshot, RaceTacticInput } from '@at-sevdalisi/shared-types';

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;
const weatherConfig = weatherConfigJson as unknown as WeatherConfig;

function makeEntry(horseId: string, overrides: Partial<RaceEntrantSnapshot> = {}): RaceEntrantSnapshot {
  return {
    horseId,
    speed: 70,
    stamina: 70,
    acceleration: 70,
    fitness: 80,
    fatigue: 15,
    health: 90,
    morale: 75,
    surfaceCompatibility: 70,
    distanceCompatibility: 70,
    jockeySkillComposite: 65,
    weightCompatibility: 100,
    form: 50,
    tactic: {
      racingStyle: 'mid_pack',
      riskLevel: 'normal',
      startApproach: 'balanced',
      finalStretchPlan: 'normal',
    },
    ...overrides,
  };
}

const baseInput: Omit<RaceSimulationInput, 'entries' | 'simulationSeed'> = {
  raceId: 'race-1',
  distanceMeters: 1600,
  surface: 'grass',
  weather: 'sunny',
  temperatureC: 22,
  raceConfig,
  weatherConfig,
};

/**
 * brief §53 Race Engine test kriterleri:
 *  - Aynı seed = aynı sonuç.
 *  - Genel olarak yüksek rating kazanır, ama sürpriz mümkündür.
 */
describe('simulateRace — determinism (brief §18, §53, §58)', () => {
  it('aynı seed + aynı girdi bit bit aynı RaceTimeline üretir', () => {
    const entries = [makeEntry('h1'), makeEntry('h2', { speed: 60, stamina: 60 })];
    const t1 = simulateRace({ ...baseInput, simulationSeed: 'seed-abc', entries });
    const t2 = simulateRace({ ...baseInput, simulationSeed: 'seed-abc', entries });
    expect(t2).toEqual(t1);
  });

  it('farklı seed farklı bir sonuç üretebilir', () => {
    const entries = [makeEntry('h1'), makeEntry('h2', { speed: 60, stamina: 60 })];
    const t1 = simulateRace({ ...baseInput, simulationSeed: 'seed-abc', entries });
    const t3 = simulateRace({ ...baseInput, simulationSeed: 'seed-xyz', entries });
    expect(t3.finalResult).not.toEqual(t1.finalResult);
  });
});

describe('simulateRace — temel sonuç yapısı', () => {
  it('finalResult sıralı ve pozisyonlar 1..n şeklindedir', () => {
    const entries = [makeEntry('h1'), makeEntry('h2', { speed: 60, stamina: 60 })];
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'seed-abc', entries });
    expect(timeline.finalResult).toHaveLength(2);
    expect(timeline.finalResult[0]?.finishPosition).toBe(1);
    expect(timeline.finalResult[1]?.finishPosition).toBe(2);
    expect(timeline.finalResult[0]!.finishTimeMs).toBeLessThanOrEqual(timeline.finalResult[1]!.finishTimeMs);
  });

  it('mesafe/segmentLength oranı kadar segment üretir (1600m / 200m = 8)', () => {
    const entries = [makeEntry('h1')];
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'seed-abc', entries });
    expect(timeline.segments.filter((s) => s.raceEntryId === 'h1')).toHaveLength(8);
  });
});

describe('simulateRace — dengeleme (brief §17-18, §89 İlke 1)', () => {
  it('büyük stat farkında güçlü at çoğu zaman kazanır', () => {
    let strongWins = 0;
    const trials = 40;
    for (let i = 0; i < trials; i += 1) {
      const strong = makeEntry('strong', { speed: 90, stamina: 90, acceleration: 88, fitness: 90, jockeySkillComposite: 85 });
      const weak = makeEntry('weak', { speed: 45, stamina: 45, acceleration: 45, fitness: 50, jockeySkillComposite: 40 });
      const timeline = simulateRace({ ...baseInput, simulationSeed: `trial-seed-${i}`, entries: [strong, weak] });
      if (timeline.finalResult[0]?.horseId === 'strong') strongWins += 1;
    }
    expect(strongWins / trials).toBeGreaterThanOrEqual(0.8);
  });

  it('yakın statlarda zayıf taraf bazen kazanabilir (kontrollü sürpriz, brief §18)', () => {
    let strongWins = 0;
    const trials = 60;
    for (let i = 0; i < trials; i += 1) {
      const strong = makeEntry('strong', { speed: 74, stamina: 72, jockeySkillComposite: 68 });
      const weak = makeEntry('weak', { speed: 68, stamina: 66, jockeySkillComposite: 62 });
      const timeline = simulateRace({ ...baseInput, simulationSeed: `close-trial-${i}`, entries: [strong, weak] });
      if (timeline.finalResult[0]?.horseId === 'strong') strongWins += 1;
    }
    // Sürekli favori kazanmamalı (tam 1.0 olmamalı) ama genelde önde olmalı.
    expect(strongWins / trials).toBeLessThan(1);
    expect(strongWins / trials).toBeGreaterThan(0.5);
  });

  it('racingStyle (pace) farkı, aynı statlarda bile farklı bir sonuç üretir', () => {
    const frontRunner = makeEntry('front', {
      tactic: { racingStyle: 'front_runner', riskLevel: 'normal', startApproach: 'aggressive', finalStretchPlan: 'early_sprint' },
    });
    const closer = makeEntry('closer', {
      tactic: { racingStyle: 'closer', riskLevel: 'normal', startApproach: 'controlled', finalStretchPlan: 'late_sprint' },
    });
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'style-seed', entries: [frontRunner, closer] });
    const frontResult = timeline.finalResult.find((r) => r.horseId === 'front');
    const closerResult = timeline.finalResult.find((r) => r.horseId === 'closer');
    expect(frontResult!.finishTimeMs).not.toBe(closerResult!.finishTimeMs);
  });
});

/** FAZ 5 — brief §21 kulvar/geçiş, §60 jokey kararları, §85 açıklama. */
describe('simulateRace — FAZ 5 (Advanced Race Engine)', () => {
  it('her segment telemetrisinde kulvar [1, lanes.count] aralığındadır', () => {
    const entries = [makeEntry('h1'), makeEntry('h2', { speed: 60 }), makeEntry('h3', { speed: 55 })];
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'lane-seed', entries });
    for (const segment of timeline.segments) {
      expect(segment.lane).toBeGreaterThanOrEqual(1);
      expect(segment.lane).toBeLessThanOrEqual(raceConfig.lanes.count);
    }
  });

  it('her segment telemetrisinde geçerli bir jokey kararı bulunur', () => {
    const entries = [makeEntry('h1'), makeEntry('h2', { speed: 60 })];
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'decision-seed', entries });
    const validDecisions = ['reduce_pace', 'push_for_finish', 'search_overtake_lane', 'defend_position', 'hold'];
    for (const segment of timeline.segments) {
      expect(validDecisions).toContain(segment.decision);
    }
  });

  it('birbirine yakın statlarda atlar arasında en az bir bloklanma denemesi yaşanabilir (5 at, çoklu deneme)', () => {
    let anyBlocked = false;
    for (let i = 0; i < 20 && !anyBlocked; i += 1) {
      const entries = Array.from({ length: 5 }, (_, idx) => makeEntry(`h${idx}`));
      const timeline = simulateRace({ ...baseInput, simulationSeed: `block-seed-${i}`, entries });
      anyBlocked = timeline.segments.some((s) => s.blocked);
    }
    expect(anyBlocked).toBe(true);
  });

  it('finalResult her zaman benzersiz ve ardışık pozisyonlar üretir (5 at)', () => {
    const entries = Array.from({ length: 5 }, (_, idx) => makeEntry(`h${idx}`, { speed: 60 + idx * 5 }));
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'positions-seed', entries });
    const positions = timeline.finalResult.map((r) => r.finishPosition).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5]);
    const uniqueHorseIds = new Set(timeline.finalResult.map((r) => r.horseId));
    expect(uniqueHorseIds.size).toBe(5);
  });

  it('her at için bir açıklama (RaceExplanation) üretir (brief §85)', () => {
    const entries = [makeEntry('h1'), makeEntry('h2', { speed: 60 })];
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'explain-seed', entries });
    expect(timeline.explanations).toHaveLength(2);
    for (const explanation of timeline.explanations) {
      expect(Array.isArray(explanation.positives)).toBe(true);
      expect(Array.isArray(explanation.negatives)).toBe(true);
    }
  });

  it('aynı seed ile FAZ 5 alanları (lane, blocked, decision, explanations) da bit bit aynıdır', () => {
    const entries = [makeEntry('h1'), makeEntry('h2', { speed: 60 }), makeEntry('h3', { speed: 55 })];
    const t1 = simulateRace({ ...baseInput, simulationSeed: 'faz5-determinism', entries });
    const t2 = simulateRace({ ...baseInput, simulationSeed: 'faz5-determinism', entries });
    expect(t2.segments).toEqual(t1.segments);
    expect(t2.explanations).toEqual(t1.explanations);
  });
});

/**
 * `RaceSegmentSnapshot.fatigueLevel` + `.paceScore` (bu turda EKLENDİ) —
 * alanların kendi doc yorumları için bkz. `packages/shared-types/src/race.ts`.
 *
 * Bu bloğun varlık nedeni SOMUT bir hataydı: motor `state.runtimeFatigue`'i
 * zaten her segmentte hesaplayıp performans cezasına çeviriyordu
 * (`deriveFatiguePerformancePenalty`), ama telemetriye HİÇ yazmıyordu.
 * Segmentteki `fatigue` alanı ise `horses.fatigue` STATİK (yarış öncesi)
 * değerini taşıdığı için, istemcideki yorgunluk göstergesi (`RaceHud`'un
 * "Yor" çubuğu) yarış boyunca SABİT kalıyordu. Aşağıdaki testler canlı
 * değerin gerçekten AKTIĞINI ve statik değerden FARKLI olduğunu kanıtlar.
 */
describe('simulateRace — telemetri zenginleştirme (fatigueLevel, paceScore)', () => {
  const frontRunnerTactic: RaceTacticInput = {
    racingStyle: 'front_runner',
    riskLevel: 'normal',
    startApproach: 'balanced',
    finalStretchPlan: 'normal',
  };
  const closerTactic: RaceTacticInput = { ...frontRunnerTactic, racingStyle: 'closer' };

  it('her segmentte fatigueLevel ve paceScore TANIMLIDIR', () => {
    const entries = [makeEntry('h1'), makeEntry('h2', { speed: 60 })];
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'telemetry-seed', entries });
    expect(timeline.segments.length).toBeGreaterThan(0);
    for (const segment of timeline.segments) {
      expect(typeof segment.fatigueLevel).toBe('number');
      expect(typeof segment.paceScore).toBe('number');
    }
  });

  it('fatigueLevel yarış boyunca BİRİKİR (her segmentte artar) — statik `fatigue` alanının AKSİNE', () => {
    const entries = [makeEntry('h1', { fatigue: 15 })];
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'telemetry-seed', entries });
    const levels = timeline.segments.map((segment) => segment.fatigueLevel!);
    expect(levels).toHaveLength(8); // 1600m / 200m
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
    }
    // Statik alan yarış boyunca SABİT kalır — ikisinin AYRI mekanizmalar
    // olduğunun (bkz. `domain/race/fatigue.ts` doc yorumu) somut kanıtı.
    expect(timeline.segments.every((segment) => segment.fatigue === 15)).toBe(true);
    expect(levels[0]).not.toBe(15);
  });

  it('paceScore atın yarış stilini yansıtır: mid_pack nötr (50), front_runner nötrün ÜSTÜNDE, closer ALTINDA', () => {
    const midPack = simulateRace({ ...baseInput, simulationSeed: 'pace-seed', entries: [makeEntry('h1')] });
    const frontRunner = simulateRace({
      ...baseInput,
      simulationSeed: 'pace-seed',
      entries: [makeEntry('h1', { tactic: frontRunnerTactic })],
    });
    const closer = simulateRace({
      ...baseInput,
      simulationSeed: 'pace-seed',
      entries: [makeEntry('h1', { tactic: closerTactic })],
    });

    expect(midPack.segments[0]!.paceScore).toBeCloseTo(50, 6);
    expect(frontRunner.segments[0]!.paceScore).toBeCloseTo(65, 6);
    expect(closer.segments[0]!.paceScore).toBeCloseTo(47, 6);

    // Çarpan yarış boyunca stil bazlı SABİT olduğundan (yalnızca
    // `performanceBonus` aşamaya göre değişir), puan da sabit kalmalıdır.
    expect(new Set(midPack.segments.map((segment) => segment.paceScore)).size).toBe(1);
    expect(new Set(frontRunner.segments.map((segment) => segment.paceScore)).size).toBe(1);
  });

  it('yeni alanlar determinizmi BOZMAZ (aynı seed ⇒ bit bit aynı segmentler)', () => {
    const entries = [makeEntry('h1'), makeEntry('h2', { speed: 60 })];
    const t1 = simulateRace({ ...baseInput, simulationSeed: 'telemetry-determinism', entries });
    const t2 = simulateRace({ ...baseInput, simulationSeed: 'telemetry-determinism', entries });
    expect(t2.segments).toEqual(t1.segments);
  });
});
