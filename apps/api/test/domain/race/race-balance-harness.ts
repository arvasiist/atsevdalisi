/**
 * PHASE 5 — DENGE ÖLÇÜM KOŞUMU (brief §42 PHASE 5, 29.09.2026).
 *
 * **BU DOSYA BİR TEST DEĞİLDİR** (adı `*.spec.ts` değil, vitest onu
 * toplamaz). İki tüketicisi vardır ve ikisi de AYNI ölçümü görsün diye
 * buradadır:
 *   1. `race-balance.spec.ts` — CI'da 10.000+ simülasyon koşar ve
 *      eşikleri İDDİA eder (kırmızıya dönebilen taraf).
 *   2. `apps/api/tools/race-balance-report.ts` — aynı ölçümü koşup
 *      `docs/RACE_BALANCE_REPORT.md`'yi yazar (raporlayan taraf).
 *
 * İkisi AYRI kod olsaydı rapor ile CI'ın ölçtüğü şey zamanla ayrışırdı ve
 * rapor "yeşil CI"nın kanıtladığı şeyi anlatmayan bir belgeye dönüşürdü.
 *
 * ---
 *
 * ## Neden DÖRT AYRI SAHA (ve neden aynı sahada dört ölçüm YETMEZ)
 *
 * Denge ölçümünde en kolay yapılan hata, TEK bir sahada birden fazla
 * değişkeni aynı anda oynatmaktır: o zaman "fark yetenekten mi, taktikten
 * mi geldi" sorusu CEVAPLANAMAZ. Bu yüzden her ölçüm kendi sahasını kurar
 * ve o sahada TEK bir değişken bırakır.
 *
 *  - **Dar merdiven** (`LADDER_NARROW`): statlar GERÇEKÇİ bir bantta
 *    (62 → 74) düz bir merdiven oluşturur, TÜM atlar `mid_pack`. Gerçek
 *    bir sahada iki at arasındaki fark işte bu kadardır.
 *  - **Geniş merdiven** (`LADDER_WIDE`): aynı şey 55 → 85 bandında.
 *    Tek başına dar bant YETMEZ: "yetenek farkı büyüdükçe motor ne
 *    yapıyor" sorusunu ancak bant genişletilerek cevaplanabilir — ve
 *    cevap (aşağıdaki ÖLÇÜLEN BULGU) rahatsız edicidir.
 *  - **Stil sahası** (`buildStyleField`): statlar İSTATİSTİKSEL OLARAK
 *    ÖZDEŞ, tek değişken `racingStyle`. Ölçülen: "taktik seçimi kazanma
 *    payını haksız biçimde domine ediyor mu?" (`race-engine-field-balance.
 *    spec.ts`'teki T3 metodolojisinin 5 saha boyutuna genişletilmiş hâli).
 *  - **Bot sahası** (`buildBotField`): ÜRETİMDEKİ gerçek fonksiyon
 *    (`generateBotEntrants`, `settle-race.use-case.ts`'in de çağırdığı).
 *    Ölçülen: "yukarıdaki üç sentetik saha gerçek üretim sahasını temsil
 *    ediyor mu?" — sentetik sahalar iyimser olabilir; bu olmasa rapor
 *    "ölçtüğüm şey üretimde yok" durumunu gizlerdi.
 *
 * ## ÖLÇÜLEN BULGU — motorun sürpriz payı DARDIR (bu dilimin asıl çıktısı)
 *
 * 10.000 koşumluk ölçüm iki şeyi birlikte gösterdi ve **ikincisi ilk
 * bakışta beklenmeyen olandır**:
 *
 *  1. Merdiven sahalarında favori **%76-98** kazanıyor ve merdivenin
 *     **alt yarısı HİÇ kazanmıyor** (`Son yarı toplam` = 0.00%).
 *  2. **Dar bant da neredeyse aynı derecede deterministik.** Bant
 *     daraltmak (62→74) favoriyi %93'ten %76'ya indiriyor — ama alt yarı
 *     hâlâ 10.000 yarışta hiç kazanmıyor. Yani sorun bandın genişliği
 *     DEĞİL.
 *
 * Kök neden ölçülebilir bir orandır: `race.config.json` →
 * `randomFactorRange: [-6, 6]` segment başına ±6 puandır, ama segment
 * performansları yarış boyunca (8 segment) toplanır — yani gürültünün
 * yarış düzeyindeki standart hatası `6/√3/√8 ≈ 1.2` puana iner. Merdiven
 * sahasında komşu iki atın farkı bunun üzerindedir, dolayısıyla sıralama
 * neredeyse önceden belirlenir.
 *
 * **Bu, "aynı seed aynı sonuç" garantisiyle KARIŞTIRILMAMALIDIR:**
 * determinizm motorun *doğruluğudur*; buradaki bulgu oyunun **sürpriz
 * payının** genişliğidir — farklı seed'ler bile aynı sıralamayı üretir.
 *
 * ## Neden merdiven sahaları ÜRETİM değildir — ve gerçek sayı hangisi
 *
 * Merdiven sahası YAPAYDIR: orada sekiz ayrı özellik (speed, stamina,
 * acceleration, fitness, morale, surface/distance uyumu, yorgunluk) AYNI
 * ANDA ve AYNI YÖNDE hareket eder. Gerçek bir sahada iki at farklı
 * özelliklerde birbirini geçer ve `computeBaseAbility` farkı küçülür.
 * Bu yüzden merdiven bir **yetenek aktarım probudur** (“motor yeteneği ne
 * kadar güçlü ödüllendiriyor”), denge tablosu DEĞİLDİR.
 *
 * Üretim gerçeği bot sahasıdır (§4) — ve orada tablo tamamen farklıdır:
 * rastgele sahalarda favori ortalama **%42-48** kazanır. Asıl denge
 * iddiaları bu yüzden bot sahasında kurulur.
 *
 * Rapor bulguyu bir denge riski olarak yazar. **Bu dilim denge DEĞERİNİ
 * DEĞİŞTİRMEDİ** (CLAUDE.md kural 2 — "RACE ENGINE'E DOKUNMA"): config'teki
 * bir sayıyı oynatmak, dondurulmuş eski yarışların replay'ini sessizce
 * başka bir sonuca çevirirdi. Ölçüm, karar için gerekli sayıyı üretir;
 * karar proje sahibinindir.
 *
 * ## Neden `gatePosition` ÖLÇÜLMÜYOR
 *
 * Ölçülmek İSTENDİ ve ÖLÇÜLEMEDİ: `gatePosition` (`race_entries.
 * gate_position`) motora HİÇ girmez. `simulateRace` onu okumaz; yalnızca
 * `settle-race.use-case.ts` yazar, `postgres-race.repository.ts` saklar ve
 * `race.gateway.ts` istemciye geri yansıtır. Yani "kapı pozisyonu
 * yanlılığı" diye ölçülecek bir olgu bu motorda YOKTUR ve olmayan bir
 * etkiyi "dengeli çıktı" diye raporlamak uydurma olurdu.
 */

import type { RaceBalanceConfig, WeatherConfig } from '@at-sevdalisi/game-config';
import type { RaceEntrantSnapshot, RacingStyle } from '@at-sevdalisi/shared-types';
import { simulateRace } from '../../../src/domain/race/race-engine';
import { computeBaseAbility } from '../../../src/domain/race/base-ability';
import { computeWeightCompatibility } from '../../../src/domain/race/carried-weight';
import { generateBotEntrants } from '../../../src/domain/race/bot-generator';
import { NEUTRAL_UNMODELED_TRAIT_SCORE } from '../../../src/domain/race/entrant-snapshot';
import { RACING_STYLES } from '../../../src/domain/race/validation';
import raceConfigJson from '../../../../../config/race.config.json';
import weatherConfigJson from '../../../../../config/weather.config.json';
import raceLobbyConfigJson from '../../../../../config/race-lobby.config.json';

export const raceBalanceConfig = raceConfigJson as unknown as RaceBalanceConfig;
export const raceBalanceWeatherConfig = weatherConfigJson as unknown as WeatherConfig;

/**
 * Saha boyutları **config'ten** okunur, koda gömülmez (CLAUDE.md kural 6).
 * `config/race-lobby.config.json` → `fieldSizes` `races.field_size` CHECK
 * kısıtının tek doğruluk kaynağıdır; brief'in saydığı 8/10/12/14/16 bu
 * dosyadan gelir. Koda ikinci bir liste gömmek, config'e yeni bir boyut
 * eklendiğinde onu sessizce ölçüm dışı bırakırdı.
 */
export const FIELD_SIZES: readonly number[] = raceLobbyConfigJson.fieldSizes;

/** Ölçümün kanonik yarışı — brief §42 PHASE 5 boyut ister, mesafe sabit tutulur. */
export const CANONICAL_DISTANCE_METERS = 1600;
export const CANONICAL_SURFACE = 'grass' as const;
export const CANONICAL_WEATHER = 'sunny' as const;
export const CANONICAL_TEMPERATURE_C = 22;

/**
 * Merdiven bantları. `bot-generator.ts`'in bot bandı 45-75'tir; **dar**
 * bant onun içindedir (gerçek bir sahada iki at arasındaki fark budur),
 * **geniş** bant üst uçta antrenmanlı bir oyuncu atına kadar çıkar.
 */
export const LADDER_NARROW = { weakStat: 62, strongStat: 74, label: '62 → 74' } as const;
export const LADDER_WIDE = { weakStat: 55, strongStat: 85, label: '55 → 85' } as const;

/** İdeal vücut ağırlığı — merdiven ölçümünde SABİT, `carriedWeight` kirişi kirletmesin. */
const LADDER_WEIGHT_KG = 495;

/**
 * Merdiven sahasında statların YANINDA sürüklenen ikincil özellikler.
 *
 * `{ base, span }` → `t` (0 = en zayıf at, 1 = en güçlü at) için değer
 * `base + span * t`. Merdivenin TAMAMI aynı yönde hareket ettiği için
 * (bkz. dosya başı: "merdiven YAPAYDIR") bu rampalar da aynı yöndedir —
 * amaç ikincil özelliklerin ölçüme GÜRÜLTÜ katmaması, kendi başına bir
 * denge iddiası kurmamasıdır. Sabitler burada ADLANDIRILMIŞTIR çünkü
 * `no-magic-numbers` kuralı dosya gövdesindeki çıplak sayıları yasaklar.
 */
const LADDER_SECONDARY_RAMPS = {
  fitness: { base: 70, span: 20 },
  fatigue: { base: 20, span: -10 },
  health: 90,
  morale: { base: 60, span: 20 },
  surfaceCompatibility: { base: 60, span: 30 },
  distanceCompatibility: { base: 60, span: 30 },
} as const;

/** Stil sahasının nötr atı — T3'ün (`race-engine-field-balance.spec.ts`) kendi profili. */
const STYLE_FIELD_PROFILE = {
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
  form: 50,
} as const;

/** `{ base, span }` rampasını `t ∈ [0,1]` için tam sayıya çevirir. */
function ramp(spec: { readonly base: number; readonly span: number }, t: number): number {
  return Math.round(spec.base + spec.span * t);
}

function baseInput(entries: RaceEntrantSnapshot[], simulationSeed: string, distanceMeters: number) {
  return {
    raceId: `balance-${distanceMeters}`,
    simulationSeed,
    distanceMeters,
    surface: CANONICAL_SURFACE,
    weather: CANONICAL_WEATHER,
    temperatureC: CANONICAL_TEMPERATURE_C,
    entries,
    raceConfig: raceBalanceConfig,
    weatherConfig: raceBalanceWeatherConfig,
  };
}

/**
 * En güçlü attan en zayıfa DÜZ merdiven; hepsi `mid_pack`.
 *
 * `jockeySkillComposite` nötr (50) bırakılır — ama gerekçe DEĞİŞTİ
 * (PHASE 6.2, 29.09.2026). Eskiden "jokey motora bağlı değil" deniyordu;
 * o cümle ARTIK YANLIŞ: `jockeySkillComposite` gerçek bir girdidir
 * (`race-engine.ts` Geçiş C). Burada nötr bırakılmasının sebebi artık
 * **kontroldür**: bu saha YETENEK merdivenini ölçer, jokey etkisini
 * değil. Jokeyin etkisi kendi spec'inde (`jockey-decisions.spec.ts`)
 * ölçülür. Aynı sebeple `temperament` burada **hiç verilmez**
 * (`undefined` = tam nötr, `temperament.ts` bunu garanti eder) — yani
 * bu saha kişiliği de sabit tutar.
 */
export function buildAbilityLadderField(
  fieldSize: number,
  band: { weakStat: number; strongStat: number },
  horseIdPrefix: string,
): RaceEntrantSnapshot[] {
  const weightCompatibility = computeWeightCompatibility(LADDER_WEIGHT_KG);
  return Array.from({ length: fieldSize }, (_, index) => {
    // index 0 → en güçlü (t = 1), son index → en zayıf (t = 0).
    const t = fieldSize === 1 ? 1 : (fieldSize - 1 - index) / (fieldSize - 1);
    const stat = Math.round(band.weakStat + t * (band.strongStat - band.weakStat));
    return {
      horseId: `${horseIdPrefix}-${index}`,
      speed: stat,
      stamina: stat,
      acceleration: stat,
      fitness: ramp(LADDER_SECONDARY_RAMPS.fitness, t),
      fatigue: ramp(LADDER_SECONDARY_RAMPS.fatigue, t),
      health: LADDER_SECONDARY_RAMPS.health,
      morale: ramp(LADDER_SECONDARY_RAMPS.morale, t),
      surfaceCompatibility: ramp(LADDER_SECONDARY_RAMPS.surfaceCompatibility, t),
      distanceCompatibility: ramp(LADDER_SECONDARY_RAMPS.distanceCompatibility, t),
      jockeySkillComposite: NEUTRAL_UNMODELED_TRAIT_SCORE,
      weightCompatibility,
      form: NEUTRAL_UNMODELED_TRAIT_SCORE,
      tactic: { racingStyle: 'mid_pack', riskLevel: 'normal', startApproach: 'balanced', finalStretchPlan: 'normal' },
    } satisfies RaceEntrantSnapshot;
  });
}

/**
 * İstatistiksel olarak ÖZDEŞ atlar; tek değişken `racingStyle`. Stiller
 * `index % 4` ile dağıtılır — bu yüzden bir stilin **beklenen** payı
 * `count/N`'dir ve 10/14 atlık alanlarda %25 DEĞİLDİR (3-3-2-2 / 4-4-3-3).
 * Sabit %25 eşiği kullanmak, o iki boyutta ölçüm hatası olurdu.
 */
export function buildStyleField(fieldSize: number): RaceEntrantSnapshot[] {
  return Array.from({ length: fieldSize }, (_, index) => ({
    horseId: `style-${index}`,
    ...STYLE_FIELD_PROFILE,
    weightCompatibility: computeWeightCompatibility(LADDER_WEIGHT_KG),
    tactic: {
      racingStyle: RACING_STYLES[index % RACING_STYLES.length] as RacingStyle,
      riskLevel: 'normal',
      startApproach: 'balanced',
      finalStretchPlan: 'normal',
    },
  })) as RaceEntrantSnapshot[];
}

/**
 * ÜRETİMDEKİ bot üreticisi — `settle-race.use-case.ts` ile AYNI fonksiyon.
 * Bu sahada stil tablosu TUTULMAZ: saha denemeler boyunca SABİT olduğu
 * için en güçlü botun hangi stile düştüğü bir yazı-turadır ve stil
 * "payı"nı ölçmek o tesadüfü ölçmek olurdu (ilk koşumda tam olarak bu
 * yanılgı görüldü: 12'lik sahada `mid_pack` %92 çıktı — çünkü en güçlü bot
 * `mid_pack`'ti). Bot sahasında ölçülen şey YETENEK dağılımıdır.
 */
export function buildBotField(fieldSize: number, seedBase: string): RaceEntrantSnapshot[] {
  return generateBotEntrants(fieldSize, seedBase);
}

export interface AbilityRun {
  label: string;
  /** index 0 = merdivenin en güçlü atı. */
  winsByAbilityRank: number[];
  favoriteWinRate: number;
  weakestWinRate: number;
  /** Tarafsız bir motorda beklenen pay: `1 / fieldSize`. */
  uniformWinRate: number;
  /** Merdivenin ilk yarısının toplam galibiyet payı. */
  topHalfShare: number;
  bottomHalfShare: number;
  /** 10.000 yarışta HİÇ kazanmamış at sayısı — "yapısal olarak ölü" göstergesi. */
  deadHorses: number;
  /** Tek bir atın galibiyetlerden aldığı EN YÜKSEK pay. */
  mostWinsShare: number;
  /** `computeBaseAbility` çıktısı ile galibiyet sayısı arasındaki Spearman katsayısı. */
  abilityRankCorrelation: number;
}

export interface StyleRun {
  winsByStyle: Record<string, number>;
  observedShare: Record<string, number>;
  /** `count/N` — sabit %25 DEĞİL. */
  expectedShare: Record<string, number>;
}

/**
 * Üretim bot ölçümü — **TEK saha DEĞİL, `BOT_FIELD_SAMPLES` ayrı saha**.
 *
 * Bu ayrım ilk koşumda bir hatayı ele verdi: saha sabit tutulunca 12'lik
 * sahanın favorisi %90.95 kazandı, 8/10/14/16'nınki ise %42-48'de kaldı.
 * Fark motordan değil **tek bir yazı-turasından** geliyordu: sabit sahada
 * en güçlü botun ikinciye ne kadar fark attığı tek bir çekiliştir.
 *
 * Üretimde ise her lobi KENDİ rastgele bot sahasını alır
 * (`settle-race.use-case.ts` seed'i yarış başına üretir). Doğru soru
 * “bu sabit sahada kim kazanıyor” değil, **“rastgele bir sahada favori
 * ortalama ne sıklıkla kazanıyor ve en kötü durumda ne oluyor”**dur.
 * Bu yüzden ölçüm sahalar arasında dağıtılır.
 */
export interface BotRun {
  /** Kaç ayrı rastgele bot sahası örneklendi. */
  fields: number;
  racesPerField: number;
  /** Sahalar arasında ortalama favori galibiyet payı — ASIL üretim sayısı. */
  meanFavoriteWinRate: number;
  /** En kötü saha: tek bir lobide favori ne kadar domine edebiliyor. */
  worstFavoriteWinRate: number;
  meanDeadHorses: number;
  maxDeadHorses: number;
  meanMostWinsShare: number;
  uniformWinRate: number;
  meanWinnerTimeMs: number;
  meanSpreadMs: number;
}

export interface StructuralRun {
  trials: number;
  /** `finishPosition` kümesi 1..N DEĞİLSE (regresyon göstergesi). */
  nonPermutationRaces: number;
  /** En az bir tam beraberlik (aynı `finishTimeMs`) içeren yarış sayısı. */
  tiedRaces: number;
  /** `finalResult.length !== fieldSize` olan yarış sayısı. */
  wrongLengthRaces: number;
  meanWinnerTimeMs: number;
  meanLastTimeMs: number;
  meanSpreadMs: number;
  /** Aynı seed ikinci kez koşulduğunda FARKLI sonuç veren yarış sayısı. */
  determinismMismatches: number;
  determinismChecks: number;
}

export interface FieldSizeMeasurement {
  fieldSize: number;
  trials: number;
  distanceMeters: number;
  abilityNarrow: AbilityRun;
  abilityWide: AbilityRun;
  style: StyleRun;
  bot: BotRun;
  structural: StructuralRun;
}

function spearman(values: readonly number[], counts: readonly number[]): number {
  const n = values.length;
  const meanA = values.reduce((sum, v) => sum + v, 0) / n;
  const meanB = counts.reduce((sum, v) => sum + v, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = values[i]! - meanA;
    const db = counts[i]! - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) {
    return 0;
  }
  return cov / Math.sqrt(varA * varB);
}

/**
 * Determinizm kontrolü — ilk `DETERMINISM_CHECKS` seed iki kez koşulur ve
 * bit bit karşılaştırılır. **DIŞA AÇILIR**: rapor üreticisi aynı sayıyı
 * metnine yazar; iki yerde ayrı sabit tutmak, raporun "25 seed kontrol
 * edildi" derken aslında 10'unu kontrol etmesi demek olurdu.
 */
export const DETERMINISM_CHECKS = 25;

/**
 * Kaç ayrı RASTGELE bot sahası örneklenecek. Tek saha yetmez (bkz.
 * `BotRun` doc yorumu): sabit sahada favori payı tek bir çekilişin
 * sonucudur, üretimde ise her lobi kendi sahasını alır.
 */
export const BOT_FIELD_SAMPLES = 20;

function runAbilityLadder(
  fieldSize: number,
  trials: number,
  band: { weakStat: number; strongStat: number; label: string },
  prefix: string,
): AbilityRun {
  const entries = buildAbilityLadderField(fieldSize, band, `${prefix}-${fieldSize}`);
  const winsByAbilityRank = new Array<number>(fieldSize).fill(0);

  for (let i = 0; i < trials; i += 1) {
    const timeline = simulateRace(baseInput(entries, `${prefix}-${fieldSize}-${i}`, CANONICAL_DISTANCE_METERS));
    const winnerId = timeline.finalResult[0]!.horseId;
    const rank = Number(winnerId.slice(winnerId.lastIndexOf('-') + 1));
    winsByAbilityRank[rank] = (winsByAbilityRank[rank] ?? 0) + 1;
  }

  const half = Math.floor(fieldSize / 2);
  const topHalfWins = winsByAbilityRank.slice(0, half).reduce((sum, v) => sum + v, 0);
  const bottomHalfWins = winsByAbilityRank.slice(fieldSize - half).reduce((sum, v) => sum + v, 0);
  // `computeBaseAbility` ile merdiven sırasının AYNI olduğunu VARSAYMIYORUZ:
  // korelasyon, motorda GERÇEKTEN kullanılan taban puanla ölçülür.
  const baseAbilities = entries.map((entry) => computeBaseAbility(entry, raceBalanceConfig.baseAbilityWeights));

  return {
    label: band.label,
    winsByAbilityRank,
    favoriteWinRate: winsByAbilityRank[0]! / trials,
    weakestWinRate: winsByAbilityRank[fieldSize - 1]! / trials,
    uniformWinRate: 1 / fieldSize,
    topHalfShare: topHalfWins / trials,
    bottomHalfShare: bottomHalfWins / trials,
    deadHorses: winsByAbilityRank.filter((wins) => wins === 0).length,
    mostWinsShare: Math.max(...winsByAbilityRank) / trials,
    abilityRankCorrelation: spearman(baseAbilities, winsByAbilityRank),
  };
}

function runStructural(
  fieldSize: number,
  trials: number,
  entries: RaceEntrantSnapshot[],
  seedPrefix: string,
): StructuralRun {
  let nonPermutationRaces = 0;
  let tiedRaces = 0;
  let wrongLengthRaces = 0;
  let determinismMismatches = 0;
  let winnerTimeSum = 0;
  let lastTimeSum = 0;
  let spreadSum = 0;
  let determinismChecks = 0;

  for (let i = 0; i < trials; i += 1) {
    const seed = `${seedPrefix}-${i}`;
    const timeline = simulateRace(baseInput(entries, seed, CANONICAL_DISTANCE_METERS));
    const results = timeline.finalResult;

    if (results.length !== fieldSize) {
      wrongLengthRaces += 1;
      continue;
    }

    const positions = results.map((r) => r.finishPosition).sort((a, b) => a - b);
    const isPermutation = positions.every((position, index) => position === index + 1);
    if (!isPermutation || new Set(results.map((r) => r.horseId)).size !== fieldSize) {
      nonPermutationRaces += 1;
    }
    if (new Set(results.map((r) => r.finishTimeMs)).size !== fieldSize) {
      tiedRaces += 1;
    }

    winnerTimeSum += results[0]!.finishTimeMs;
    lastTimeSum += results[results.length - 1]!.finishTimeMs;
    spreadSum += results[results.length - 1]!.finishTimeMs - results[0]!.finishTimeMs;

    if (i < DETERMINISM_CHECKS) {
      determinismChecks += 1;
      const replay = simulateRace(baseInput(entries, seed, CANONICAL_DISTANCE_METERS));
      if (JSON.stringify(replay) !== JSON.stringify(timeline)) {
        determinismMismatches += 1;
      }
    }
  }

  return {
    trials,
    nonPermutationRaces,
    tiedRaces,
    wrongLengthRaces,
    meanWinnerTimeMs: winnerTimeSum / trials,
    meanLastTimeMs: lastTimeSum / trials,
    meanSpreadMs: spreadSum / trials,
    determinismMismatches,
    determinismChecks,
  };
}

export function measureFieldSize(fieldSize: number, trials: number): FieldSizeMeasurement {
  const abilityNarrow = runAbilityLadder(fieldSize, trials, LADDER_NARROW, 'balance-narrow');
  const abilityWide = runAbilityLadder(fieldSize, trials, LADDER_WIDE, 'balance-wide');

  // ---- Stil ----
  const styleField = buildStyleField(fieldSize);
  const winsByStyle: Record<string, number> = {};
  for (const style of RACING_STYLES) {
    winsByStyle[style] = 0;
  }
  for (let i = 0; i < trials; i += 1) {
    const timeline = simulateRace(baseInput(styleField, `balance-style-${fieldSize}-${i}`, CANONICAL_DISTANCE_METERS));
    const winnerId = timeline.finalResult[0]!.horseId;
    const winner = styleField.find((entry) => entry.horseId === winnerId)!;
    winsByStyle[winner.tactic.racingStyle] = (winsByStyle[winner.tactic.racingStyle] ?? 0) + 1;
  }
  const observedShare: Record<string, number> = {};
  const expectedShare: Record<string, number> = {};
  for (const style of RACING_STYLES) {
    observedShare[style] = winsByStyle[style]! / trials;
    expectedShare[style] = styleField.filter((entry) => entry.tactic.racingStyle === style).length / fieldSize;
  }

  // ---- Üretim bot sahaları (rastgele lobiler) ----
  const racesPerField = Math.max(1, Math.floor(trials / BOT_FIELD_SAMPLES));
  let favoriteRateSum = 0;
  let worstFavoriteRate = 0;
  let deadSum = 0;
  let maxDead = 0;
  let mostWinsSum = 0;
  let botWinnerSum = 0;
  let botSpreadSum = 0;
  let botRaces = 0;

  for (let fieldIndex = 0; fieldIndex < BOT_FIELD_SAMPLES; fieldIndex += 1) {
    const botField = buildBotField(fieldSize, `balance-bots-${fieldSize}-${fieldIndex}`);
    const botWins = new Array<number>(fieldSize).fill(0);
    for (let i = 0; i < racesPerField; i += 1) {
      const timeline = simulateRace(
        baseInput(botField, `balance-bot-${fieldSize}-${fieldIndex}-${i}`, CANONICAL_DISTANCE_METERS),
      );
      const winnerIndex = botField.findIndex((entry) => entry.horseId === timeline.finalResult[0]!.horseId);
      botWins[winnerIndex] = (botWins[winnerIndex] ?? 0) + 1;
      botWinnerSum += timeline.finalResult[0]!.finishTimeMs;
      botSpreadSum +=
        timeline.finalResult[timeline.finalResult.length - 1]!.finishTimeMs - timeline.finalResult[0]!.finishTimeMs;
    }
    botRaces += racesPerField;

    // "Favori" = `computeBaseAbility` çıktısı en yüksek olan bot; bu, motorda
    // GERÇEKTEN kullanılan taban puandır, sahaya bakıp seçilmiş bir etiket değil.
    const baseAbilities = botField.map((entry) => computeBaseAbility(entry, raceBalanceConfig.baseAbilityWeights));
    const favoriteIndex = baseAbilities.indexOf(Math.max(...baseAbilities));
    const favoriteRate = botWins[favoriteIndex]! / racesPerField;

    favoriteRateSum += favoriteRate;
    worstFavoriteRate = Math.max(worstFavoriteRate, favoriteRate);
    const dead = botWins.filter((wins) => wins === 0).length;
    deadSum += dead;
    maxDead = Math.max(maxDead, dead);
    mostWinsSum += Math.max(...botWins) / racesPerField;
  }

  return {
    fieldSize,
    trials,
    distanceMeters: CANONICAL_DISTANCE_METERS,
    abilityNarrow,
    abilityWide,
    style: { winsByStyle, observedShare, expectedShare },
    bot: {
      fields: BOT_FIELD_SAMPLES,
      racesPerField,
      meanFavoriteWinRate: favoriteRateSum / BOT_FIELD_SAMPLES,
      worstFavoriteWinRate: worstFavoriteRate,
      meanDeadHorses: deadSum / BOT_FIELD_SAMPLES,
      maxDeadHorses: maxDead,
      meanMostWinsShare: mostWinsSum / BOT_FIELD_SAMPLES,
      uniformWinRate: 1 / fieldSize,
      meanWinnerTimeMs: botWinnerSum / botRaces,
      meanSpreadMs: botSpreadSum / botRaces,
    },
    structural: runStructural(
      fieldSize,
      trials,
      buildAbilityLadderField(fieldSize, LADDER_NARROW, `balance-struct-${fieldSize}`),
      `balance-struct-${fieldSize}`,
    ),
  };
}

/** Mesafe duyarlılığı — "uzun yarış gerçekten daha yavaş mı" sorusu. */
export interface DistanceProbe {
  distanceMeters: number;
  meanWinnerTimeMs: number;
}

export function probeDistance(fieldSize: number, distanceMeters: number, trials: number): DistanceProbe {
  const entries = buildStyleField(fieldSize);
  let sum = 0;
  for (let i = 0; i < trials; i += 1) {
    const timeline = simulateRace(
      baseInput(entries, `balance-distance-${fieldSize}-${distanceMeters}-${i}`, distanceMeters),
    );
    sum += timeline.finalResult[0]!.finishTimeMs;
  }
  return { distanceMeters, meanWinnerTimeMs: sum / trials };
}
