/**
 * PHASE 5 — YARIŞ DENGESİ KİLİDİ (brief §42 PHASE 5, 29.09.2026).
 *
 * Brief: “Race Engine tested with minimum 10.000 simulations per field size
 * (8/10/12/14/16).” Bu dosya o ölçümü **CI'da kilitler**; rapor üreticisi
 * (`apps/api/tools/race-balance-report.ts`) AYNI koşum modülünü
 * (`race-balance-harness.ts`) kullanır — yani `docs/RACE_BALANCE_REPORT.md`
 * ile buradaki eşikler ayrışamaz.
 *
 * ## Eşikler NEREDEN geliyor
 *
 * Reponun yerleşik metodolojisi (`race-engine-field-balance.spec.ts`, T3/T3b):
 * **ölçülen temel çizgi + güvenli marj** — asla teori. Aşağıdaki her sayı
 * 10.000 koşumluk bir ölçümden gelir ve yanında ölçülen değer ile marj
 * yorum olarak yazılıdır. Config değişip denge kayarsa bu test **kırmızıya
 * döner**; istenen davranış tam olarak budur.
 *
 * ## Neden her saha boyutu AYRI bir test
 *
 * Harness `--testTimeout=60000` ile koşar ve saha boyutu başına koşum
 * ~5×10.000 = 50.000 simülasyondur (~9-11 sn). Hepsini tek testte toplamak
 * 60 sn'lik tavanı zorlardı ve bir boyuttaki yavaşlama diğerlerini de
 * düşürürdü. Böylece kırmızı, hangi saha boyutunda kırıldığını söyler.
 *
 * ## Bu dosya NEYİ iddia ETMEZ — ve neden
 *
 * Ölçüm iki rahatsız edici gerçeği ortaya çıkardı (rapor §2c + §4a + §7.6):
 *
 *  1. **Yapay merdiven sahalarında alt yarı 10.000 yarışta HİÇ kazanmıyor**
 *     — ve bandı daraltmak bunu düzeltmiyor.
 *  2. **Üretim sahası da aynı yönde:** rastgele lobilerde favori ortalama
 *     `1/N`in 4.9×-8.0× üzerinde kazanıyor, en kötü lobide %99.8'e çıkıyor,
 *     ve 500 yarışta hiç kazanmayan botlar var.
 *
 * Kök neden: segment gürültüsünün (`randomFactorRange: [-6, 6]`) yarış
 * düzeyindeki standart hatası ~1.2 puandır; yetenek farkı bunu aşınca
 * sıralama saha kurulurken belirlenir.
 *
 * Bu bir **denge riskidir** ve bu dilimde **düzeltilmedi**: `race.config.json`
 * değişikliği dondurulmuş `horse_snapshot`ların replay'ini sessizce başka
 * bir sonuca çevirirdi (CLAUDE.md kural 2). Bu yüzden burada yalnızca
 * **kırılmaması gereken** şeyler iddia edilir; “alt yarı hiç kazanmıyor”
 * ya da “en kötü lobide favori %99.8” gibi ölçümler **iyi** diye
 * sabitlenmez (düzeltilince CI kırmızıya dönmemeli). Ölçülen risk
 * `docs/RACE_BALANCE_REPORT.md`'de yazılıdır.
 */

import { describe, expect, it } from 'vitest';
import {
  DETERMINISM_CHECKS,
  FIELD_SIZES,
  measureFieldSize,
  probeDistance,
  type FieldSizeMeasurement,
} from './race-balance-harness';

/** Brief §42 PHASE 5'in alt sınırı — düşürülmesi brief'i ihlal eder. */
const TRIALS = 10_000;

/**
 * Ölçüm pahalıdır; her boyut için BİR kez koşulur ve önbelleğe alınır.
 * Önbellek olmasaydı her `it` bloğu ölçümü baştan koşardı (5 kat maliyet).
 */
const cache = new Map<number, FieldSizeMeasurement>();
function measurementFor(fieldSize: number): FieldSizeMeasurement {
  const cached = cache.get(fieldSize);
  if (cached) {
    return cached;
  }
  const measured = measureFieldSize(fieldSize, TRIALS);
  cache.set(fieldSize, measured);
  return measured;
}

// ---------------------------------------------------------------------------
// ÖLÇÜLEN TEMEL ÇİZGİ (10.000 koşum/saha, 1600 m / çim / güneşli / 22 °C)
// ---------------------------------------------------------------------------
//
// Sayılar `docs/RACE_BALANCE_REPORT.md` ile AYNI koşumdan gelir. Marjlar
// ölçülen değerin belirgin dışında bırakıldı: n=10.000'de payların standart
// hatası ~%0.5 olduğu için rastgele sapmayı rahatça yutar, ama gerçek bir
// denge kaymasını yutmaz.
//
// | Ölçüm | Dar merdiven | Geniş merdiven | Üretim (20 lobi) |
// | --- | --- | --- | --- |
// | favori payı (ort.) | 0.762–0.927 | 0.874–0.978 | 0.426–0.670 |
// | favori / `1/N` | 7.42×–12.20× | 7.82×–13.99× | 4.94×–8.04× |
// | en kötü lobide favori | — | — | 0.768–0.998 |
// | en zayıf at | 0.000 | 0.000 | — |
// | ilk yarı toplam | 1.000 | 1.000 | — |
// | hiç kazanmayan | 4–8 | 5–11 | ort. 2.7–8.0 |
// | tek botun en yüksek payı (ort.) | — | — | 0.525–0.698 |
// | Spearman | 0.523–0.614 | 0.472–0.590 | — |
//
// ⚠️ Yukarıdaki “en zayıf at 0.000” ve “ilk yarı toplam 1.000” satırları
// merdiven sahalarına aittir ve **yapaydır** (sekiz özellik aynı anda aynı
// yönde hareket eder — bkz. harness doc yorumu). Bu yüzden **iddia
// EDİLMEZLER**; yalnızca rapora yazılır. Aşağıdaki eşikler bu satırların
// hiçbirine bağlı değildir.

const BOUNDS = {
  /**
   * Yetenek aktarımı: favori tarafsız `1/N`in belirgin üzerinde olmalı.
   * Ölçülen oran (favori / `1/N`) dar merdivende 7.42×–12.20×, geniş
   * merdivende 7.82×–13.99×. Eşik 3× — motorun yeteneği TAMAMEN
   * görmezden geldiği bir regresyonu yakalar.
   */
  ladderSkillRatioMin: 3,
  /**
   * Ama tam determinizm DEĞİL: `1.00` bir denge hatasıdır (sonuç önceden
   * bilinirdi). Ölçülen en yüksek 0.978 (geniş bant, 8 at).
   */
  ladderFavoriteMax: 0.995,
  /**
   * Geniş bantta favori, dar banttan DAHA güçlü olmalı: yetenek farkı
   * büyüdükçe sinyal monoton artmalı. Ölçülen her boyutta doğru
   * (0.978>0.927, 0.952>0.858, 0.938>0.830, 0.898>0.808, 0.874>0.762).
   */
  wideAboveNarrowMargin: 0.01,
  /**
   * Stil payı: hiçbir taktik yapısal ölü (~0) ya da baskın (~1) olmamalı.
   * Ölçülen 0.1876–0.3299. Sınırlar onun belirgin dışında.
   */
  styleShareMin: 0.1,
  styleShareMax: 0.55,
  /**
   * Üretim sahası: favori `1/N`in belirgin üzerinde olmalı (yetenek işliyor).
   * Ölçülen ortalama 0.426–0.670.
   */
  botFavoriteMin: 0.25,
  /**
   * Ama saha kurulduğu anda sonucu belirlememeli. Ölçülen en yüksek 0.670;
   * 0.85 tavanı ölçülenin belirgin dışında, yine de “yarış yazı-turaya /
   * önceden yazılmış senaryoya döndü” kaymasını yakalar.
   */
  botFavoriteMax: 0.85,
  /**
   * Tek bir bot galibiyetlerin çoğunu almamalı. Ölçülen ortalama en yüksek
   * pay 0.525–0.698; tavan 0.85.
   */
  botMostWinsShareMax: 0.85,
  /**
   * ⚠️ `worstFavoriteWinRate` burada **0.95 diye kilitlenmez**: ölçülen en
   * kötü lobi 0.998'dir, yani böyle bir eşik zaten kırmızı olurdu. Bu, tam
   * olarak raporun §4a'daki **düzeltilmemiş denge bulgusudur** ve “iyi” diye
   * sabitlenmemelidir (düzeltilince test kırılmamalı). Yalnızca **kesinlik**
   * iddia edilir: hiçbir lobide favori `1.00` değildir.
   */
  botWorstFavoriteStrictlyBelow: 1,
  /** Beraberlik nadir olmalı: ölçülen 3–15 / 10.000. */
  tiedRaceRateMax: 0.005,
} as const;

/** Mesafe probu — “uzun yarış daha yavaş” kuralı. */
const DISTANCE_PROBE_TRIALS = 1_000;

/** Stil payları toplamı 1'e bu ondalık duyarlıkla eşit olmalı (kayan nokta). */
const SHARE_SUM_PRECISION = 6;

/**
 * Bot ölçümü en az bu kadar AYRI lobi örneklemelidir. Tek bir sabit saha
 * ölçmek yazı-turası ölçmektir (rapor §4'ün “Neden 20 ayrı bot sahası”
 * paragrafı): o hatanın geri gelmesini bu eşik yakalar.
 */
const BOT_FIELD_SAMPLES_MIN = 10;
/** Ve örneklenen yarış sayısı koşum bütçesinin en az bu oranı olmalı. */
const BOT_SAMPLE_COVERAGE_MIN = 0.5;

/** Mesafe probunun iki ucu (metre). */
const DISTANCE_PROBE_SHORT_METERS = 1200;
const DISTANCE_PROBE_LONG_METERS = 2400;
/**
 * Uzun/kısa süre oranı. Mesafe iki katına çıktığı için ~2.0 beklenir;
 * bunun belirgin altı “mesafe motora hiç girmiyor” demek olurdu.
 */
const DISTANCE_TIME_RATIO_MIN = 1.8;

describe('PHASE 5 — yarış dengesi (10.000 koşum / saha boyutu)', () => {
  describe.each(FIELD_SIZES)('saha boyutu %i', (fieldSize) => {
    it('yapısal bütünlük ve determinizm bozulmuyor', () => {
      const { structural } = measurementFor(fieldSize);

      // Sıralama her yarışta 1..N'in bir permütasyonudur: ne eksik ne çift.
      expect(structural.wrongLengthRaces).toBe(0);
      expect(structural.nonPermutationRaces).toBe(0);

      // Aynı seed + aynı snapshot + aynı config = bit bit aynı sonuç.
      expect(structural.determinismChecks).toBe(DETERMINISM_CHECKS);
      expect(structural.determinismMismatches).toBe(0);

      // Tam beraberlik (`finishTimeMs` eşitliği) nadir olmalı — sıfır olması
      // şart değil, ama yaygın olması motorun ayrıştırmadığını gösterirdi.
      expect(structural.tiedRaces / structural.trials).toBeLessThanOrEqual(BOUNDS.tiedRaceRateMax);
    });

    it('merdiven sahalarında yetenek kazandırıyor ama motor tam deterministik değil', () => {
      const { abilityNarrow, abilityWide } = measurementFor(fieldSize);

      // Yetenek gerçekten sonuca dönüşüyor — iki bantta da.
      expect(abilityNarrow.favoriteWinRate / abilityNarrow.uniformWinRate).toBeGreaterThanOrEqual(
        BOUNDS.ladderSkillRatioMin,
      );
      expect(abilityWide.favoriteWinRate / abilityWide.uniformWinRate).toBeGreaterThanOrEqual(
        BOUNDS.ladderSkillRatioMin,
      );

      // ⚠️ Ama `1.00` DEĞİL. Bu satır §2c'deki bulgunun kilididir: sürpriz
      // payı dar ama sıfır değil. `randomFactorRange` tamamen ölürse ya da
      // taban puan ölçeği bozulursa favori payı 1.00'a yapışır ve burada
      // kırmızıya döner.
      expect(abilityNarrow.favoriteWinRate).toBeLessThanOrEqual(BOUNDS.ladderFavoriteMax);
      expect(abilityWide.favoriteWinRate).toBeLessThanOrEqual(BOUNDS.ladderFavoriteMax);

      // Yetenek farkı büyüdükçe sinyal monoton ARTAR.
      expect(abilityWide.favoriteWinRate).toBeGreaterThan(
        abilityNarrow.favoriteWinRate + BOUNDS.wideAboveNarrowMargin,
      );
    });

    it('hiçbir taktik yapısal olarak ölü ya da baskın değil', () => {
      const { style } = measurementFor(fieldSize);

      for (const [styleName, share] of Object.entries(style.observedShare)) {
        expect(share, `${styleName} payı çok düşük (yapısal ölü)`).toBeGreaterThanOrEqual(BOUNDS.styleShareMin);
        expect(share, `${styleName} payı çok yüksek (baskın)`).toBeLessThanOrEqual(BOUNDS.styleShareMax);
      }

      // Beklenen paylar toplamı 1 olmalı — dağıtım `index % 4`'ten gelir.
      const expectedTotal = Object.values(style.expectedShare).reduce((sum, value) => sum + value, 0);
      expect(expectedTotal).toBeCloseTo(1, SHARE_SUM_PRECISION);
    });

    it('ÜRETİM sahasında denge: yetenek işliyor, yazı-turaya dönmüyor', () => {
      const { bot } = measurementFor(fieldSize);

      // Botlar da yeteneğe göre kazanıyor. Gizli bir bonus yolu olsaydı
      // (ör. bota her segmentte ekstra puan) favori payı `1/N`e çöker ya da
      // `1.00`a fırlardı; ikisi de bu iki satırı kırar.
      expect(bot.meanFavoriteWinRate).toBeGreaterThanOrEqual(BOUNDS.botFavoriteMin);
      expect(bot.meanFavoriteWinRate).toBeLessThanOrEqual(BOUNDS.botFavoriteMax);

      // Tek bir bot galibiyetlerin çoğunu almamalı.
      expect(bot.meanMostWinsShare).toBeLessThanOrEqual(BOUNDS.botMostWinsShareMax);

      // Hiçbir lobide sonuç KESİN değil (ölçülen en kötü 0.998 — rapor §4a).
      expect(bot.worstFavoriteWinRate).toBeLessThan(BOUNDS.botWorstFavoriteStrictlyBelow);

      // Ölçüm gerçekten birden fazla saha örneklemiş olmalı — tek sahaya
      // düşerse (ilk koşumdaki hata) bu sayı bir yazı-turası olur.
      expect(bot.fields).toBeGreaterThanOrEqual(BOT_FIELD_SAMPLES_MIN);
      expect(bot.racesPerField * bot.fields).toBeGreaterThanOrEqual(TRIALS * BOT_SAMPLE_COVERAGE_MIN);
    });
  });

  it('uzun yarış daha yavaş koşuluyor (mesafe sonuca giriyor)', () => {
    const fieldSize = FIELD_SIZES[0]!;
    const short = probeDistance(fieldSize, DISTANCE_PROBE_SHORT_METERS, DISTANCE_PROBE_TRIALS);
    const long = probeDistance(fieldSize, DISTANCE_PROBE_LONG_METERS, DISTANCE_PROBE_TRIALS);

    expect(long.meanWinnerTimeMs).toBeGreaterThan(short.meanWinnerTimeMs);
    // Oran 2.0 civarı olmalı: mesafe iki katına çıktı, süre de ~iki katına.
    // Belirgin biçimde ALTINDA olması “mesafe motora hiç girmiyor” demek olurdu.
    expect(long.meanWinnerTimeMs / short.meanWinnerTimeMs).toBeGreaterThan(DISTANCE_TIME_RATIO_MIN);
  });
});
