import { describe, expect, it } from 'vitest';
import { simulateRace, type RaceSimulationInput } from '../../../src/domain/race/race-engine';
import { computeWeightCompatibility } from '../../../src/domain/race/carried-weight';
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
 * daha AZ stamina tüketirdi (`closerStaminaMultiplier: 0.85`) VE SON
 * düzlükte (`finalStretchMeters: 400`, 1600m'de son 2/8 segment) ayrıca
 * +4 performans bonusu alıyordu — yani hem yarış boyunca daha az yoruluyor
 * HEM DE tam da en çok işe yaradığı anda ekstra bonus kazanıyordu.
 * `front_runner` ise TERS yönde asimetrikti: TÜM yarış boyunca %15 DAHA
 * FAZLA stamina tüketirken (`frontRunnerStaminaMultiplier: 1.15`) +3
 * bonusunu yalnızca SON düzlük DIŞINDAKİ segmentlerde alıyordu — yani
 * cezası her zaman işliyor ama ödülü yarışın en kritik anında (bitişte)
 * KESİLİYORDU. Bulgu AUDIT_REPORT.md'ye T3b (Low, Denge/Tasarım) olarak
 * eklendi; ilk turda rebalancing kapsam dışı bırakıldı ("proje sahibinin
 * kararı gerekir").
 *
 * T3b DÜZELTMESİ (bu turda, proje sahibinin "hangi adımı istiyorsan
 * yapabilirsin" yetkilendirmesiyle uygulandı): `race.config.json`'ın
 * `pace` bölümü `closerStaminaMultiplier: 0.85→0.97`, `closerLateStageBonus:
 * 4→1`, `frontRunnerPositionBonus: 3→2` olarak değiştirildi
 * (`frontRunnerStaminaMultiplier` VE `finalStretchMeters` değişmedi).
 * Önemli metodolojik not: BAŞLANGIÇTA denenen "naif simetrik" düzeltme
 * (her iki stamina çarpanını eşit ölçüde nötr 1.0'a çekmek,
 * `closerLateStageBonus`'u `frontRunnerPositionBonus`'un mevcut değerine
 * eşitlemek) GERÇEK motora karşı (bu oturumda YENİ keşfedilen bir
 * yerel `tsx` + gerçek workspace paketleri çalıştırma yöntemiyle, CI
 * round-trip'i BEKLEMEDEN) test edildiğinde BAŞARISIZ oldu — "closer"in
 * baskınlığını gidermek yerine "front_runner"ı %64 payla YENİ baskın
 * taktik hâline getirdi (motor mekanikleri doğrusal/simetrik tepki
 * vermiyor). Bu yüzden nihai değerler TEORİK simetriden değil, aynı
 * yöntemle (gerçek `simulateRace`, 250/1000/2000 denemelik çoklu
 * bağımsız parti, aynı 12 atlık özdeş alan) yapılan bir ampirik
 * parametre taramasından seçildi — hem daha dengeli bir dağılım (n=2000,
 * üç bağımsız seed partisi: front_runner ~%27, tracker ~%20, mid_pack
 * ~%21, closer ~%31-32 — dört stil de artık %25'lik "taraf tutmayan"
 * hedefe eskisinden ÇOK daha yakın) HEM DE her stilin kendine özgü
 * kimliğini (closer hâlâ biraz stamina tasarrufu + küçük bir geç-aşama
 * bonusu korur, front_runner hâlâ erken/orta aşamada bir pozisyon
 * bonusu korur — hiçbiri sıfıra indirilmedi) koruyacak şekilde.
 * `STYLE_BOUNDS` aşağıda bu YENİ ölçülmüş temel çizgiyi (n=250'de
 * gözlemlenen varyansa güvenli bir marj bırakılarak) yansıtacak şekilde
 * SIKILAŞTIRILDI — eski gevşek `closer` üst sınırı (%58) kalıcı bir onay
 * DEĞİLDİ, tam da bu düzeltmeyle değişmesi beklenen geçici bir belgelemeydi.
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
    weightCompatibility: 100,
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
    // bir sonuç üretir" testi) beklenen bir sapma yaratır. ALT sınır tüm
    // stiller için %5 (hiçbiri yapısal olarak ölü bir taktik olmamalı).
    //
    // T3b DÜZELTMESİ SONRASI (bu turda, dosya başındaki doc yorumuna bkz.):
    // `closer` artık AYRI/gevşek bir üst sınıra (eski %58) İHTİYAÇ DUYMUYOR
    // — yeniden dengelenmiş `pace` config'iyle ölçülen yeni temel çizgi
    // (n=2000, üç bağımsız seed partisi) front_runner ~%27, tracker ~%20,
    // mid_pack ~%21, closer ~%31-32 idi. Üst sınırlar bu YENİ temel çizgiye,
    // n=250'lik TEK bir CI koşusunun gözlemlenen varyansına (6 bağımsız
    // partide closer %27-%40 arası dalgalandı) güvenli bir marj bırakılarak
    // ayarlandı: `closer` hâlâ en yüksek üst sınıra sahip (küçük ama GERÇEK
    // bir artık avantajı yansıtıyor — stamina tasarrufu + küçük geç-aşama
    // bonusu hâlâ mevcut, sıfırlanmadı), ama eski %58'in ÇOK altında.
    // `pace` config'i yeniden değiştirilirse bu eşikler de YENİ ölçüme göre
    // güncellenmelidir (gevşetilmiş eşik kalıcı bir onay değil).
    const STYLE_BOUNDS: Record<RacingStyle, { min: number; max: number }> = {
      front_runner: { min: 0.05, max: 0.40 },
      tracker: { min: 0.05, max: 0.35 },
      mid_pack: { min: 0.05, max: 0.35 },
      closer: { min: 0.05, max: 0.48 },
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

/**
 * R4 — Carried Weight, sadece at vücut ağırlığı alt-faktörü (bu turda
 * EKLENDİ). Yukarıdaki T3 testiyle AYNI metodoloji ("alandaki HER at
 * istatistiksel olarak ÖZDEŞ, TEK değişken hedeflenen bileşen") — burada
 * TEK değişken `racingStyle` DEĞİL, `weightCompatibility`'dir (tümü AYNI
 * `mid_pack` taktiğini kullanır, böylece taktik/kulvar mekaniği bu ölçümü
 * KİRLETMEZ). `race.config.json`'ın `baseAbilityWeights.carriedWeight`'i
 * (0.05) BİLİNÇLİ olarak KÜÇÜK olduğundan (brief'in "küçük ve kontrollü
 * etki" isteği, hardening-realism-master-plan.md §26), beklenen sonuç
 * `weightCompatibility`'nin GERÇEK bir etkisi olsa bile (T3'teki
 * `racingStyle` gibi TAMAMEN nötr bir %25 payı GEREKMEZ) hiçbir grubun
 * yapısal olarak ölü (~%0) ya da tamamen baskın (~%100) OLMAMASIDIR —
 * tıpkı T3'ün "hiçbiri yapısal olarak ölü bir taktik olmamalı" ilkesi
 * gibi.
 *
 * **GERÇEK BULGU (bu test İLK yazıldığında, push ÖNCESİ `tsx` ile GERÇEK
 * motora karşı ölçüldü — T3b'nin "motor mekanikleri doğrusal/simetrik
 * tepki vermeyebilir" dersiyle AYNI metodoloji):** `carried-weight.ts`'in
 * İLK taslağındaki `FLOOR_SCORE: 20`/`FALLOFF_DECAY_KG: 40` ile 430/580kg
 * uç ağırlıklarının `weightCompatibility`'si sırasıyla ~47.6/~36.7
 * çıkıyordu — bu, `weights.carriedWeight` (0.05) İLE ÇARPILDIĞINDA TEK
 * BAŞINA küçük bir fark gibi görünse de, `baseAbility`'ye HER segmentte
 * (8 segment, `race.config.json`'ın `segmentLengthMeters`'ı) SABİT olarak
 * tekrar eklendiğinden VE rastgele gürültü (§3) segment sayısı arttıkça
 * ortalamada baskılandığından, 250 denemede uç ağırlıklı atların galibiyet
 * payını yalnızca ~%3-4'e (yani PRATİKTE yapısal olarak ölü) düşürdüğü
 * ÖLÇÜLDÜ — brief'in "küçük ve kontrollü etki" isteğine AÇIKÇA AYKIRIYDI.
 * Kök neden `carried-weight.ts`'teki `FLOOR_SCORE`/`FALLOFF_DECAY_KG`'nin
 * TEORİK bir varsayımla (`örn. 20`) seçilmiş olmasıydı — GERÇEK motora
 * karşı hiç ÖLÇÜLMEMİŞTİ. Taban `90`'a, sönümleme `120`'ye YÜKSELTİLEREK
 * (bkz. `carried-weight.ts`'in `FLOOR_SCORE` doc yorumu) yeniden ölçüldü:
 * aynı 250 denemede uç ağırlıklı atların galibiyet payı ~%35-40'a
 * (bağımsız partilerde gözlemlenen aralık) oturdu — GERÇEKTEN "küçük ve
 * kontrollü". `WEIGHT_SHARE_BOUNDS` aşağıda bu YENİ ölçülmüş temel
 * çizgiye GÜVENLİ bir marj bırakılarak ayarlandı (T3b'nin `STYLE_BOUNDS`'ı
 * gevşetmesiyle AYNI yöntem).
 */
describe('simulateRace — R4: Carried Weight uç ağırlıklar galibiyeti dejenere etmiyor', () => {
  function makeWeightVariantEntry(horseId: string, weightCompatibility: number): RaceEntrantSnapshot {
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
      weightCompatibility,
      form: 50,
      tactic: {
        racingStyle: 'mid_pack',
        riskLevel: 'normal',
        startApproach: 'balanced',
        finalStretchPlan: 'normal',
      },
    };
  }

  // `computeWeightCompatibility`'nin (carried-weight.ts) KENDİSİ çağrılır
  // (hardcoded/eski bir değer YOK) — böylece `FLOOR_SCORE`/`FALLOFF_DECAY_KG`
  // ileride yeniden kalibre edilirse bu test SESSİZCE eski değerlerle
  // kalmaz, otomatik olarak GÜNCEL formülü ölçer.
  const IDEAL_WEIGHT_COMPATIBILITY = computeWeightCompatibility(495); // 100 — ideal merkez
  const LIGHT_EXTREME_WEIGHT_COMPATIBILITY = computeWeightCompatibility(430); // gerçekçi min
  const HEAVY_EXTREME_WEIGHT_COMPATIBILITY = computeWeightCompatibility(580); // gerçekçi max

  const WEIGHT_TRIALS = 250; // T3 ile AYNI ("200+ deneme").

  function buildWeightVariantField(): { entries: RaceEntrantSnapshot[]; extremeHorseIds: Set<string> } {
    const entries: RaceEntrantSnapshot[] = [];
    const extremeHorseIds = new Set<string>();

    for (let idx = 0; idx < FIELD_SIZE; idx += 1) {
      const horseId = `weight-horse-${idx}`;
      if (idx % 2 === 0) {
        entries.push(makeWeightVariantEntry(horseId, IDEAL_WEIGHT_COMPATIBILITY));
      } else {
        // Hafif/ağır uç değerleri sırayla dağıt — tek bir uç yönün
        // (ör. hep hafif) yanlılık yaratmadığından emin olmak için.
        const weightCompatibility =
          idx % 4 === 1 ? LIGHT_EXTREME_WEIGHT_COMPATIBILITY : HEAVY_EXTREME_WEIGHT_COMPATIBILITY;
        entries.push(makeWeightVariantEntry(horseId, weightCompatibility));
        extremeHorseIds.add(horseId);
      }
    }

    return { entries, extremeHorseIds };
  }

  it('12 atlık, istatistiksel olarak özdeş (yalnızca weightCompatibility farklı) bir alanda 250 denemede uç ağırlıklı atların galibiyet payı dejenere (~%0 ya da ~%100) değildir', () => {
    const { entries, extremeHorseIds } = buildWeightVariantField();

    let extremeWins = 0;
    let idealWins = 0;

    for (let i = 0; i < WEIGHT_TRIALS; i += 1) {
      const timeline = simulateRace({ ...baseInput, simulationSeed: `r4-weight-field-balance-${i}`, entries });
      const winnerId = timeline.finalResult[0]!.horseId;
      if (extremeHorseIds.has(winnerId)) {
        extremeWins += 1;
      } else {
        idealWins += 1;
      }
    }

    expect(extremeWins + idealWins).toBe(WEIGHT_TRIALS);

    const extremeShare = extremeWins / WEIGHT_TRIALS;
    // Alandaki atların yarısı "uç ağırlıklı" olduğundan tarafsız bir motorda
    // beklenen pay %50'dir. `carriedWeight` ağırlığı (0.05) KÜÇÜK olduğundan
    // GERÇEK bir sapma beklenir (bkz. dosya başındaki "GERÇEK BULGU" doc
    // yorumu — kalibre edilmiş `carried-weight.ts` ile ÖLÇÜLEN temel çizgi
    // ~%35-40) ama HİÇBİR grup yapısal olarak ölü (~%0) ya da tamamen
    // baskın (~%100) OLMAMALIDIR. `WEIGHT_SHARE_BOUNDS` bu ÖLÇÜLEN temel
    // çizgiye (bağımsız partilerde ~%35-40 arası gözlemlendi) güvenli bir
    // marj bırakılarak ayarlandı — T3b'nin `STYLE_BOUNDS`'ı gevşetmesiyle
    // AYNI yöntem; `carried-weight.ts`'in `FLOOR_SCORE`/`FALLOFF_DECAY_KG`'si
    // yeniden kalibre edilirse bu eşikler de YENİ ölçüme göre güncellenmelidir.
    const WEIGHT_SHARE_BOUNDS = { min: 0.15, max: 0.7 };
    expect(
      extremeShare,
      `uç ağırlıklı atların galibiyet payı ${(extremeShare * 100).toFixed(1)}% — yapısal olarak ölü eşiği %${WEIGHT_SHARE_BOUNDS.min * 100}`,
    ).toBeGreaterThan(WEIGHT_SHARE_BOUNDS.min);
    expect(
      extremeShare,
      `uç ağırlıklı atların galibiyet payı ${(extremeShare * 100).toFixed(1)}% — baskınlık eşiği %${WEIGHT_SHARE_BOUNDS.max * 100}`,
    ).toBeLessThan(WEIGHT_SHARE_BOUNDS.max);
  });
});
