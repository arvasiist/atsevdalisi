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
