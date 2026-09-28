import { describe, expect, it } from 'vitest';
import { deriveTemperamentEffect } from '../../../src/domain/race/temperament';
import { generateBotEntrants } from '../../../src/domain/race/bot-generator';
import { simulateRace, type RaceSimulationInput } from '../../../src/domain/race/race-engine';
import raceConfigJson from '../../../../../config/race.config.json';
import weatherConfigJson from '../../../../../config/weather.config.json';
import type { RaceBalanceConfig, WeatherConfig } from '@at-sevdalisi/game-config';
import type { RaceEntrantSnapshot, RaceTimeline } from '@at-sevdalisi/shared-types';

/**
 * PHASE 6.3 — KİŞİLİK / MIZAÇ (temperament) EKSENİNİN MOTOR ETKİSİ
 * (brief §42 PHASE 6).
 *
 * **BU DOSYANIN VAR OLMA SEBEBİ.** `horse_stats.temperament` migration
 * 0003'ten beri VERİTABANINDA vardır, üremeyle yavruya geçer
 * (`INHERITED_STAT_COLUMNS`) ve API'de okunup yazılır — ama `simulateRace`
 * onu hiç görmüyordu. Oyuncunun yetiştiricilik kararlarından biri
 * (hangi tayı tutayım) yarış sonucuna hiç etki etmiyordu ve bu hiçbir yerde
 * hata üretmiyordu. Aynı sınıf hata PHASE 6.1'de `startApproach`/
 * `finalStretchPlan` için de vardı (bkz. `tactic-effect.spec.ts`).
 *
 * Dosya iddiayı üç katmanda kurar:
 *   1. **Mekanizma** — pencereler, nötrlük, simetri (saf fonksiyon testleri).
 *   2. **No-op kanıtı** — 50 ve `undefined` motor çıktısını BİT BİT
 *      değiştirmez. Bu olmadan `docs/RACE_BALANCE_REPORT.md` ölçümleri ve
 *      `race-balance.spec.ts` eşikleri geçersiz hâle gelirdi.
 *   3. **Ölçüm** — aynı saha, aynı seed, TEK fark temperament: sonuç
 *      gerçekten değişiyor mu, ve ödünleşim KAPALI mı (uçurum yok mu)?
 *
 * **AI'YE GİZLİ BONUS TRIPWIRE'I.** Son test `generateBotEntrants`'ı aynı
 * seed ile YENİDEN üretip her botun `temperament`ının tam 50 olduğunu
 * iddia eder — brief §42 PHASE 6'nın açık yasağı. Motora giren bot girdisi
 * ile üretilen bot arasına bir sapma girerse test KIRILIR.
 */

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;
const weatherConfig = weatherConfigJson as unknown as WeatherConfig;

const DISTANCE_METERS = 1600;
const SURFACE = 'grass' as const;
const WEATHER = 'sunny' as const;
const TEMPERATURE_C = 22;

/** Ölçümün örneklem büyüklüğü (`tactic-effect.spec.ts` ile aynı ölçek). */
const RACES = 2_000;

/** Sahanın geri kalanı SABİT — ölçülen tek değişken `temperament`. */
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

const NEUTRAL_TACTIC = { racingStyle: 'mid_pack', riskLevel: 'normal', startApproach: 'balanced', finalStretchPlan: 'normal' } as const;

/**
 * `temperament` `undefined` BIRAKILABİLİR (üçüncü parametre) — "eski
 * fixture" durumunu taklit eder.
 */
function horse(horseId: string, temperament?: number): RaceEntrantSnapshot {
  const snapshot: RaceEntrantSnapshot = {
    horseId,
    ...IDENTICAL_HORSE_PROFILE,
    tactic: NEUTRAL_TACTIC,
  };
  if (temperament !== undefined) {
    snapshot.temperament = temperament;
  }
  return snapshot;
}

function race(entries: RaceEntrantSnapshot[], simulationSeed: string): RaceTimeline {
  const input: RaceSimulationInput = {
    raceId: `temperament-${simulationSeed}`,
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

function winnerOf(timeline: RaceTimeline): string {
  return timeline.finalResult[0]!.horseId;
}

const temperamentConfig = raceConfig.temperament;
const SEGMENT_LENGTH_METERS = raceConfig.segmentLengthMeters;
const SEGMENT_COUNT = Math.round(DISTANCE_METERS / SEGMENT_LENGTH_METERS);

/**
 * Motor `positionFraction`ı `(segmentIndex + 1) / segmentCount` üretir — bu
 * yardımcı, bir segment indeksini motorun kullandığı ORANA çevirir.
 */
const fractionOfSegment = (segmentIndex: number): number => (segmentIndex + 1) / SEGMENT_COUNT;

/** Erken pencerenin SON segmenti (0 tabanlı). */
const LAST_EARLY_SEGMENT = Math.max(1, Math.round(SEGMENT_COUNT * temperamentConfig.windowFraction)) - 1;
/** Final penceresinin İLK segmenti (0 tabanlı). */
const FIRST_LATE_SEGMENT = SEGMENT_COUNT - (LAST_EARLY_SEGMENT + 1);

/** Erken pencerenin ORTASI (bir segmentin ortası değil, pencerenin içi). */
const INSIDE_EARLY_WINDOW = fractionOfSegment(0);
/** Final düzlüğün içi — yarışın SON segmenti. */
const INSIDE_FINAL_STRETCH = fractionOfSegment(SEGMENT_COUNT - 1);
/** İki pencere arası — bu eksenin yürürlükte OLMADIĞI bölge. */
const BETWEEN_WINDOWS = fractionOfSegment(Math.floor((LAST_EARLY_SEGMENT + FIRST_LATE_SEGMENT) / 2));

/** Uç değerler: config'in `neutral`ına göre ±50 sapma. */
const HOT = temperamentConfig.neutral + 50;
const CALM = temperamentConfig.neutral - 50;

const effectAt = (temperament: number | undefined, positionFraction: number) =>
  deriveTemperamentEffect(temperament, positionFraction, DISTANCE_METERS, SEGMENT_LENGTH_METERS, temperamentConfig);

describe('PHASE 6.3 — deriveTemperamentEffect (mekanizma)', () => {
  it('`undefined` VE tam nötr (50) TAM no-op döner — her segmentte', () => {
    // Bu iki satır, dosyanın en önemli iddiasıdır: `temperament`ı hiç
    // taşımayan eski snapshot'lar (ve 50 alan başlangıç atları/botlar) için
    // motor BİT BİT aynı koşar.
    for (const fraction of [0, 0.1, 0.25, 0.5, 0.8, 1]) {
      expect(effectAt(undefined, fraction)).toEqual({ performanceBonus: 0, staminaConsumptionMultiplier: 1 });
      expect(effectAt(temperamentConfig.neutral, fraction)).toEqual({ performanceBonus: 0, staminaConsumptionMultiplier: 1 });
    }
  });

  it('nötr ile `undefined` AYNI koda girer — motor bu ikisi arasında ayrım yapmaz', () => {
    for (const fraction of [0, 0.2, 0.6, 1]) {
      expect(effectAt(undefined, fraction)).toEqual(effectAt(temperamentConfig.neutral, fraction));
    }
  });

  it('iki pencere arasında (yarışın ortası) etki YOKTUR — bonus da çarpan da nötr', () => {
    for (const temperament of [HOT, CALM]) {
      expect(effectAt(temperament, BETWEEN_WINDOWS)).toEqual({ performanceBonus: 0, staminaConsumptionMultiplier: 1 });
    }
  });

  it('erken pencerede SICAK at puan kazanır ve daha çok stamina yakar; SAKİN at tam tersi', () => {
    const hot = effectAt(HOT, INSIDE_EARLY_WINDOW);
    const calm = effectAt(CALM, INSIDE_EARLY_WINDOW);

    expect(hot.performanceBonus).toBeGreaterThan(0);
    expect(calm.performanceBonus).toBeLessThan(0);
    // Stamina çarpanı: sıcak > 1 (erken yakar), sakin < 1 (saklar).
    expect(hot.staminaConsumptionMultiplier).toBeGreaterThan(1);
    expect(calm.staminaConsumptionMultiplier).toBeLessThan(1);
  });

  it('final düzlükte İŞARET TERSİNE DÖNER: sıcak at erken kazandığını geri verir', () => {
    const hot = effectAt(HOT, INSIDE_FINAL_STRETCH);
    const calm = effectAt(CALM, INSIDE_FINAL_STRETCH);

    expect(hot.performanceBonus).toBeLessThan(0);
    expect(calm.performanceBonus).toBeGreaterThan(0);
    expect(hot.staminaConsumptionMultiplier).toBeLessThan(1);
    expect(calm.staminaConsumptionMultiplier).toBeGreaterThan(1);
  });

  it('KAPALI ÖDÜNLEŞİM: erken kazanılan puan final düzlükte TAM AYNI miktarda geri verilir', () => {
    // Bu iddia, "ödünleşim" adının altını dolduran tek şeydir: sapmalar
    // simetrik olmasaydı bu bir ödünleşim değil, GİZLİ BİR BONUS olurdu.
    const hotEarly = effectAt(HOT, INSIDE_EARLY_WINDOW);
    const hotLate = effectAt(HOT, INSIDE_FINAL_STRETCH);
    const calmEarly = effectAt(CALM, INSIDE_EARLY_WINDOW);
    const calmLate = effectAt(CALM, INSIDE_FINAL_STRETCH);

    // Sıcak atın erken kazancı == sakin atın geç kazancı (aynı büyüklük).
    expect(hotEarly.performanceBonus).toBe(-calmEarly.performanceBonus);
    expect(calmLate.performanceBonus).toBe(-hotLate.performanceBonus);
    // Ve stamina çarpanı da simetrik.
    expect(hotEarly.staminaConsumptionMultiplier).toBe(calmLate.staminaConsumptionMultiplier);
    expect(calmEarly.staminaConsumptionMultiplier).toBe(hotLate.staminaConsumptionMultiplier);
  });

  it('stamina çarpanı HİÇBİR ZAMAN 0 veya negatif olamaz (bölme/erime güvenliği)', () => {
    for (const temperament of [0, 1, 25, 50, 75, 99, 100, -500, 500]) {
      for (const fraction of [0, 0.1, 0.5, 0.9, 1]) {
        const effect = effectAt(temperament, fraction);
        expect(effect.staminaConsumptionMultiplier).toBeGreaterThan(0);
      }
    }
  });

  it('ölçek dışı değerler kırpılır: 500 tam olarak 100 gibi, -500 tam olarak 0 gibi davranır', () => {
    for (const fraction of [INSIDE_EARLY_WINDOW, INSIDE_FINAL_STRETCH]) {
      expect(effectAt(500, fraction)).toEqual(effectAt(100, fraction));
      expect(effectAt(-500, fraction)).toEqual(effectAt(0, fraction));
    }
  });

  /**
   * ⚠️ **BU TEST BİR HATAYI YAKALAMAK İÇİN YAZILDI, SONRADAN EKLENMEDİ.**
   * İlk sürüm pencereleri ORANLA kuruyordu (`positionFraction <= 0.25` /
   * `>= 0.75`). Motor `positionFraction = (segmentIndex + 1) / segmentCount`
   * ürettiği için bu, 1600m'de erken pencereye 2, final penceresine 3 segment
   * sokuyordu: sakin at 3×(+4) kazanıp 2×(−4) ödüyor, net **+4 puan**
   * alıyordu. 5.000 koşumluk ölçüm payı 0.5686'ya çıkardı (nötr 0.4956).
   * Yani "kapalı ödünleşim" iddiası kâğıtta doğruydu, MOTORDA değildi —
   * ve bunu hiçbir birim testi göstermiyordu. Bu test o boşluğu kapatır:
   * iki pencere HER mesafede AYNI sayıda segment içerir ve ASLA çakışmaz.
   */
  it('PENCERELER HER MESAFEDE simetriktir: eşit segment sayısı, çakışma yok', () => {
    for (const distanceMeters of [800, 1000, 1200, 1600, 2000, 2400, 3200]) {
      const segmentCount = Math.round(distanceMeters / SEGMENT_LENGTH_METERS);
      const earlySegments: number[] = [];
      const lateSegments: number[] = [];

      for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
        const fraction = (segmentIndex + 1) / segmentCount;
        const effect = deriveTemperamentEffect(HOT, fraction, distanceMeters, SEGMENT_LENGTH_METERS, temperamentConfig);
        if (effect.performanceBonus > 0) earlySegments.push(segmentIndex);
        if (effect.performanceBonus < 0) lateSegments.push(segmentIndex);
      }

      expect(
        earlySegments.length,
        `${distanceMeters}m (${segmentCount} segment): erken ${earlySegments.length} — final ${lateSegments.length}`,
      ).toBe(lateSegments.length);
      expect(earlySegments.length, `${distanceMeters}m: pencere hiç boş olmamalı`).toBeGreaterThan(0);

      // Çakışma YOK: hiçbir segment hem erken hem final penceresinde değildir.
      const overlap = earlySegments.filter((index) => lateSegments.includes(index));
      expect(overlap, `${distanceMeters}m: pencereler çakışıyor`).toEqual([]);

      // Ve transfer KAPALI: sıcak atın toplam puan kazancı tam olarak sıfırdır.
      const totalBonus =
        earlySegments.length * temperamentConfig.startBonusMax - lateSegments.length * temperamentConfig.latePenaltyMax;
      expect(totalBonus, `${distanceMeters}m: sıcak atın net puanı ${totalBonus}`).toBe(0);
    }
  });

  it('config DEĞİŞMEZLERİ: neutral = 50 ve iki pencere büyüklüğü EŞİT', () => {
    // (a) `neutral` 50 olmalı: `horse_stats.temperament`ın migration 0003'teki
    // DEFAULT'u 50'dir ve `NEUTRAL_UNMODELED_TRAIT_SCORE` da 50'dir. `neutral`
    // başka bir sayıya çekilirse BAŞLANGIÇ atları (50) sessizce nötr olmaktan
    // çıkar ve `docs/RACE_BALANCE_REPORT.md` ölçümleri geçersizleşir.
    expect(temperamentConfig.neutral).toBe(50);
    // (b) İki pencere büyüklüğü eşit olmalı — aksi hâlde transfer kapanmaz
    // ve bu eksen "gizli bonus"a döner (yukarıdaki simetri testi bunu
    // fonksiyon düzeyinde ölçer; bu iddia CONFIG düzeyinde kilitler).
    expect(temperamentConfig.startBonusMax).toBe(temperamentConfig.latePenaltyMax);
  });
});

describe('PHASE 6.3 — kişilik MOTORDA ölçülebilir bir etki üretir', () => {
  it('NO-OP KANITI: `temperament`ı hiç taşımayan saha ile 50 alan saha BİT BİT aynı koşar', () => {
    // Bu, geriye dönük uyumluluğun ve denge raporunun geçerliliğinin
    // kanıtıdır — ölçüm değil, bir DEĞİŞMEZ.
    for (let i = 0; i < 50; i += 1) {
      const seed = `noop-${i}`;
      const withoutField = race([horse('a'), horse('b')], seed);
      const neutralField = race([horse('a', 50), horse('b', 50)], seed);
      expect(JSON.stringify(neutralField)).toBe(JSON.stringify(withoutField));
    }
  });

  it('KONTROL deneyi: aynı saha + aynı seed, TEK fark temperament → sonuç değişir', () => {
    // (a) KONTROL — iki at da 50: motorun koltuk sırasından avantaj
    // üretmediğini gösterir (pay 0.5 civarında kalmalı).
    let neutralWins = 0;
    for (let i = 0; i < RACES; i += 1) {
      if (winnerOf(race([horse('a', 50), horse('b', 50)], `control-${i}`)) === 'a') neutralWins += 1;
    }
    const neutralShare = neutralWins / RACES;
    expect(Math.abs(neutralShare - 0.5), `nötr saha payı ${neutralShare}`).toBeLessThan(0.08);

    // (b) MUAMELE — 'b' nötr kalır, yalnızca 'a'nın kişiliği değişir.
    // Fark yoksa motor temperament'ı OKUMUYOR demektir (asıl iddia).
    const shares = new Map<number, number>();
    for (const temperament of [0, 25, 50, 75, 100]) {
      let wins = 0;
      for (let i = 0; i < RACES; i += 1) {
        if (winnerOf(race([horse('a', temperament), horse('b', 50)], `control-${i}`)) === 'a') wins += 1;
      }
      shares.set(temperament, wins / RACES);
    }

    const values = [...shares.values()];
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread, `kişilik payları ${JSON.stringify(Object.fromEntries(shares))} — yayılım ${spread}`).toBeGreaterThan(0.02);

    // ⚠️ ÖDÜNLEŞİMİN KAPALILIĞI ÖLÇÜLÜR: hiçbir uç, nötr atı EZMEZ.
    //
    // Bu sınır bir "iyi durum" hedefi DEĞİL — bulunan GERÇEK hatanın
    // yakalanması için seçilmiş bir DEĞİŞMEZ sınırıdır. Oranla kurulmuş ilk
    // sürümde (erken 2 segment, final 3 segment) ölçüm şuydu:
    //   temperament 0 → 0.5686   ·   50 → 0.4956   ·   100 → 0.3816
    // Düzeltilmiş (segment simetrik) sürümde:
    //   temperament 0 → 0.4764 · 25 → 0.5022 · 50 → 0.4956 · 75 → 0.5088 · 100 → 0.4814
    // Yani 0.56/0.44 sınırı eski hatayı İKİ uçtan da yakalar (0.5686 > 0.56,
    // 0.3816 < 0.44), düzeltilmiş değerlere ise en az 0.05 pay bırakır.
    // Tohumlar sabit (`control-${i}`) olduğu için bu ölçüm DETERMİNİSTİKTİR —
    // gürültüyle kırılamaz; kırılırsa motor gerçekten değişmiştir.
    for (const [temperament, share] of shares) {
      expect(share, `temperament ${temperament} payı ${share} — uç uçurum (ödünleşim açık)`).toBeLessThan(0.56);
      expect(share, `temperament ${temperament} payı ${share} — ölü seçenek`).toBeGreaterThan(0.44);
    }
  });

  it('SICAK at erken pencerede öndedir — motor kişiliği GERÇEKTEN okuyor', () => {
    // Sıralamanın (bitişte değil) ERKEN pencerede kayması beklenir: etkinin
    // tamamı orada uygulanır. Bu, "sonuç değişti" iddiasını mekanizmaya bağlar.
    const earlyWindowSegments = LAST_EARLY_SEGMENT + 1;

    let hotAheadAtWindow = 0;
    for (let i = 0; i < RACES; i += 1) {
      const timeline = race([horse('a', HOT), horse('b', CALM)], `early-${i}`);
      const segments = timeline.segments.filter((s) => s.raceEntryId === 'a' || s.raceEntryId === 'b');
      const aSeg = segments.filter((s) => s.raceEntryId === 'a')[earlyWindowSegments - 1]!;
      const bSeg = segments.filter((s) => s.raceEntryId === 'b')[earlyWindowSegments - 1]!;
      if (aSeg.timestampMs < bSeg.timestampMs) hotAheadAtWindow += 1;
    }

    const aheadShare = hotAheadAtWindow / RACES;
    expect(aheadShare, `sıcak at erken pencerede ${aheadShare} oranında önde`).toBeGreaterThan(0.6);
  });

  it('AI’YE GİZLİ BONUS TRIPWIRE: `generateBotEntrants` HER botu tam nötr (50) üretir', () => {
    // Brief §42 PHASE 6: "AI'ye gizli performans bonusu verme." Botlar
    // `horses`/`horse_stats` satırına sahip DEĞİLDİR, yani gerçek bir
    // temperament'ları da yoktur. Buraya 50 dışında bir değer girmesi,
    // oyuncunun göremediği bir AI avantajı olurdu.
    const bots = generateBotEntrants(12, 'anti-cheat-seed');
    expect(bots).toHaveLength(12);
    for (const bot of bots) {
      expect(bot.temperament, `${bot.horseId} nötr değil`).toBe(50);
    }

    // Aynı seed → AYNI botlar (determinizm; `generateBotEntrants` saf ve
    // seed'li olmalı — `Math.random()` yasağı).
    expect(JSON.stringify(generateBotEntrants(12, 'anti-cheat-seed'))).toBe(JSON.stringify(bots));

    // Ve nötr botlardan kurulu bir saha, `temperament`ı hiç taşımayan
    // saha ile BİT BİT aynı koşar — yani botların kişiliği sonuca
    // sıfır katkı yapar.
    const withBots = race(generateBotEntrants(6, 'bot-field'), 'bot-field');
    const withoutField = race(
      generateBotEntrants(6, 'bot-field').map(({ temperament: _temperament, ...rest }) => rest),
      'bot-field',
    );
    expect(JSON.stringify(withBots)).toBe(JSON.stringify(withoutField));
  });
});
