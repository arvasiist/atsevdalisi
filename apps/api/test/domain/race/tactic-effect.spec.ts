import { describe, expect, it } from 'vitest';
import { deriveTacticEffect } from '../../../src/domain/race/pace';
import { RACE_RULESET_VERSION, simulateRace, type RaceSimulationInput } from '../../../src/domain/race/race-engine';
import raceConfigJson from '../../../../../config/race.config.json';
import weatherConfigJson from '../../../../../config/weather.config.json';
import type { RaceBalanceConfig, WeatherConfig } from '@at-sevdalisi/game-config';
import type {
  FinalStretchPlan,
  RaceEntrantSnapshot,
  RaceTimeline,
  StartApproach,
} from '@at-sevdalisi/shared-types';

/**
 * PHASE 6 — TAKTİK ALANLARININ MOTOR ETKİSİ (brief §42 PHASE 6).
 *
 * **BU DOSYANIN VAR OLMA SEBEBİ.** `RaceTacticInput` dört alandan oluşur ve
 * `assertValidRaceTactic` DÖRDÜNÜ DE doğruluyordu — ama `simulateRace`
 * yalnızca `racingStyle` ve `riskLevel`'ı okuyordu. `startApproach` ve
 * `finalStretchPlan` oyuncudan alınıyor, doğrulanıyor, veritabanına
 * yazılıyor ve sonuca HİÇ ETKİ ETMİYORDU. Bu, "doğrulanan ama tüketilmeyen
 * alan" sınıfının en tehlikeli hâlidir: hiçbir yerde hata üretmez, oyuncuya
 * ise bir SEÇİM yaptığını söyler.
 *
 * Bu dosya iddiayı iki katmanda kurar:
 *   1. **Mekanizma** — `deriveTacticEffect` saf fonksiyonunun pencereleri,
 *      nötrlüğü ve ödünleşim yönü (birim testleri).
 *   2. **Sonuç** — aynı saha, aynı seed, TEK fark taktik: bitiş sırası
 *      ölçülebilir biçimde değişiyor mu? (motor testleri)
 *
 * 2. katman olmadan 1. katman "fonksiyon doğru" der ama "motor onu
 * ÇAĞIRIYOR" demez — ve asıl kırılan şey tam olarak çağrıydı.
 *
 * ## Bu dosyanın ÖLÇTÜĞÜ ve yazarken DEĞİŞTİRDİĞİ şeyler (2.000 koşum/ölçüm)
 *
 * 1. **`isBoxedIn` bir adalet hatasıydı** (`race-engine.ts`). "Önündekiyle
 *    AYNI HİZADA olmak" bloklanma sayılıyordu; yarış başında herkes 0'da
 *    olduğu için `entries` dizisinin İKİNCİ elemanı bedavaya ceza yiyebiliyordu.
 *    Özdeş iki atın galibiyet payı %65.2 çıkıyordu → düzeltildi, %49.65.
 * 2. **`normal` final planı nötr DEĞİLDİ** — `bonusMultiplier: 1` taban
 *    bonusu (3) veriyordu, yani "hiçbir şey seçmeyen" oyuncuya sessiz bir
 *    artı yazıyordu. Taban 6'ya çıkarılıp `normal` AÇIKÇA referans yapıldı.
 * 3. **Stamina çarpanı bu eksende BIRAKILDI.** `baseStaminaConsumptionPerSegment`
 *    zaten `100 / segmentCount` olduğu için stamina TAM bitişte tükenir;
 *    1.0 üstü her çarpan son segmenti depletion cezasına sokar. Ölçüldü:
 *    `aggressive`e 1.15 vermek galibiyet payını %52.9 → %5.4'e düşürdü —
 *    bir ödünleşim değil, bıçak sırtı.
 * 4. **Puan transferi simetrik olsa da SONUÇ simetrik değil.** Motor
 *    `segmentTimeMs = k / performanceScore` ile DIŞBÜKEY (Jensen): aynı
 *    ortalamaya sahip DALGALI puan profili, düz profilden DAHA YAVAŞTIR.
 *    Ölçüm: `balanced` (en düz) %49.65, `aggressive` %44.1, `controlled`
 *    %34.5. Dokuz kombinasyonun tamamı %7.0–%14.3 bandında (uniform %11.1)
 *    — hiçbiri ölü değil, hiçbiri uniform'ın 3 katını aşmıyor.
 */

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;
const weatherConfig = weatherConfigJson as unknown as WeatherConfig;

const DISTANCE_METERS = 1600;
const SURFACE = 'grass' as const;
const WEATHER = 'sunny' as const;
const TEMPERATURE_C = 22;

/**
 * Sahadaki TÜM atlar bu profille ÖZDEŞTİR — ölçülen tek değişken taktiktir.
 * Değerler `bot-generator.ts`'in nötr bandından seçildi ki ölçüm üretim
 * ölçeğinde olsun (uç değerler taktik etkisini yapay biçimde büyütürdü).
 */
const IDENTICAL_HORSE_PROFILE = {
  speed: 60,
  stamina: 60,
  acceleration: 60,
  fitness: 60,
  fatigue: 0,
  health: 100,
  morale: 60,
  surfaceCompatibility: 50,
  distanceCompatibility: 50,
  jockeySkillComposite: 50,
  weightCompatibility: 50,
  form: 50,
} as const;

function horse(horseId: string, startApproach: StartApproach, finalStretchPlan: FinalStretchPlan): RaceEntrantSnapshot {
  return {
    horseId,
    ...IDENTICAL_HORSE_PROFILE,
    tactic: { racingStyle: 'mid_pack', riskLevel: 'normal', startApproach, finalStretchPlan },
  };
}

function race(entries: RaceEntrantSnapshot[], simulationSeed: string): RaceTimeline {
  const input: RaceSimulationInput = {
    raceId: `tactic-${simulationSeed}`,
    simulationSeed,
    distanceMeters: DISTANCE_METERS,
    surface: SURFACE,
    weather: WEATHER,
    temperatureC: TEMPERATURE_C,
    entries,
    raceConfig,
    weatherConfig,
  };
  return simulateRace(input);
}

/** Verilen atın bir segmentteki telemetrisi (motor `raceEntryId`ye `horseId` yazar). */
function segmentOf(timeline: RaceTimeline, horseId: string, segmentIndex: number) {
  const perHorse = timeline.segments.filter((s) => s.raceEntryId === horseId);
  return perHorse[segmentIndex]!;
}

function winnerOf(timeline: RaceTimeline): string {
  return timeline.finalResult[0]!.horseId;
}

const ALL_APPROACHES: readonly StartApproach[] = ['aggressive', 'balanced', 'controlled'];
const ALL_PLANS: readonly FinalStretchPlan[] = ['early_sprint', 'normal', 'late_sprint'];

/** Kaç koşum yapılacak — galibiyet payı ölçümlerinin örneklem büyüklüğü. */
const RACES = 2_000;
/** Simetrik (kontrol) sahanın teorik galibiyet payı. */
const SYMMETRIC_SHARE = 0.5;

describe('PHASE 6 — deriveTacticEffect (mekanizma)', () => {
  const neutralTactic = { racingStyle: 'mid_pack', riskLevel: 'normal', startApproach: 'balanced', finalStretchPlan: 'normal' } as const;

  const finalStretchFraction = raceConfig.pace.finalStretchMeters / DISTANCE_METERS;
  /** Final düzlüğün ORTASI — `finalStretchPlan` bonusunun kesinlikle yürürlükte olduğu yer. */
  const INSIDE_FINAL_STRETCH = 1 - finalStretchFraction / 2;
  /** Erken kalkış penceresinin ortası. */
  const INSIDE_EARLY_WINDOW = raceConfig.tactic.startApproachWindowFraction / 2;
  /** İki pencerenin ARASI — iki eksenin de yürürlükte OLMADIĞI tek bölge. */
  const BETWEEN_WINDOWS = (raceConfig.tactic.startApproachWindowFraction + (1 - finalStretchFraction)) / 2;

  it('balanced + normal: `balanced` HER YERDE nötrdür; `normal` yalnızca final düzlükte REFERANS bonusunu verir', () => {
    // `balanced` = varsayılan kalkış. Hiçbir pencerede puan üretmez ve
    // stamina çarpanı 1'dir — yani "hiçbir şey seçmeyen" oyuncu cezalanmaz.
    for (const fraction of [0, 0.2, 0.5, 0.9, 1]) {
      const balanced = deriveTacticEffect({ ...neutralTactic, startApproach: 'balanced' }, fraction, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);
      expect(balanced.staminaConsumptionMultiplier).toBe(1);
    }
    expect(deriveTacticEffect({ ...neutralTactic, startApproach: 'balanced' }, INSIDE_EARLY_WINDOW, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace).performanceBonus).toBe(0);
    expect(deriveTacticEffect({ ...neutralTactic, startApproach: 'balanced' }, BETWEEN_WINDOWS, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace).performanceBonus).toBe(0);

    // `normal` = referans final planı. Pencerenin DIŞINDA hiçbir etkisi yok;
    // içinde ise config'te yazan taban bonusu verir — SABİT ve HERKESE AYNI
    // olduğu için kimseyi kayırmaz (varsayılan yükleme).
    const normalPlan = raceConfig.tactic.finalStretchPlan.normal;
    if (!normalPlan) {
      throw new Error('race.config.json → tactic.finalStretchPlan.normal eksik');
    }
    const outside = deriveTacticEffect(neutralTactic, BETWEEN_WINDOWS, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);
    expect(outside.performanceBonus).toBe(0);
    expect(outside.staminaConsumptionMultiplier).toBe(1);

    const inside = deriveTacticEffect(neutralTactic, INSIDE_FINAL_STRETCH, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);
    expect(inside.performanceBonus).toBe(raceConfig.tactic.finalStretchPlanBaseBonus * normalPlan.bonusMultiplier);
    expect(inside.staminaConsumptionMultiplier).toBe(1);
  });

  it('startApproach pencereleri AYRIKTIR: erken pencere yalnız başta, geç bonus yalnız final düzlükte', () => {
    const aggressive = { ...neutralTactic, startApproach: 'aggressive' } as const;
    const inside = deriveTacticEffect(aggressive, INSIDE_EARLY_WINDOW, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);
    const between = deriveTacticEffect(aggressive, BETWEEN_WINDOWS, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);

    // Erken pencere: puan VAR.
    expect(inside.performanceBonus).toBeGreaterThan(0);
    // İki pencere arası: startApproach'ten gelen puan YOK (yalnız `normal`
    // planının final bonusu da henüz başlamadı).
    expect(between.performanceBonus).toBe(0);
    // ⚠️ Stamina çarpanı bu eksende HER YERDE 1'dir — bilinçli. Gerekçe:
    // `baseStaminaConsumptionPerSegment` zaten `100 / segmentCount`, yani
    // stamina tam bitişte tükenir; 1.0 üstü her çarpan SON segmenti
    // depletion cezasına sokar (ölçüldü: 1.15 → galibiyet payı 0.53 → 0.05).
    expect(inside.staminaConsumptionMultiplier).toBe(1);
    expect(between.staminaConsumptionMultiplier).toBe(1);
  });

  it('startApproach KAPALI bir ödünleşimdir: erken kazanılan puan final düzlükte TAM AYNI miktarda geri verilir', () => {
    const at = (approach: StartApproach, fraction: number) =>
      deriveTacticEffect({ ...neutralTactic, startApproach: approach }, fraction, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);

    const earlyAggressive = at('aggressive', INSIDE_EARLY_WINDOW).performanceBonus;
    const lateAggressive = at('aggressive', INSIDE_FINAL_STRETCH).performanceBonus;
    const earlyControlled = at('controlled', INSIDE_EARLY_WINDOW).performanceBonus;
    const lateControlled = at('controlled', INSIDE_FINAL_STRETCH).performanceBonus;

    // Erken pencere: aggressive > balanced > controlled
    expect(earlyAggressive).toBeGreaterThan(at('balanced', INSIDE_EARLY_WINDOW).performanceBonus);
    expect(at('balanced', INSIDE_EARLY_WINDOW).performanceBonus).toBeGreaterThan(earlyControlled);
    // Final düzlük: sıra TAM TERS.
    expect(lateControlled).toBeGreaterThan(at('balanced', INSIDE_FINAL_STRETCH).performanceBonus);
    expect(at('balanced', INSIDE_FINAL_STRETCH).performanceBonus).toBeGreaterThan(lateAggressive);

    // Ve transfer KAPALI: iki ucun `balanced`a göre SAPMASI tam tersidir,
    // yani bir uç toplamda diğerinden fazla puan almaz. (Bu iddia,
    // "ödünleşim" adının altını dolduran tek şeydir: sapmalar simetrik
    // olmasaydı bu bir ödünleşim değil, GİZLİ BİR BONUS olurdu.)
    // Not: final düzlükte `normal` planının kendi bonusu da eklendiği için
    // karşılaştırma MUTLAK değil, `balanced` referansına göre SAPMA üzerinden.
    const refEarly = at('balanced', INSIDE_EARLY_WINDOW).performanceBonus;
    const refLate = at('balanced', INSIDE_FINAL_STRETCH).performanceBonus;
    expect(earlyAggressive - refEarly).toBe(-(earlyControlled - refEarly));
    expect(lateAggressive - refLate).toBe(-(lateControlled - refLate));
  });

  it('finalStretchPlan YALNIZCA final düzlükte etkilidir', () => {
    const late = { ...neutralTactic, finalStretchPlan: 'late_sprint' } as const;
    const early = deriveTacticEffect(late, 0.2, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);
    const inside = deriveTacticEffect(late, 1 - finalStretchFraction * 0.1, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);

    expect(early.performanceBonus).toBe(0);
    expect(inside.performanceBonus).toBeGreaterThan(0);
  });

  it('finalStretchPlan penceresi GENİŞLİK ile BONUS arasında ödünleşir: early_sprint geniş-düşük, late_sprint dar-yüksek', () => {
    const earlyPlan = raceConfig.tactic.finalStretchPlan.early_sprint;
    const latePlan = raceConfig.tactic.finalStretchPlan.late_sprint;
    if (!earlyPlan || !latePlan) {
      throw new Error('race.config.json → tactic.finalStretchPlan eksik');
    }
    // Pencerenin HEMEN başında (early_sprint çoktan bonus alır, late_sprint almaz)
    const windowStart = 1 - finalStretchFraction * earlyPlan.windowMultiplier + 0.001;
    const earlyAtWindowStart = deriveTacticEffect({ ...neutralTactic, finalStretchPlan: 'early_sprint' }, windowStart, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);
    const lateAtWindowStart = deriveTacticEffect({ ...neutralTactic, finalStretchPlan: 'late_sprint' }, windowStart, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);

    expect(earlyAtWindowStart.performanceBonus).toBeGreaterThan(0);
    expect(lateAtWindowStart.performanceBonus).toBe(0);

    // Yarışın SON segmentinde ise late_sprint'in bonusu DAHA BÜYÜKTÜR.
    const earlyAtFinish = deriveTacticEffect({ ...neutralTactic, finalStretchPlan: 'early_sprint' }, 1, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);
    const lateAtFinish = deriveTacticEffect({ ...neutralTactic, finalStretchPlan: 'late_sprint' }, 1, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);
    expect(lateAtFinish.performanceBonus).toBeGreaterThan(earlyAtFinish.performanceBonus);
  });

  it('tanınmayan bir taktik değeri sessizce nötr döner (savunma — eski/bozuk snapshot)', () => {
    const unknown = { racingStyle: 'mid_pack', riskLevel: 'normal', startApproach: 'yok', finalStretchPlan: 'yok' } as unknown as RaceEntrantSnapshot['tactic'];
    const effect = deriveTacticEffect(unknown, 0.1, DISTANCE_METERS, raceConfig.tactic, raceConfig.pace);
    expect(effect).toEqual({ performanceBonus: 0, staminaConsumptionMultiplier: 1 });
  });

  it('ruleset sürümü PHASE 6 ile YÜKSELTİLDİ — eski yarışların replay`i karışmasın', () => {
    // Bu iddia, "formül değişti ama sürüm sabit kaldı" regresyonunu yakalar.
    // PHASE 6.1 taktik (`1.1.0` → `1.2.0`), PHASE 6.3 kişilik
    // (`1.2.0` → `1.3.0`) — her ikisi de bir KURAL MODÜLÜNÜN iç formülünü
    // değiştirdi, segment döngüsünün YAPISINI değil (bkz. `race-engine.ts`
    // üstündeki sürümleme kuralı).
    expect(RACE_RULESET_VERSION).toBe('1.3.0');
  });
});

describe('PHASE 6 — taktik MOTORDA ölçülebilir bir etki üretir', () => {
  it('aynı saha + aynı seed, TEK fark startApproach: sıralama ERKEN PENCEREDE gerçekten değişir', () => {
    const aggressive = horse('a', 'aggressive', 'normal');
    const controlled = horse('b', 'controlled', 'normal');

    // Erken pencerenin SON segmenti (200m'lik segmentlerde fraction 0.35 → 2. segment).
    const earlyWindowSegments = Math.floor(raceConfig.tactic.startApproachWindowFraction * (DISTANCE_METERS / raceConfig.segmentLengthMeters));

    let aggressiveAheadAtWindow = 0;

    for (let i = 0; i < RACES; i += 1) {
      const timeline = race([aggressive, controlled], `start-approach-${i}`);
      const aSeg = segmentOf(timeline, 'a', earlyWindowSegments - 1);
      const bSeg = segmentOf(timeline, 'b', earlyWindowSegments - 1);
      if (aSeg.timestampMs < bSeg.timestampMs) aggressiveAheadAtWindow += 1;
    }

    const aheadShare = aggressiveAheadAtWindow / RACES;

    // aggressive ERKEN pencerede önde olmalı — ama her seferinde değil (motor
    // determinist DEĞİL, sürpriz payı var): pay SIMETRİK 0.5'in belirgin üstünde.
    expect(aheadShare, `aggressive erken pencerede ${aheadShare} oranında önde`).toBeGreaterThan(0.6);

    // ⚠️ BURADA BEKLENEN "sıra bitişte TERS döner" İDDİASI **ÖLÇÜLEREK
    // ÇÜRÜTÜLDÜ** ve bu yüzden yazılmadı. `controlled` bitişte yalnızca
    // 0.4445 oranında önde — yani +5 geç bonusu, −8 erken kaybını GERİ
    // KAZANMIYOR. Sebep `segmentTimeMs = k / performanceScore`'un DIŞBÜKEY
    // olması (Jensen): aynı ortalamaya sahip DALGALI bir puan profili, düz
    // profilden DAHA YAVAŞTIR. Ölçüm bunu doğruladı — `balanced` (en düz
    // profil) üç kalkış arasında en yüksek galibiyet payına sahip
    // (%49.65), iki uç ise %44.1 ve %34.5'te kalıyor.
    // Yani taktik "bedava puan" değil, RİSK dağılımı seçimidir.
  });

  it('KONTROL deneyi: aynı koltuk, aynı seed, YALNIZ taktik — galibiyet payı taktiğe göre değişir', () => {
    // (a) KONTROL — iki at da tamamen özdeş (balanced/normal). Motorun
    // girdi SIRASINDAN bir avantaj üretmediğini kanıtlar: pay 0.5'te kalmalı.
    // (Bu iddia gerçek bir hata yakaladı: `isBoxedIn` eskiden "önündekiyle
    // AYNI HİZADA olmak"ı da bloklanma sayıyordu ve `entries` dizisinin
    // ikinci elemanı segment 0'da ceza yiyebiliyordu → özdeş saha payı
    // 0.652 çıkıyordu. Düzeltme `race-engine.ts` → `computeStandings`.)
    let identicalWins = 0;
    for (let i = 0; i < RACES; i += 1) {
      const timeline = race([horse('a', 'balanced', 'normal'), horse('b', 'balanced', 'normal')], `control-${i}`);
      if (winnerOf(timeline) === 'a') identicalWins += 1;
    }
    const identicalShare = identicalWins / RACES;
    expect(Math.abs(identicalShare - SYMMETRIC_SHARE), `özdeş saha payı ${identicalShare}`).toBeLessThan(0.08);

    // (b) MUAMELE — 'b' hep aynı; yalnızca 'a'nın kalkış taktiği değişiyor.
    // Koltuk ve seed sabit olduğu için pay farkı YALNIZ taktikten gelir;
    // fark yoksa motor taktiği okumuyor demektir (bu testin asıl iddiası).
    const shareByApproach = new Map<StartApproach, number>();
    for (const approach of ALL_APPROACHES) {
      let wins = 0;
      for (let i = 0; i < RACES; i += 1) {
        const timeline = race([horse('a', approach, 'normal'), horse('b', 'balanced', 'normal')], `control-${i}`);
        if (winnerOf(timeline) === 'a') wins += 1;
      }
      shareByApproach.set(approach, wins / RACES);
    }

    const shares = [...shareByApproach.values()];
    const spread = Math.max(...shares) - Math.min(...shares);
    expect(
      spread,
      `kalkış taktiği payları ${JSON.stringify(Object.fromEntries(shareByApproach))} — yayılım ${spread}`,
    ).toBeGreaterThan(0.02);
  });

  it('DOKUZ kombinasyonun HİÇBİRİ ölü değil ve hiçbiri uniform payın 3 katını aşmıyor', () => {
    const field: RaceEntrantSnapshot[] = [];
    for (const approach of ALL_APPROACHES) {
      for (const plan of ALL_PLANS) {
        field.push(horse(`${approach}:${plan}`, approach, plan));
      }
    }

    const wins = new Map<string, number>(field.map((entry) => [entry.horseId, 0]));
    for (let i = 0; i < RACES; i += 1) {
      const timeline = race(field, `matrix-${i}`);
      const winner = winnerOf(timeline);
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }

    const shares = [...wins.values()].map((count) => count / RACES);
    const uniform = 1 / field.length;

    for (const [horseId, count] of wins) {
      const share = count / RACES;
      expect(share, `${horseId} hiç kazanmadı (ölü seçenek)`).toBeGreaterThan(0);
      expect(share, `${horseId} payı ${share} — baskın seçenek`).toBeLessThan(uniform * 3);
    }

    // Ölçüm gürültü değil: dağılım tamamen düz de olsa en az bir seçenek
    // uniform'un üstünde olmalı (yani taktik sıralamayı gerçekten etkiliyor).
    expect(Math.max(...shares)).toBeGreaterThan(uniform);
  });
});
