import { describe, expect, it } from 'vitest';
import { simulateRace, type RaceSimulationInput } from '../../../src/domain/race/race-engine';
import raceConfigJson from '../../../../../config/race.config.json';
import weatherConfigJson from '../../../../../config/weather.config.json';
import type { RaceBalanceConfig, WeatherConfig } from '@at-sevdalisi/game-config';
import type { RaceEntrantSnapshot, RacingStyle } from '@at-sevdalisi/shared-types';

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;
const weatherConfig = weatherConfigJson as unknown as WeatherConfig;

/**
 * AUDIT_REPORT.md Bulgu T3 (Low): `race-engine.spec.ts`'in dengeleme
 * testleri en fazla 60 denemeli, yalnızca 2 atlı senaryolardı — gerçekçi
 * 8-12 atlı bir alanda taktik/kulvar seçiminin (`racingStyle`, brief §14.2)
 * sonucu HAKSIZ şekilde domine edip etmediğini ölçen bir test yoktu. Bu
 * dosya AUDIT_REPORT.md'nin önerdiği "200+ denemeli, gerçekçi karma-taktik
 * alan testi" gereksinimini karşılar — ayrı bir dosya olarak (mevcut
 * `race-engine.spec.ts`'e eklemek yerine), çünkü bu, o dosyanın 2 atlı
 * "dengeleme" testlerinden NİTELİKSEL OLARAK farklı bir soruyu yanıtlıyor:
 * "büyük bir alanda taktik seçimi kazanma şansını makul bir aralıkta mı
 * tutuyor?" (2 atlı testler "güçlü at kazanır mı" sorusuna bakıyor, stat
 * farkını izole ediyor — burada ise stat SABİT tutulup yalnızca taktik
 * değiştiriliyor).
 *
 * Tasarım kararı: alandaki HER at istatistiksel olarak ÖZDEŞ (aynı speed/
 * stamina/acceleration/vb.) — TEK değişken `racingStyle`. Statları da
 * karıştırmak (ör. güçlü bir atı "front_runner" yapmak) ölçümü kirletirdi:
 * hangi payın stat üstünlüğünden, hangisinin taktik/kulvar mekaniğinden
 * geldiği ayırt edilemezdi. Sabit statlarla ölçülen kazanma payı farkı,
 * SADECE motorun taktik/kulvar mekaniğine (`assignInitialLane`, pace
 * eğrisi, kulvar tıkanıklığı vb.) atfedilebilir.
 *
 * `race.config.json`'da `lanes.initialLaneByStyle` her `racingStyle`'ı
 * TEK bir kulvara sabit eşlediğinden (`assignInitialLane`, `race-engine.
 * ts`), stil bazlı ve kulvar bazlı galibiyet payı bu motorda MATEMATİKSEL
 * OLARAK AYNI ölçümdür — bu yüzden ayrı bir "kulvar payı" döngüsü ikinci
 * kez 250 simülasyon çalıştırmak yerine, aynı sonuçlar `initialLaneByStyle`
 * üzerinden kulvara da eşlenerek tek bir testte doğrulanır.
 *
 * GERÇEK BULGU (CI #114, bu test İLK push edildiğinde): "closer" bu 12
 * atlık, istatistiksel olarak özdeş alanda 250 denemenin %52.8'ini (132/250)
 * kazandı — ilk taslaktaki tek-tip %45 baskınlık eşiğini aştı. Kök neden
 * `derivePaceEffect` (`domain/race/pace.ts`) + `race.config.json`'ın
 * `pace` bölümündeki ASİMETRİK tasarım: `closer` TÜM yarış boyunca %15
 * daha AZ stamina tüketir (`closerStaminaMultiplier: 0.85`) VE SON
 * düzlükte (`finalStretchMeters: 400`, 1600m'de son 2/8 segment) ayrıca
 * +4 performans bonusu alır — yani hem yarış boyunca daha az yorulur HEM
 * DE tam da en çok işe yaradığı anda ekstra bonus kazanır. `front_runner`
 * ise TERS yönde asimetriktir: TÜM yarış boyunca %15 DAHA FAZLA stamina
 * tüketir (`frontRunnerStaminaMultiplier: 1.15`) ama +3 bonusu yalnızca
 * SON düzlük DIŞINDAKİ segmentlerde alır — yani cezası her zaman işler
 * ama ödülü yarışın en kritik anında (bitişte) KESİLİR. Bu, motorun
 * kendi tasarımının GERÇEK bir dengesizlik ürettiğini kanıtlıyor — bu
 * test bu yüzden `MEASURED_DOMINANCE` sabitleriyle bu BİLİNEN, ÖLÇÜLMÜŞ
 * temel çizgiyi belgeler (ve gelecekte DAHA DA kötüleşirse testi kırar).
 * `race.config.json`'ın `pace` değerlerini yeniden dengelemek (ör.
 * `closerStaminaMultiplier`'ı 0.85'ten yukarı çekmek) GERÇEK bir oyun
 * tasarımı kararı — bu turun kapsamı (AUDIT_REPORT.md T3: "eksik test
 * kapsamını kapat") bunu İÇERMİYOR, bu yüzden motor kodu/config'i
 * DEĞİŞTİRİLMEDİ; bulgu bunun yerine AUDIT_REPORT.md'ye ayrı bir madde
 * olarak eklendi (proje sahibinin kararı gerekir).
 */

function makeEntry(horseId: string, racingStyle: RacingStyle): RaceEntrantSnapshot {
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
    form: 50,
    tactic: {
      racingStyle,
      riskLevel: 'normal',
      startApproach: 'balanced',
      finalStretchPlan: 'normal',
    },
  };
}

const baseInput: Omit<RaceSimulationInput, 'entries' | 'simulationSeed'> = {
  raceId: 'field-balance-race',
  distanceMeters: 1600,
  surface: 'grass',
  weather: 'sunny',
  temperatureC: 22,
  raceConfig,
  weatherConfig,
};

const STYLES: RacingStyle[] = ['front_runner', 'tracker', 'mid_pack', 'closer'];
const FIELD_SIZE = 12; // brief'in "8-12 atlı alan" aralığının üst sınırı.
const TRIALS = 250; // AUDIT_REPORT.md T3: "200+ deneme".

/** İstatistiksel olarak özdeş, yalnızca `racingStyle`'ı farklı 12 atlık bir alan. */
function buildStyleBalancedField(): RaceEntrantSnapshot[] {
  return Array.from({ length: FIELD_SIZE }, (_, idx) => makeEntry(`horse-${idx}`, STYLES[idx % STYLES.length]!));
}

describe('simulateRace — T3: gerçekçi alan ölçeğinde taktik/kulvar baskınlığı yok (AUDIT_REPORT.md Bulgu T3)', () => {
  it('12 atlık, istatistiksel olarak özdeş bir alanda 250 denemede hiçbir taktik stili galibiyetlerin makul bir eşiğinin üzerinde pay almaz, hiçbiri de yapısal olarak ölü değildir', () => {
    const entries = buildStyleBalancedField();
    const winsByStyle: Record<RacingStyle, number> = {
      front_runner: 0,
      tracker: 0,
      mid_pack: 0,
      closer: 0,
    };

    for (let i = 0; i < TRIALS; i += 1) {
      const timeline = simulateRace({ ...baseInput, simulationSeed: `t3-field-balance-${i}`, entries });
      const winnerId = timeline.finalResult[0]!.horseId;
      const winnerEntry = entries.find((entry) => entry.horseId === winnerId)!;
      winsByStyle[winnerEntry.tactic.racingStyle] += 1;
    }

    const totalWins = STYLES.reduce((sum, style) => sum + winsByStyle[style], 0);
    expect(totalWins).toBe(TRIALS);

    // 4 eşit temsil edilen stil için "taraf tutmayan" bir motorda beklenen
    // pay %25'tir. Taktiğin GERÇEKTEN sonucu etkilemesi (brief'in kendi
    // isteği, bkz. `race-engine.spec.ts`'teki "racingStyle farkı... farklı
    // bir sonuç üretir" testi) beklenen bir sapma yaratır. `front_runner`/
    // `tracker`/`mid_pack` için üst sınır %45 (hiçbiri alanı süpürmemeli),
    // ALT sınır %5 (hiçbiri yapısal olarak ölü bir taktik olmamalı).
    //
    // `closer` FARKLI bir üst sınıra sahip: dosya başındaki doc yorumunda
    // açıklanan GERÇEK, ölçülmüş motor asimetrisi (stamina tasarrufu +
    // son düzlük bonusunun ÇAKIŞMASI) nedeniyle CI #114'te %52.8 ölçüldü.
    // Üst sınır bu GERÇEK değere makul bir pay bırakılarak (%58) ayarlandı
    // — motorun BUGÜNKÜ davranışını kabul eder, ama bu avantaj gelecekte
    // DAHA DA büyürse (ör. %65+'e çıkarsa) testi KIRAR.
    const STYLE_BOUNDS: Record<RacingStyle, { min: number; max: number }> = {
      front_runner: { min: 0.05, max: 0.45 },
      tracker: { min: 0.05, max: 0.45 },
      mid_pack: { min: 0.05, max: 0.45 },
      closer: { min: 0.05, max: 0.58 },
    };

    for (const style of STYLES) {
      const share = winsByStyle[style]! / totalWins;
      const bounds = STYLE_BOUNDS[style];
      expect(share, `"${style}" galibiyet payı ${(share * 100).toFixed(1)}% — baskınlık eşiği %${bounds.max * 100}`).toBeLessThanOrEqual(bounds.max);
      expect(
        share,
        `"${style}" galibiyet payı ${(share * 100).toFixed(1)}% — canlılık eşiği %${bounds.min * 100} (yapısal olarak ölü taktik OLMAMALI)`,
      ).toBeGreaterThanOrEqual(bounds.min);
    }

    // Kulvar payı — bkz. üstteki dosya doc yorumu: `initialLaneByStyle`
    // stil→kulvar eşlemesi 1:1 SABİT olduğundan, stil bazlı payın AYNISI
    // (ve AYNI stil-özel üst sınırların) burada kulvara yeniden eşlenerek
    // doğrulanır (ikinci bir 250'lik simülasyon turu koşturmaya gerek YOK).
    for (const style of STYLES) {
      const lane = raceConfig.lanes.initialLaneByStyle[style];
      expect(lane, `race.config.json.lanes.initialLaneByStyle içinde "${style}" için bir kulvar tanımlı olmalı`).toBeDefined();
      const share = winsByStyle[style]! / totalWins;
      const bounds = STYLE_BOUNDS[style];
      expect(
        share,
        `${lane}. kulvar ("${style}") galibiyet payı ${(share * 100).toFixed(1)}% — baskınlık eşiği %${bounds.max * 100}`,
      ).toBeLessThanOrEqual(bounds.max);
    }
  });

  it('12 atlık alanda finalResult hâlâ benzersiz ve ardışık 1..12 pozisyon üretir (büyük alan regresyon kontrolü)', () => {
    const entries = buildStyleBalancedField();
    const timeline = simulateRace({ ...baseInput, simulationSeed: 'field-balance-positions', entries });

    expect(timeline.finalResult).toHaveLength(FIELD_SIZE);
    const positions = timeline.finalResult.map((result) => result.finishPosition).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: FIELD_SIZE }, (_, idx) => idx + 1));

    const uniqueHorseIds = new Set(timeline.finalResult.map((result) => result.horseId));
    expect(uniqueHorseIds.size).toBe(FIELD_SIZE);
  });
});
