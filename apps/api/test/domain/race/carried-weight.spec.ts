import { describe, expect, it } from 'vitest';
import { computeWeightCompatibility } from '../../../src/domain/race/carried-weight';

describe('computeWeightCompatibility (R4 — Carried Weight, sadece at vücut ağırlığı alt-faktörü)', () => {
  it('weightKg null ise nötr (50) döner (ör. henüz backfill edilmemiş bir at)', () => {
    expect(computeWeightCompatibility(null)).toBe(50);
  });

  it('ideal merkezde (495kg) en yüksek puanı (100) döner', () => {
    expect(computeWeightCompatibility(495)).toBe(100);
  });

  it('ideal aralığın kenarlarında (470/520kg) yüksek ama merkezden düşük bir puan (95) döner', () => {
    expect(computeWeightCompatibility(470)).toBe(95);
    expect(computeWeightCompatibility(520)).toBe(95);
  });

  it('ideal aralık içinde SİMETRİKTİR (merkeze eşit uzaklıktaki iki değer AYNI puanı verir)', () => {
    expect(computeWeightCompatibility(485)).toBe(computeWeightCompatibility(505));
    expect(computeWeightCompatibility(475)).toBe(computeWeightCompatibility(515));
  });

  it('ideal aralığın dışında SİMETRİKTİR (merkeze eşit uzaklıktaki iki uç değer AYNI puanı verir)', () => {
    expect(computeWeightCompatibility(430)).toBe(computeWeightCompatibility(560));
    expect(computeWeightCompatibility(580)).toBeCloseTo(computeWeightCompatibility(410), 5);
  });

  it('ideal aralığın dışına çıkıldıkça puan monoton olarak DÜŞER', () => {
    const scoreAtEdge = computeWeightCompatibility(520);
    const scoreBeyond = computeWeightCompatibility(540);
    const scoreFarBeyond = computeWeightCompatibility(580);
    expect(scoreBeyond).toBeLessThan(scoreAtEdge);
    expect(scoreFarBeyond).toBeLessThan(scoreBeyond);
  });

  /**
   * Taban değeri `90` (İLK taslakta `20`'ydi) — bkz. `carried-weight.ts`'in
   * `FLOOR_SCORE` doc yorumu: GERÇEK `simulateRace` motoruna karşı 250+
   * denemeli bir Monte Carlo testiyle (bkz. `race-engine-field-balance.
   * spec.ts`), `20`'lik bir tabanın 430/580kg gibi UÇ ağırlıkları neredeyse
   * yapısal olarak ölü (~%3-4 galibiyet payı) hale getirdiği ÖLÇÜLDÜ — brief'in
   * "küçük ve kontrollü etki" isteğine aykırıydı. `90`'a yükseltilmesi bu
   * etkiyi GERÇEKTEN küçük/kontrollü hale getirdi (~%35-40).
   */
  it('aşırı uçlarda bile (gerçekçi min/max sınırlar 430/580kg) taban değere (90) YALNIZCA yaklaşır, asla ULAŞMAZ/altına düşmez', () => {
    const scoreAtMin = computeWeightCompatibility(430);
    const scoreAtMax = computeWeightCompatibility(580);
    expect(scoreAtMin).toBeGreaterThan(90);
    expect(scoreAtMax).toBeGreaterThan(90);
    // Sınırların ÇOK ötesinde bile (gerçek bir at asla bu kadar aşırı olmaz)
    // taban değerin altına DÜŞMEZ — sert bir eşik/0 YOKTUR.
    expect(computeWeightCompatibility(1000)).toBeGreaterThan(90);
    expect(computeWeightCompatibility(-1000)).toBeGreaterThan(90);
  });

  it('hiçbir zaman 0 döndürmez (aşırı uç bir değerde bile)', () => {
    expect(computeWeightCompatibility(430)).toBeGreaterThan(0);
    expect(computeWeightCompatibility(580)).toBeGreaterThan(0);
  });

  it('sonuç her zaman [0, 100] aralığındadır', () => {
    for (const weightKg of [200, 400, 430, 470, 495, 520, 580, 700, 900]) {
      const score = computeWeightCompatibility(weightKg);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('aynı girdi için her zaman aynı puanı döner (saf fonksiyon)', () => {
    expect(computeWeightCompatibility(512)).toBe(computeWeightCompatibility(512));
  });
});
