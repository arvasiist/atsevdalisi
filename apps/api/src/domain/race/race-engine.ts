/**
 * Race Engine — brief §6, §15-25, §89 (İlke 2, İlke 3); bkz. docs/RACE_ENGINE.md.
 *
 * Framework'ten bağımsız, saf TypeScript. Server-authoritative: istemci
 * hiçbir zaman sonucu belirlemez (brief §89 İlke 3) — bu fonksiyon tek
 * doğruluk kaynağıdır. Aynı `simulationSeed` + aynı `entries` + aynı
 * `config` HER ZAMAN bit bit aynı `RaceTimeline`'ı üretir (brief §18, §53,
 * §58 — replay/audit için kritik); bu yüzden `Math.random()` KULLANILMAZ,
 * tüm rastgelelik `createSeededRandom` üzerinden isim uzayına ayrılmış
 * (seed, raceId, horseId, segmentIndex, purpose) şekilde türetilir.
 */

import { clamp, createSeededRandom, seededRange } from '@at-sevdalisi/shared-types';
import type { RaceBalanceConfig, WeatherConfig } from '@at-sevdalisi/game-config';
import type {
  RaceEntrantSnapshot,
  RaceFinishEntry,
  RaceSegmentSnapshot,
  RaceSurface,
  RaceTimeline,
  RaceWeather,
} from '@at-sevdalisi/shared-types';
import { computeBaseAbility } from './base-ability';
import { applyDistanceWeightAdjustments, getDistanceCategory } from './distance-category';
import { getEnvironmentModifier } from './environment';
import { derivePaceEffect } from './pace';

export interface RaceSimulationInput {
  raceId: string;
  simulationSeed: string;
  distanceMeters: number;
  surface: RaceSurface;
  weather: RaceWeather;
  temperatureC: number | null;
  /** brief §56 RaceSnapshot — donmuş değerler; Race Engine başka hiçbir kaynağa bakmaz. */
  entries: RaceEntrantSnapshot[];
  raceConfig: RaceBalanceConfig;
  weatherConfig: WeatherConfig;
}

/** Segment performans puanının altına düşemeyeceği taban (hız = 0/negatif olmasın diye). */
const MIN_SEGMENT_PERFORMANCE_SCORE = 5;

interface HorseRuntimeState {
  horseId: string;
  baseAbility: number;
  racingStyle: RaceEntrantSnapshot['tactic']['racingStyle'];
  cumulativeTimeMs: number;
  positionMeters: number;
  runtimeStamina: number;
  performanceScores: number[];
}

function deriveRandomFactor(seed: string, raceId: string, horseId: string, segmentIndex: number, config: RaceBalanceConfig): number {
  const rng = createSeededRandom(`${seed}:${raceId}:${horseId}:${segmentIndex}:performance`);
  const [min, max] = config.randomFactorRange;
  return seededRange(rng, min, max);
}

function rollBlocked(seed: string, raceId: string, horseId: string, segmentIndex: number, trafficRisk: number): boolean {
  if (trafficRisk <= 0) {
    return false;
  }
  const rng = createSeededRandom(`${seed}:${raceId}:${horseId}:${segmentIndex}:traffic`);
  return rng() < trafficRisk;
}

export function simulateRace(input: RaceSimulationInput): RaceTimeline {
  const { raceConfig, weatherConfig, entries, distanceMeters, simulationSeed, raceId } = input;

  const segmentCount = Math.max(1, Math.round(distanceMeters / raceConfig.segmentLengthMeters));
  const distanceCategory = getDistanceCategory(distanceMeters, raceConfig.distance);
  const adjustedWeights = applyDistanceWeightAdjustments(
    raceConfig.baseAbilityWeights,
    distanceCategory,
    raceConfig.distanceWeightAdjustments,
  );
  const environmentModifier = getEnvironmentModifier(input.surface, input.weather, weatherConfig, input.temperatureC);
  const baseStaminaConsumptionPerSegment = 100 / segmentCount;

  const runtimeStates: HorseRuntimeState[] = entries.map((entry) => ({
    horseId: entry.horseId,
    baseAbility: computeBaseAbility(entry, adjustedWeights),
    racingStyle: entry.tactic.racingStyle,
    cumulativeTimeMs: 0,
    positionMeters: 0,
    runtimeStamina: 100,
    performanceScores: [],
  }));

  const entryByHorseId = new Map(entries.map((entry) => [entry.horseId, entry]));
  const segments: RaceSegmentSnapshot[] = [];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const positionFraction = (segmentIndex + 1) / segmentCount;

    for (const state of runtimeStates) {
      const entry = entryByHorseId.get(state.horseId)!;
      const pace = derivePaceEffect(state.racingStyle, positionFraction, raceConfig.pace);

      const staminaDepletedAtStart = state.runtimeStamina <= 0;
      const staminaPenaltyFactor = staminaDepletedAtStart ? raceConfig.stamina.depletionPenaltyMultiplier : 1;
      state.runtimeStamina = clamp(
        state.runtimeStamina - baseStaminaConsumptionPerSegment * pace.staminaConsumptionMultiplier,
        0,
        100,
      );

      // ConditionModifier: fitness + health, [0.6, 1.0] aralığına ölçeklenir.
      const conditionModifier = 0.6 + 0.4 * ((entry.fitness + entry.health) / 200);
      // Ön yarış (statik) fatigue: en fazla %20 performans kaybı.
      const preRaceFatigueFactor = 1 - (entry.fatigue / 100) * 0.2;

      const blocked = rollBlocked(simulationSeed, raceId, state.horseId, segmentIndex, pace.trafficRisk);
      const blockPenalty = blocked ? raceConfig.overtaking.blockPenalty : 0;
      const randomFactor = deriveRandomFactor(simulationSeed, raceId, state.horseId, segmentIndex, raceConfig);

      const rawScore =
        (state.baseAbility + pace.performanceBonus) *
          conditionModifier *
          environmentModifier.surfaceModifier *
          environmentModifier.weatherModifier *
          preRaceFatigueFactor *
          staminaPenaltyFactor +
        randomFactor -
        blockPenalty;

      const performanceScore = Math.max(MIN_SEGMENT_PERFORMANCE_SCORE, rawScore);
      state.performanceScores.push(performanceScore);

      const segmentSpeedMps = raceConfig.referenceSpeedMps * (performanceScore / 100);
      const segmentTimeMs = (raceConfig.segmentLengthMeters / segmentSpeedMps) * 1000;

      state.cumulativeTimeMs += segmentTimeMs;
      state.positionMeters += raceConfig.segmentLengthMeters;

      segments.push({
        // NOT: Bu aşamada henüz gerçek `race_entries.id` yok (o, persist
        // sırasında application layer tarafından atanır) — domain katmanı
        // atları `horseId` ile ayırt eder; API katmanı bunu kalıcı UUID'e eşler.
        raceEntryId: state.horseId,
        segmentDistanceMeters: raceConfig.segmentLengthMeters,
        timestampMs: Math.round(state.cumulativeTimeMs),
        positionMeters: state.positionMeters,
        speed: segmentSpeedMps,
        stamina: state.runtimeStamina,
        fatigue: entry.fatigue,
        lane: 1,
        tacticalState: state.racingStyle,
        currentRank: 0, // aşağıda bu segment için toplu olarak hesaplanır
      });
    }

    // Bu segment checkpoint'indeki sıralamayı (currentRank) toplu ata.
    const thisSegmentSnapshots = segments.slice(-runtimeStates.length);
    const ranked = [...thisSegmentSnapshots].sort((a, b) => a.timestampMs - b.timestampMs);
    ranked.forEach((snapshot, rankIndex) => {
      snapshot.currentRank = rankIndex + 1;
    });
  }

  const finalResult: RaceFinishEntry[] = [...runtimeStates]
    .sort((a, b) => a.cumulativeTimeMs - b.cumulativeTimeMs)
    .map((state, index) => ({
      horseId: state.horseId,
      finishTimeMs: Math.round(state.cumulativeTimeMs),
      finishPosition: index + 1,
      performanceScore: state.performanceScores.reduce((sum, s) => sum + s, 0) / state.performanceScores.length,
    }));

  return {
    raceId,
    simulationSeed,
    segments,
    finalResult,
    // brief §85 "Neden kazandım/kaybettim?" açıklaması ayrı bir saf fonksiyon
    // olarak planlanmıştır (docs/RACE_ENGINE.md §9) — FAZ 1 kapsamı dışında.
    explanations: [],
  };
}
