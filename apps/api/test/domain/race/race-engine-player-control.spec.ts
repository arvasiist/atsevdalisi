import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { RaceBalanceConfig, WeatherConfig } from '@at-sevdalisi/game-config';
import { generateBotEntrants } from '../../../src/domain/race/bot-generator';
import {
  simulateRace,
  type PlayerSegmentCommand,
  type RaceSimulationInput,
} from '../../../src/domain/race/race-engine';
import raceConfigJson from '../../../../../config/race.config.json';
import { measurePlayerControlPlan, PLAYER_CONTROL_PLANS } from './race-balance-harness';
import weatherConfigJson from '../../../../../config/weather.config.json';

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;
const weatherConfig = weatherConfigJson as unknown as WeatherConfig;

function input(seed: string, n = 8, distanceMeters = 1600): RaceSimulationInput {
  return {
    raceId: `race-${seed}`,
    simulationSeed: seed,
    distanceMeters,
    surface: 'dirt',
    weather: 'sunny',
    temperatureC: 20,
    entries: generateBotEntrants(n, seed),
    raceConfig,
    weatherConfig,
  };
}

const cmd = (over: Partial<PlayerSegmentCommand>): PlayerSegmentCommand => ({
  whips: 0,
  laneShift: 0,
  ease: false,
  ...over,
});

function commands(horseId: string, bySegment: Record<number, PlayerSegmentCommand>) {
  return new Map([[horseId, new Map(Object.entries(bySegment).map(([k, v]) => [Number(k), v]))]]);
}

describe('oyuncu kontrolü — motor (01.10.2026)', () => {
  it('KOMUTSUZ çıktı oyuncu kontrolü eklenmeden ÖNCEKİ motorla bit bit aynı (parmak izi)', () => {
    // Bu özet, değişiklik öncesi motordan (git stash ile) alındı. Komutsuz
    // bir yarışın tek bir biti değişirse bu test kırılır.
    const hash = createHash('sha256');
    for (let i = 0; i < 40; i += 1) {
      const seed = `fp-${i}`;
      for (const [dist, surface, n] of [
        [1200, 'dirt', 8],
        [2000, 'grass', 12],
        [3200, 'synthetic', 16],
      ] as const) {
        const timeline = simulateRace({
          raceId: `r-${i}`,
          simulationSeed: seed,
          distanceMeters: dist,
          surface,
          weather: 'rainy',
          temperatureC: 18,
          entries: generateBotEntrants(n, seed),
          raceConfig,
          weatherConfig,
        });
        hash.update(JSON.stringify(timeline));
      }
    }
    expect(hash.digest('hex')).toBe(
      '12c13f6ed61225906a1a4c368e6ed8fe79902a93680ab205660cf9d38d8eb54c',
    );
  });

  it('boş komut haritası = komut yok', () => {
    const base = input('empty');
    expect(simulateRace({ ...base, playerCommands: new Map() })).toEqual(simulateRace(base));
  });

  it('komut yalnızca KENDİ segmentinden itibaren etkiler (önek değişmezliği — canlı yarışın temeli)', () => {
    const base = input('prefix');
    const horse = base.entries[0]!.horseId;
    const plain = simulateRace(base);
    const k = 4;
    const commanded = simulateRace({
      ...base,
      playerCommands: commands(horse, { [k]: cmd({ whips: 3, laneShift: 1 }) }),
    });
    const n = base.entries.length;
    expect(commanded.segments.slice(0, k * n)).toEqual(plain.segments.slice(0, k * n));
    expect(commanded.segments.slice(k * n)).not.toEqual(plain.segments.slice(k * n));
  });

  it('komutlu yarış da determinist', () => {
    const base = input('det');
    const horse = base.entries[2]!.horseId;
    const playerCommands = commands(horse, { 1: cmd({ laneShift: -1 }), 6: cmd({ whips: 2 }) });
    expect(simulateRace({ ...base, playerCommands })).toEqual(
      simulateRace({ ...base, playerCommands }),
    );
  });

  it('kırbaç: dayanıklılık yeterliyken o segmentte hızlandırır ve config kadar dayanıklılık yakar', () => {
    const base = input('whip');
    const horse = base.entries[0]!.horseId;
    const n = base.entries.length;
    const seg = 1;
    const plain = simulateRace(base);
    const whipped = simulateRace({
      ...base,
      playerCommands: commands(horse, { [seg]: cmd({ whips: 1 }) }),
    });
    const at = (t: typeof plain) =>
      t.segments.slice(seg * n, (seg + 1) * n).find((s) => s.raceEntryId === horse)!;
    expect(at(whipped).decision).toBe('push_for_finish');
    expect(at(whipped).speed).toBeGreaterThan(at(plain).speed);
    expect(at(plain).stamina - at(whipped).stamina).toBeCloseTo(
      raceConfig.playerControl.whipStaminaCost,
      9,
    );
  });

  it('kırbaç sınırsız ama azalan getirili; dayanıklılık bedeli doğrusal', () => {
    const base = input('stack');
    const horse = base.entries[0]!.horseId;
    const n = base.entries.length;
    const at = (whips: number) =>
      simulateRace({ ...base, playerCommands: commands(horse, { 1: cmd({ whips }) }) })
        .segments.slice(n, 2 * n)
        .find((s) => s.raceEntryId === horse)!;
    const one = at(1);
    const four = at(4);
    expect(four.speed).toBeGreaterThan(one.speed);
    expect(one.stamina - four.stamina).toBeCloseTo(3 * raceConfig.playerControl.whipStaminaCost, 9);
  });

  it('yorgun at kırbaca zayıf, tükenmiş at hiç tepki vermez (bonus dayanıklılıkla orantılı)', () => {
    const base = input('tired', 8, 3200);
    const horse = base.entries[0]!.horseId;
    const n = base.entries.length;
    const all: Record<number, PlayerSegmentCommand> = {};
    for (let i = 0; i < 16; i += 1) all[i] = cmd({ whips: 5 });
    const run = simulateRace({ ...base, playerCommands: commands(horse, all) });
    const mine = run.segments.filter((s) => s.raceEntryId === horse);
    // Dayanıklılığı 0'a inen ilk segmentin ARDINDAN gelen segment.
    const empty = mine.findIndex((s) => s.stamina === 0);
    expect(empty).toBeGreaterThan(0);
    const next = empty + 1;
    expect(next).toBeLessThan(mine.length);
    const without = { ...all };
    delete without[next];
    const alt = simulateRace({ ...base, playerCommands: commands(horse, without) });
    const at = (t: typeof run) =>
      t.segments.slice(next * n, (next + 1) * n).find((s) => s.raceEntryId === horse)!;
    expect(at(run).speed).toBeLessThanOrEqual(at(alt).speed);
  });

  it('kırbaç yorgunluğu KALICI: erken kırbaç sonraki segmentleri yavaşlatır', () => {
    const base = input('fatigue');
    const horse = base.entries[0]!.horseId;
    const whipped = simulateRace({
      ...base,
      playerCommands: commands(horse, { 0: cmd({ whips: 3 }) }),
    });
    const plain = simulateRace(base);
    const mine = (t: typeof plain) => t.segments.filter((s) => s.raceEntryId === horse);
    expect(mine(whipped)[1]!.fatigueLevel!).toBeGreaterThan(mine(plain)[1]!.fatigueLevel!);
  });

  it('yön: kulvar oyuncunun istediği tarafa bir kayar, pist sınırında kalır', () => {
    const base = input('lane');
    const horse = base.entries[0]!.horseId;
    const laneAt = (shift: -1 | 1) =>
      simulateRace({
        ...base,
        playerCommands: commands(horse, { 0: cmd({ laneShift: shift }) }),
      }).segments.find((s) => s.raceEntryId === horse)!.lane;
    const initial = raceConfig.lanes.initialLaneByStyle[base.entries[0]!.tactic.racingStyle];
    expect(laneAt(1)).toBe(Math.min(raceConfig.lanes.count, initial + 1));
    expect(laneAt(-1)).toBe(Math.max(1, initial - 1));
  });

  it('sakin: tempo düşürür (yorgunluk daha yavaş birikir)', () => {
    const base = input('ease');
    const horse = base.entries[0]!.horseId;
    const eased = simulateRace({
      ...base,
      playerCommands: commands(horse, { 0: cmd({ ease: true }) }),
    });
    const plain = simulateRace(base);
    const first = (t: typeof plain) => t.segments.find((s) => s.raceEntryId === horse)!;
    expect(first(eased).decision).toBe('reduce_pace');
    expect(first(eased).fatigueLevel).toBeLessThan(first(plain).fatigueLevel!);
  });
});

describe('oyuncu kontrolü — denge (harness, 01.10.2026)', () => {
  // Ölçülen tablo `docs/RACE_BALANCE_REPORT.md` §8'de. Burada yalnızca
  // KIRILMAMASI gerekenler kilitlenir (ölçülen değerler eşik yapılmaz).
  const TRIALS = 400;
  const baseline = measurePlayerControlPlan(PLAYER_CONTROL_PLANS.none, TRIALS);

  it('erken ve aralıksız kırbaç CEZALIDIR (kırbaç bedava hız değildir)', () => {
    expect(measurePlayerControlPlan(PLAYER_CONTROL_PLANS.earlyWhip3, TRIALS)).toBeGreaterThan(
      baseline + 1,
    );
    expect(measurePlayerControlPlan(PLAYER_CONTROL_PLANS.whipEverySegment, TRIALS)).toBeGreaterThan(
      baseline + 0.5,
    );
  });

  it('son düzlükte kırbaç oyuncuyu CEZALANDIRMAZ (düğmenin bir anlamı var)', () => {
    expect(measurePlayerControlPlan(PLAYER_CONTROL_PLANS.finalWhip5, TRIALS)).toBeLessThanOrEqual(
      baseline + 0.05,
    );
  });

  it('hiçbir basit strateji statları ezmez (yapay zekâya göre en fazla 1 sıra)', () => {
    for (const plan of Object.values(PLAYER_CONTROL_PLANS)) {
      expect(measurePlayerControlPlan(plan, TRIALS)).toBeGreaterThan(baseline - 1);
    }
  });
});
