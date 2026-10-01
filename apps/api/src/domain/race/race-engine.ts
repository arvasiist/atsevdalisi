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
import { derivePaceEffect, derivePaceScore, deriveTacticEffect } from './pace';
import { deriveTemperamentEffect } from './temperament';
import {
  assignInitialLane,
  calculateAvailableSpace,
  calculateOvertakeProbability,
  deriveLaneChange,
} from './overtaking';
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
  /**
   * 01.10.2026 — OYUNCU KONTROLÜ (opsiyonel). Anahtar `horseId`, iç anahtar
   * segment indeksi. Verilmeyen at/segmentte jokey yapay zekâsı karar verir.
   * **Verilmezse ya da boşsa sonuç bit bit eskisiyle AYNIDIR** (tüm kollar
   * `cmd === undefined` iken eski yoldan geçer) — `race-engine-player-
   * control.spec.ts` bunu ve "komut yalnızca KENDİ segmentinden itibaren
   * etkiler" (önek değişmezliği) kuralını kilitler. Canlı yarış bu ikinci
   * kurala dayanır: gösterilmiş segmentler sonradan gelen komutla değişmez.
   */
  playerCommands?: ReadonlyMap<string, ReadonlyMap<number, PlayerSegmentCommand>>;
}

/** Bir atın bir segmentteki oyuncu komutu (01.10.2026). */
export interface PlayerSegmentCommand {
  /** Bu segmentte basılan kırbaç sayısı (≥ 0). */
  whips: number;
  /** -1 = içe (sol, kulvar 1'e doğru), +1 = dışa (sağ), 0 = yok. */
  laneShift: -1 | 0 | 1;
  /** Tempoyu düşür (yorgunluk daha yavaş birikir). */
  ease: boolean;
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
export const RACE_RULESET_VERSION = '1.3.0';
/**
 * PHASE 6 (brief §42 PHASE 6) — `1.1.0` → `1.2.0` YÜKSELTİLDİ. Gerekçe tam
 * olarak yukarıdaki kuraldır: segment döngüsünün 3-geçişli YAPISI (Geçiş
 * A/B/C) değişmedi (`RACE_ENGINE_VERSION` bu yüzden SABIT kalır), ama
 * `pace.ts`'e `deriveTacticEffect` eklendi ve nihai segment performans
 * formülü artık `startApproach`/`finalStretchPlan`'ı da içeriyor — yani
 * bir KURAL MODÜLÜNÜN iç formülü değişti.
 *
 * Bu satır olmadan, `1.1.0` ile üretilmiş ESKİ yarışlar yeni motorla
 * "replay" edildiğinde AYNI seed + AYNI snapshot'tan FARKLI bir sonuç
 * çıkardı ve bu sessizce fark edilmezdi.
 *
 * **PHASE 6.3 (29.09.2026) — `1.2.0` → `1.3.0`.** Aynı kural bir kez daha
 * işledi: 3-geçişli YAPI (Geçiş A/B/C) DEĞİŞMEDİ (`RACE_ENGINE_VERSION`
 * sabit), ama YENİ bir kural modülü (`temperament.ts`) devreye girdi ve
 * nihai segment performans formülü artık `horse_stats.temperament`'ı da
 * içeriyor. Ayrıca `race.config.json` sürümü `1.1.0` → `1.2.0` yükseldi
 * (yeni `temperament` bloğu) — ikisi AYRI sayaçlardır, bkz. yukarısı.
 *
 * ⚠️ **ESKİ SNAPSHOT'LARIN ÇOĞU İÇİN SONUÇ DEĞİŞMEZ** (`temperament` o
 * alanı hiç taşımıyorsa `undefined` → tam nötr), ama bu bir GARANTİ DEĞİLDİR:
 * `temperament`ı 50'den farklı olan bir snapshot yeni motorla farklı koşar.
 * Sürümü artırmanın tek sebebi bu ihtimaldir.
 */

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

function deriveRandomFactor(
  seed: string,
  raceId: string,
  horseId: string,
  segmentIndex: number,
  config: RaceBalanceConfig,
): number {
  const rng = createSeededRandom(`${seed}:${raceId}:${horseId}:${segmentIndex}:performance`);
  const [min, max] = config.randomFactorRange;
  return seededRange(rng, min, max);
}

function rollOvertakeSuccess(
  seed: string,
  raceId: string,
  horseId: string,
  segmentIndex: number,
  probability: number,
): boolean {
  const rng = createSeededRandom(`${seed}:${raceId}:${horseId}:${segmentIndex}:overtake`);
  return rng() < probability;
}

interface StandingInfo {
  isBoxedIn: boolean;
  aheadHorseId: string | null;
  isBeingChased: boolean;
}

/** O segmentin BAŞINDAKİ (bir önceki segment sonu) `cumulativeTimeMs`'e göre sıralama ve komşuluk bilgisi. */
function computeStandings(
  states: HorseRuntimeState[],
  raceConfig: RaceBalanceConfig,
): Map<string, StandingInfo> {
  const ordered = [...states].sort((a, b) => a.cumulativeTimeMs - b.cumulativeTimeMs);
  const result = new Map<string, StandingInfo>();

  ordered.forEach((state, index) => {
    const previous = index > 0 ? ordered[index - 1] : undefined;
    const next = index < ordered.length - 1 ? ordered[index + 1] : undefined;

    const gapToAheadMs = previous ? state.cumulativeTimeMs - previous.cumulativeTimeMs : Infinity;
    const gapToChaserMs = next ? next.cumulativeTimeMs - state.cumulativeTimeMs : Infinity;

    result.set(state.horseId, {
      // PHASE 6 — `gapToAheadMs > 0` ŞARTI BİR ADALET DÜZELTMESİDİR.
      // Yarışın BAŞINDA (segment 0) her atın `cumulativeTimeMs`'i tam olarak
      // 0'dır. `> 0` olmadan, `ordered` dizisinin İKİNCİ elemanı "önündeki
      // atla aynı hizada" olduğu için `isBoxedIn` sayılıyor ve o segmentte
      // bloklanma cezasını (15 puan) yiyebiliyordu — birincisi ise asla.
      // Yani `entries` dizisindeki SIRA, kimse fark etmeden bir avantaj
      // üretiyordu: iki BİT BİT ÖZDEŞ atla ölçüldüğünde birinci at
      // koşumların %65.2'sini kazanıyordu (beklenen %50).
      // Aynı hizada olmak "arkada olmak" değildir; ikisi yan yanadır.
      isBoxedIn:
        previous !== undefined &&
        gapToAheadMs > 0 &&
        gapToAheadMs <= raceConfig.overtaking.closeGapMs,
      aheadHorseId: previous?.horseId ?? null,
      isBeingChased:
        next !== undefined && gapToChaserMs <= raceConfig.jockeyDecision.opponentCloseGapMs,
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
  const environmentModifier = getEnvironmentModifier(
    input.surface,
    input.weather,
    weatherConfig,
    input.temperatureC,
  );
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

      const aiDecision = decideJockeyAction(
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
      // 01.10.2026 — oyuncu komutu yapay zekâ kararının YERİNE geçer: kırbaç
      // → finişe zorla, sakin → tempo düşür; yalnızca yön verildiyse karar
      // yapay zekânınkidir ama kulvarı oyuncu seçer.
      const command = input.playerCommands?.get(state.horseId)?.get(segmentIndex);
      const decision: JockeyDecision =
        command === undefined
          ? aiDecision
          : command.whips > 0
            ? 'push_for_finish'
            : command.ease
              ? 'reduce_pace'
              : aiDecision;
      decisionByHorseId.set(state.horseId, decision);

      if (command !== undefined && command.laneShift !== 0) {
        state.lane = clamp(state.lane + command.laneShift, 1, raceConfig.lanes.count);
      } else if (decision === 'search_overtake_lane') {
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
      const defenderRecentScore =
        defenderState.performanceScores.at(-1) ?? defenderState.baseAbility;
      const defenderDecision = decisionByHorseId.get(defenderState.horseId);
      const defenderBlockBonus =
        defenderDecision === 'defend_position' ? raceConfig.overtaking.defendPositionBonus : 0;

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

      const succeeded = rollOvertakeSuccess(
        simulationSeed,
        raceId,
        state.horseId,
        segmentIndex,
        probability,
      );
      blockedByHorseId.set(state.horseId, !succeeded);
    }

    // ---- Geçiş C: nihai segment performansı ----
    for (const state of runtimeStates) {
      const entry = entryByHorseId.get(state.horseId)!;
      const pace = derivePaceEffect(
        state.racingStyle,
        positionFraction,
        distanceMeters,
        raceConfig.pace,
      );
      // PHASE 6 — oyuncunun seçtiği `startApproach`/`finalStretchPlan` burada
      // motora girer (bkz. `pace.ts` → `deriveTacticEffect` doc yorumu).
      const tacticEffect = deriveTacticEffect(
        entry.tactic,
        positionFraction,
        distanceMeters,
        raceConfig.tactic,
        raceConfig.pace,
      );
      // PHASE 6.3 — atın KALICI kişiliği (bkz. `temperament.ts`). `undefined`
      // (bu alanı hiç doldurmayan eski fixture) ve 50 (başlangıç atlarının
      // varsayılanı, botların sabiti) TAM nötrdür — yani bu satır mevcut
      // ölçümleri DEĞİŞTİRMEZ.
      const temperamentEffect = deriveTemperamentEffect(
        entry.temperament,
        positionFraction,
        distanceMeters,
        raceConfig.segmentLengthMeters,
        raceConfig.temperament,
      );
      const decision = decisionByHorseId.get(state.horseId)!;
      const whips = input.playerCommands?.get(state.horseId)?.get(segmentIndex)?.whips ?? 0;

      const staminaBeforeSegment = state.runtimeStamina;
      const staminaDepletedAtStart = staminaBeforeSegment <= 0;
      const staminaPenaltyFactor = staminaDepletedAtStart
        ? raceConfig.stamina.depletionPenaltyMultiplier
        : 1;
      state.runtimeStamina = clamp(
        staminaBeforeSegment -
          baseStaminaConsumptionPerSegment *
            pace.staminaConsumptionMultiplier *
            tacticEffect.staminaConsumptionMultiplier *
            temperamentEffect.staminaConsumptionMultiplier -
          // 01.10.2026 — kırbacın bedeli (komutsuz yarışta whips = 0 → 0).
          whips * (whips > 0 ? raceConfig.playerControl.whipStaminaCost : 0),
        0,
        100,
      );

      // ConditionModifier: fitness + health, [0.6, 1.0] aralığına ölçeklenir.
      const conditionModifier = 0.6 + 0.4 * ((entry.fitness + entry.health) / 200);
      // Ön yarış (statik) fatigue: en fazla %20 performans kaybı.
      const preRaceFatigueFactor = 1 - (entry.fatigue / 100) * 0.2;

      const blocked = blockedByHorseId.get(state.horseId) ?? false;
      const blockPenalty = blocked ? raceConfig.overtaking.blockPenalty : 0;
      const randomFactor = deriveRandomFactor(
        simulationSeed,
        raceId,
        state.horseId,
        segmentIndex,
        raceConfig,
      );
      const baseSprintBonus = deriveSprintBonus(
        staminaBeforeSegment,
        decision,
        entry.jockeySkillComposite,
        raceConfig.sprint,
      );
      // 01.10.2026 — çok kırbaç azalan getiriyle güçlendirir (komutsuzda aynen eski değer).
      const sprintBonus =
        whips > 1
          ? baseSprintBonus * whips ** raceConfig.playerControl.whipBonusExponent
          : baseSprintBonus;

      state.runtimeFatigue = accumulateRuntimeFatigue(
        state.runtimeFatigue,
        decision,
        raceConfig.fatigue,
      );
      const fatiguePenalty = deriveFatiguePerformancePenalty(
        state.runtimeFatigue,
        raceConfig.fatigue,
      );

      // AUDIT_AND_HARDENING Öncelik 6 (bu oturum) — bkz. `modifier-
      // combination.ts` doc yorumu: BEŞ çarpansal modifikatör artık ARKA
      // ARKAYA ÇARPILMAZ (kontrolsüz yığılma), bunun yerine cezaları
      // TOPLANIP ortak bir taban ile SINIRLANDIRILMIŞ tek bir katsayıya
      // indirgenir.
      // Ekipman (bu turda EKLENDİ) — `entry.equipmentModifier` OPSİYONELDİR
      // (bkz. `RaceEntrantSnapshot.equipmentModifier` doc yorumu); `?? 1`
      // (nötr) varsayılanı, bu alanı HİÇ doldurmayan ESKİ fixture/test
      // nesnelerinin (bkz. o alanın doc yorumundaki dosya listesi)
      // davranışını DEĞİŞTİRMEZ — `combineConditionModifiers`'ın "TEK bir
      // modifikatör nötr değilken davranış AYNIDIR" ilkesiyle (bkz.
      // `modifier-combination.ts`) TUTARLI.
      const combinedConditionModifier = combineConditionModifiers([
        conditionModifier,
        environmentModifier.surfaceModifier,
        environmentModifier.weatherModifier,
        preRaceFatigueFactor,
        staminaPenaltyFactor,
        entry.equipmentModifier ?? 1,
      ]);

      const rawScore =
        (state.baseAbility +
          pace.performanceBonus +
          sprintBonus +
          tacticEffect.performanceBonus +
          temperamentEffect.performanceBonus) *
          combinedConditionModifier +
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
        // DİKKAT — bu, `horses.fatigue`'tan gelen STATİK (yarış ÖNCESİ)
        // değerdir; `domain/race/fatigue.ts`'in kendi doc yorumunun
        // "KARIŞTIRILMAMALIDIR" dediği ayrımın statik tarafı. Yarış
        // İÇİNDE segment segment BİRİKEN dinamik yorgunluk ise hemen
        // aşağıdaki `fatigueLevel`'dadır. Bu alan, kendisini tüketen
        // mevcut fixture/test'leri ve bu alan eklenmeden önce persist
        // edilmiş yarış kayıtlarını KIRMAMAK için geriye dönük uyumluluk
        // amacıyla KORUNUR (bkz. `RaceSegmentSnapshot.fatigueLevel`).
        fatigue: entry.fatigue,
        fatigueLevel: state.runtimeFatigue,
        paceScore: derivePaceScore(pace.staminaConsumptionMultiplier),
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
      performanceScore:
        state.performanceScores.reduce((sum, s) => sum + s, 0) / state.performanceScores.length,
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
