#!/usr/bin/env tsx
/**
 * FAZ 6 (Görsel Sunum) demo verisi üretici.
 *
 * `apps/web`in henüz gerçek bir backend'e bağlı olmadığı (NestJS wiring
 * hâlâ bekliyor, bkz. `docs/ROADMAP.md`) bu aşamada, Three.js sahnesini
 * ("basit şekillerle iskelet") göstermek için GERÇEK bir yarış sonucuna
 * ihtiyaç var. Bu script, zaten tam olarak doğrulanmış FAZ 5 Race Engine'i
 * (`apps/api/src/domain/race/race-engine.ts`) sabit bir seed ve 5 at ile
 * bir kez çalıştırır ve sonucu `apps/web/src/features/race-viewer/
 * fixtures/demo-race-timeline.json` dosyasına yazar.
 *
 * Bu YENİ bir simülasyon YOLU DEĞİLDİR — aynı, tek doğruluk kaynağı olan
 * `simulateRace` fonksiyonu çağrılır (`docs/RACE_ENGINE.md` §1 ilkesi).
 * Sadece demo/geliştirme amaçlı statik bir çıktı üretir.
 *
 * Kullanım: tsx tools/generate-demo-race-timeline.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { simulateRace, type RaceSimulationInput } from '../apps/api/src/domain/race/race-engine';
import raceConfigJson from '../config/race.config.json';
import weatherConfigJson from '../config/weather.config.json';
import type { RaceBalanceConfig, WeatherConfig } from '@at-sevdalisi/game-config';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;
const weatherConfig = weatherConfigJson as unknown as WeatherConfig;

const DEMO_HORSES: Array<{ id: string; name: string } & Partial<RaceEntrantSnapshot>> = [
  { id: 'simsek', name: 'Şimşek', speed: 82, stamina: 78, acceleration: 80, jockeySkillComposite: 74 },
  { id: 'karayel', name: 'Kara Yel', speed: 76, stamina: 84, acceleration: 72, jockeySkillComposite: 70 },
  { id: 'firtina', name: 'Fırtına', speed: 79, stamina: 74, acceleration: 83, jockeySkillComposite: 68 },
  { id: 'bulut', name: 'Bulut', speed: 71, stamina: 80, acceleration: 69, jockeySkillComposite: 65 },
  { id: 'prens', name: 'Prens', speed: 74, stamina: 72, acceleration: 76, jockeySkillComposite: 71 },
];

const RACING_STYLES: RaceEntrantSnapshot['tactic']['racingStyle'][] = [
  'front_runner',
  'tracker',
  'mid_pack',
  'mid_pack',
  'closer',
];

function buildEntry(index: number): RaceEntrantSnapshot {
  const horse = DEMO_HORSES[index]!;
  return {
    horseId: horse.id,
    speed: horse.speed ?? 70,
    stamina: horse.stamina ?? 70,
    acceleration: horse.acceleration ?? 70,
    fitness: 82,
    fatigue: 12,
    health: 92,
    morale: 78,
    surfaceCompatibility: 72,
    distanceCompatibility: 75,
    jockeySkillComposite: horse.jockeySkillComposite ?? 65,
    form: 55,
    tactic: {
      racingStyle: RACING_STYLES[index]!,
      riskLevel: 'normal',
      startApproach: 'balanced',
      finalStretchPlan: 'normal',
    },
  };
}

const input: RaceSimulationInput = {
  raceId: 'demo-race-faz6',
  simulationSeed: 'at-sevdalisi-faz6-demo-v1',
  distanceMeters: 1600,
  surface: 'grass',
  weather: 'sunny',
  temperatureC: 24,
  entries: DEMO_HORSES.map((_, index) => buildEntry(index)),
  raceConfig,
  weatherConfig,
};

const timeline = simulateRace(input);

const horseNamesById = Object.fromEntries(DEMO_HORSES.map((h) => [h.id, h.name]));
const output = { horseNamesById, timeline };

const outputPath = join(__dirname, '..', 'apps', 'web', 'src', 'features', 'race-viewer', 'fixtures', 'demo-race-timeline.json');
writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');

console.log(`✔ Demo RaceTimeline üretildi: ${outputPath}`);
console.log(`  Kazanan: ${horseNamesById[timeline.finalResult[0]?.horseId ?? '']} (${timeline.finalResult[0]?.finishTimeMs}ms)`);
