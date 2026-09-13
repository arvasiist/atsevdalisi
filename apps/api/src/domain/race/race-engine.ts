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
 *
 * **FAZ 5 (Advanced Race Engine) notu:** her segment artık ÜÇ geçişte
 * işlenir, çünkü geçiş/bloklanma (`overtaking.ts`) ve savunma
 * (`defend_position`) mekanikleri atların BİRBİRİNE göre kararlarına
 * bağlıdır:
 *   1. Geçiş A — o segmentin başlangıcındaki sıralamaya (standings) göre
 *      her at için jokey kararı (`jockey-decisions.ts`) belirlenir ve
 *      `search_overtake_lane` kararı varsa kulvar değişikliği uygulanır.
 *   2. Geçiş B — güncel kulvar doluluğuna göre, "boxed in" (önündeki atla
 *      arası çok yakın) atlar için geçiş denemesi çözülür (`overtaking.ts`).
 *   3. Geçiş C — pace/koşul/çevre/yorgunluk/sprint/bloklanma etkileri
 *      birleştirilip nihai segment performans puanı hesaplanır.
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
import { assignInitialLane, calculateAvailableSpace, calculateOvertakeProbability, deriveLaneChange } from './overtaking';
import { decideJockeyAction, type JockeyDecision } from './jockey-decisions';
import { deriveSprintBonus } from './sprint';
import { accumulateRuntimeFatigue, deriveFatiguePerformancePenalty } from './fatigue';
import { explainRace } from './race-explanation';
import { combineConditionModifiers } from './modifier-combination';

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

/**
 * AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — brief §58 / docs/RACE_ENGINE.md
 * §10'daki "RaceConfig(o anki versiyon)" kavramının SOMUT karşılığı;
 * `database/migrations/0021_add_race_versioning.up.sql`'in doc yorumuna bkz.
 *
 * `RACE_ENGINE_VERSION` bu dosyadaki (`simulateRace`) YAPISAL algoritmayı
 * (segment döngüsünün geçiş sayısı/sırası, hangi alt-modüllerin hangi
 * sırayla çağrıldığı) temsil eder — şu an FAZ5'in 3-geçişli modelidir
 * (bkz. dosya başındaki doc yorumu: "Geçiş A/B/C"). BU DOSYADA (`simulateRace`
 * içinde) segment döngüsünün YAPISI değişirse (yeni bir geçiş eklenir,
 * geçişlerin sırası değişir, vb.) bu değer ARTIRILMALIDIR — aksi halde
 * ESKİ yarışlar YENİ engine ile "replay" edilirken aynı seed+snapshot'tan
 * farklı bir sonuç üretebilir ve bu sessizce fark edilmeyebilir.
 *
 * `RACE_RULESET_VERSION` ise `overtaking.ts`/`jockey-decisions.ts`/
 * `sprint.ts`/`fatigue.ts`/`pace.ts`/`environment.ts`/`distance-category.ts`
 * gibi bu dosyanın ÇAĞIRDIĞI kural modüllerinin toplu sürümüdür — engine'in
 * 3-geçişli iskeleti AYNI kalsa bile bu modüllerden BİRİNİN iç formülü
 * (ör. `overtaking.ts`teki bir ağırlık formülünün kendisi, config'teki bir
 * SAYI değil) değişirse bu değer ARTIRILMALIDIR.
 *
 * İKİSİ DE `config/race.config.json`'ın kendi `version` alanından (bkz.
 * `RaceBalanceConfig.version`) AYRIDIR: SADECE config'teki sayısal denge
 * değerleri (ağırlık/çarpan) değişip kod DEĞİŞMEDEN kalırsa, engine/ruleset
 * sürümleri SABİT kalır ama config sürümü artar (bkz. Öncelik 6 — race
 * dengesi ayarları da bu mekanizmayı kullanacaktır).
 */
export const RACE_ENGINE_VERSION = '1.0.0';
/**
 * AUDIT_AND_HARDENING Öncelik 6 (bu oturum) — bu oturumda segment performans
 * puanının hesaplanma BİÇİMİ değişti (bkz. `modifier-combination.ts` ve
 * `pace.ts`teki `computeFinalStretchFraction`): çarpımsal modifikatör
 * yığılması yerine sınırlı ceza-toplama, ve final düzlüğün oran yerine
 * metre tabanlı hesaplanması. Segment döngüsünün 3-geçişli YAPISI (Geçiş
 * A/B/C) DEĞİŞMEDİĞİ için `RACE_ENGINE_VERSION` SABİT kalır — ama SONUÇ
 * formülü değiştiği için `RACE_RULESET_VERSION` `1.0.0` → `1.1.0`'a
 * yükseltilir (bkz. bu sabitin üstündeki genel doc yorumu). Bu, TAM OLARAK
 * Öncelik 4'ün var olma nedenidir: bu satır değişmeden önce üretilmiş
 * yarışlar `ruleset_version: '1.0.0'` ile işaretli KALIR, replay/audit bu
 * ikisini asla KARIŞTIRMAZ.
 */
export const RACE_RULESET_VERSION = '1.1.0';

interface HorseRuntimeState {
  horseId: string;
  baseAbility: number;
  racingStyle: RaceEntrantSnapshot['tactic']['racingStyle'];
  cumulativeTimeMs: number;
  positionMeters: number;
  runtimeStamina: number;
  runtimeFatigue: number;
  lane: number;
  performanceScores: number[];
}

function deriveRandomFactor(seed: string, raceId: string, horseId: string, segmentIndex: number, config: RaceBalanceConfig): number {
  const rng = createSeededRandom(`${seed}:${raceId}:${horseId}:${segmentIndex}:performance`);
  const [min, max] = config.randomFactorRange;
  return seededRange(rng, min, max);
}

function rollOvertakeSuccess(seed: string, raceId: string, horseId: string, segmentIndex: number, probability: number): boolean {
  const rng = createSeededRandom(`${seed}:${raceId}:${horseId}:${segmentIndex}:overtake`);
  return rng() < probability;
}

interface StandingInfo {
  isBoxedIn: boolean;
  aheadHorseId: string | null;
  isBeingChased: boolean;
}

/** O segmentin BAŞINDAKİ (bir önceki segment sonu) `cumulativeTimeMs`'e göre sıralama ve komşuluk bilgisi. */
function computeStandings(states: HorseRuntimeState[], raceConfig: RaceBalanceConfig): Map<string, StandingInfo> {
  const ordered = [...states].sort((a, b) => a.cumulativeTimeMs - b.cumulativeTimeMs);
  const result = new Map<string, StandingInfo>();

  ordered.forEach((state, index) => {
    const previous = index > 0 ? ordered[index - 1] : undefined;
    const next = index < ordered.length - 1 ? ordered[index + 1] : undefined;

    const gapToAheadMs = previous ? state.cumulativeTimeMs - previous.cumulativeTimeMs : Infinity;
    const gapToChaserMs = next ? next.cumulativeTimeMs - state.cumulativeTimeMs : Infinity;

    result.set(state.horseId, {
      isBoxedIn: previous !== undefined && gapToAheadMs <= raceConfig.overtaking.closeGapMs,
      aheadHorseId: previous?.horseId ?? null,
      isBeingChased: next !== undefined && gapToChaserMs <= raceConfig.jockeyDecision.opponentCloseGapMs,
    });
  });

  return result;
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
    runtimeFatigue: 0,
    lane: assignInitialLane(entry.tactic.racingStyle, raceConfig.lanes),
    performanceScores: [],
  }));

  const entryByHorseId = new Map(entries.map((entry) => [entry.horseId, entry]));
  const stateByHorseId = new Map(runtimeStates.map((state) => [state.horseId, state]));
  const segments: RaceSegmentSnapshot[] = [];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const positionFraction = (segmentIndex + 1) / segmentCount;
    const standings = computeStandings(runtimeStates, raceConfig);

    // ---- Geçiş A: jokey kararları + kulvar değişiklikleri ----
    const decisionByHorseId = new Map<string, JockeyDecision>();
    for (const state of runtimeStates) {
      const entry = entryByHorseId.get(state.horseId)!;
      const standing = standings.get(state.horseId)!;
      const sprintAvailable = state.runtimeStamina > raceConfig.sprint.staminaReserveThreshold;

      const decision = decideJockeyAction(
        {
          runtimeStamina: state.runtimeStamina,
          positionFraction,
          sprintAvailable,
          isBoxedIn: standing.isBoxedIn,
          isBeingChased: standing.isBeingChased,
          riskLevel: entry.tactic.riskLevel,
        },
        raceConfig.jockeyDecision,
      );
      decisionByHorseId.set(state.horseId, decision);

      if (decision === 'search_overtake_lane') {
        state.lane = deriveLaneChange(state.lane, true, raceConfig.lanes);
      }
    }

    // ---- Geçiş B: kulvar doluluğu + geçiş denemeleri ----
    const laneOccupantCounts = new Map<number, number>();
    for (const state of runtimeStates) {
      laneOccupantCounts.set(state.lane, (laneOccupantCounts.get(state.lane) ?? 0) + 1);
    }

    const blockedByHorseId = new Map<string, boolean>();
    for (const state of runtimeStates) {
      const standing = standings.get(state.horseId)!;
      if (!standing.isBoxedIn || standing.aheadHorseId === null) {
        continue;
      }

      const attackerEntry = entryByHorseId.get(state.horseId)!;
      const defenderState = stateByHorseId.get(standing.aheadHorseId)!;
      const occupantCount = laneOccupantCounts.get(state.lane) ?? 1;
      const availableSpace = calculateAvailableSpace(occupantCount, raceConfig.overtaking);
      const attackerRecentScore = state.performanceScores.at(-1) ?? state.baseAbility;
      const defenderRecentScore = defenderState.performanceScores.at(-1) ?? defenderState.baseAbility;
      const defenderDecision = decisionByHorseId.get(defenderState.horseId);
      const defenderBlockBonus = defenderDecision === 'defend_position' ? raceConfig.overtaking.defendPositionBonus : 0;

      const probability = calculateOvertakeProbability(
        {
          attackerAcceleration: attackerEntry.acceleration,
          attackerJockeySkill: attackerEntry.jockeySkillComposite,
          attackerRiskLevel: attackerEntry.tactic.riskLevel,
          speedDifference: attackerRecentScore - defenderRecentScore,
          availableSpace,
          defenderBlockBonus,
        },
        raceConfig.overtaking,
      );

      const succeeded = rollOvertakeSuccess(simulationSeed, raceId, state.horseId, segmentIndex, probability);
      blockedByHorseId.set(state.horseId, !succeeded);
    }

    // ---- Geçiş C: nihai segment performansı ----
    for (const state of runtimeStates) {
      const entry = entryByHorseId.get(state.horseId)!;
      const pace = derivePaceEffect(state.racingStyle, positionFraction, distanceMeters, raceConfig.pace);
      const decision = decisionByHorseId.get(state.horseId)!;

      const staminaBeforeSegment = state.runtimeStamina;
      const staminaDepletedAtStart = staminaBeforeSegment <= 0;
      const staminaPenaltyFactor = staminaDepletedAtStart ? raceConfig.stamina.depletionPenaltyMultiplier : 1;
      state.runtimeStamina = clamp(staminaBeforeSegment - baseStaminaConsumptionPerSegment * pace.staminaConsumptionMultiplier, 0, 100);

      // ConditionModifier: fitness + health, [0.6, 1.0] aralığına ölçeklenir.
      const conditionModifier = 0.6 + 0.4 * ((entry.fitness + entry.health) / 200);
      // Ön yarış (statik) fatigue: en fazla %20 performans kaybı.
      const preRaceFatigueFactor = 1 - (entry.fatigue / 100) * 0.2;

      const blocked = blockedByHorseId.get(state.horseId) ?? false;
      const blockPenalty = blocked ? raceConfig.overtaking.blockPenalty : 0;
      const randomFactor = deriveRandomFactor(simulationSeed, raceId, state.horseId, segmentIndex, raceConfig);
      const sprintBonus = deriveSprintBonus(staminaBeforeSegment, decision, entry.jockeySkillComposite, raceConfig.sprint);

      state.runtimeFatigue = accumulateRuntimeFatigue(state.runtimeFatigue, decision, raceConfig.fatigue);
      const fatiguePenalty = deriveFatiguePerformancePenalty(state.runtimeFatigue, raceConfig.fatigue);

      // AUDIT_AND_HARDENING Öncelik 6 (bu oturum) — bkz. `modifier-
      // combination.ts` doc yorumu: BEŞ çarpansal modifikatör artık ARKA
      // ARKAYA ÇARPILMAZ (kontrolsüz yığılma), bunun yerine cezaları
      // TOPLANIP ortak bir taban ile SINIRLANDIRILMIŞ tek bir katsayıya
      // indirgenir.
      const combinedConditionModifier = combineConditionModifiers([
        conditionModifier,
        environmentModifier.surfaceModifier,
        environmentModifier.weatherModifier,
        preRaceFatigueFactor,
        staminaPenaltyFactor,
      ]);

      const rawScore =
        (state.baseAbility + pace.performanceBonus + sprintBonus) * combinedConditionModifier +
        randomFactor -
        blockPenalty -
        fatiguePenalty;

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
        lane: state.lane,
        tacticalState: state.racingStyle,
        currentRank: 0, // aşağıda bu segment için toplu olarak hesaplanır
        blocked,
        decision,
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
    .sort((a, b) => {
      if (a.cumulativeTimeMs !== b.cumulativeTimeMs) {
        return a.cumulativeTimeMs - b.cumulativeTimeMs;
      }
      // Foto-finiş tam berabere (brief §25): önce son segment performansı
      // yüksek olan önde sayılır; o da eşitse `horseId` sözlük sırasına
      // göre (mutlak, girdi sırasından bağımsız bir determinism garantisi).
      const aLast = a.performanceScores.at(-1) ?? 0;
      const bLast = b.performanceScores.at(-1) ?? 0;
      if (aLast !== bLast) {
        return bLast - aLast;
      }
      return a.horseId < b.horseId ? -1 : a.horseId > b.horseId ? 1 : 0;
    })
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
    // brief §85 "Neden kazandım/kaybettim?" (bkz. `race-explanation.ts`, FAZ 5).
    explanations: explainRace(segments, finalResult),
  };
}
