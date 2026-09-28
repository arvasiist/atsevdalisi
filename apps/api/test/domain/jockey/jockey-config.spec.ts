import { describe, expect, it } from 'vitest';
import type { Jockey } from '@at-sevdalisi/shared-types';
import { loadJockeyConfig } from '@at-sevdalisi/game-config';
import {
  calculateJockeyHorseCompatibility,
  calculateJockeySkillComposite,
  type JockeyCompatibilityInput,
} from '../../../src/domain/jockey/jockey';
import { NEUTRAL_UNMODELED_TRAIT_SCORE } from '../../../src/domain/race/entrant-snapshot';

/**
 * `config/jockey.config.json` DEĞİŞMEZLERİ (invariants) — PHASE 6.2
 * (29.09.2026).
 *
 * NEDEN AYRI BİR TEST: `packages/game-config/src/index.ts`'teki
 * `load*Config()` fonksiyonları `JSON` import'unu tip iddiasıyla
 * (`as unknown as X`) döndüren SAF cast'lerdir — ÇALIŞMA ZAMANI
 * DOĞRULAMASI YOKTUR (`gift-config.spec.ts`/`social-config.spec.ts` ile
 * AYNI gerekçe). Dosyadaki bir yazım hatası (ör. `0.20` yerine `2.0`)
 * derleyiciden GEÇER ve üretimde SESSİZCE yanlış puan üretir.
 *
 * **BU DOSYANIN ASIL DEĞERİ ÜÇ KANITTIR:**
 *   1. İki ağırlık kümesinin de toplamı 1.0'dır. Toplam 1'den saparsa
 *      puan ÖLÇEK DEĞİŞTİRİR: 1.2 olursa tüm jokeyler 20 puan daha güçlü
 *      görünür, 0.8 olursa 20 puan daha zayıf — ve bu hiçbir yerde hata
 *      üretmez, yalnızca dengedeki her ölçümü yanıltır.
 *   2. **ORTALAMA BİR JOKEY (tüm beceriler 50) TAM OLARAK NÖTR 50 VERİR.**
 *      Bu, "jokeyi olmayan oyuncu" ile "vasat jokeyi olan oyuncu"nun
 *      motor karşısında AYNI yerde durmasını sağlar; ağırlıklar 1.0'dan
 *      saparsa ya da nötr kavramı 50'den kayarsa, jokey kiralamak sessizce
 *      bir avantaj ya da ceza hâline gelir (brief: "gizli bonus YOK").
 *   3. Ağırlıklar negatif değildir ve girdiler 0-100 aralığındayken sonuç
 *      da 0-100 aralığında kalır (ağırlıklı ortalama, taşma yapmaz).
 */
const config = loadJockeyConfig();

/** Test amaçlı minimal jokey — `calculateJockeySkillComposite` bir `Pick` alır. */
function makeJockeySkills(
  score: number,
): Pick<Jockey, 'startSkill' | 'tacticalSkill' | 'sprintSkill' | 'horseControl' | 'riskManagement' | 'trackKnowledge'> {
  return {
    startSkill: score,
    tacticalSkill: score,
    sprintSkill: score,
    horseControl: score,
    riskManagement: score,
    trackKnowledge: score,
  };
}

/** Ağırlıkların toplamı için kayan nokta toleransı (0.15+0.20+... ikili gösterimde tam 1 vermez). */
const WEIGHT_SUM_EPSILON = 1e-9;

describe('jockey.config.json — skillCompositeWeights', () => {
  it('ağırlıkların toplamı 1.0 (aksi halde puan SESSİZCE ölçek değiştirir)', () => {
    const w = config.skillCompositeWeights;
    const sum =
      w.startSkill + w.tacticalSkill + w.sprintSkill + w.horseControl + w.riskManagement + w.trackKnowledge;
    expect(Math.abs(sum - 1)).toBeLessThan(WEIGHT_SUM_EPSILON);
  });

  it('her ağırlık negatif değildir', () => {
    for (const [name, value] of Object.entries(config.skillCompositeWeights)) {
      expect(value, `${name} negatif olmamalı`).toBeGreaterThanOrEqual(0);
    }
  });

  it('altı becerinin HEPSİ sıfırdan büyük ağırlığa sahiptir (ölü alan bırakılmaz)', () => {
    // Ağırlığı 0 olan bir beceri, `jockeys` tablosunda DOLDURULAN ama
    // motorun HİÇ OKUMADIĞI bir alan demektir — oyuncunun göremediği
    // "sahte" bir stat. Bir beceriyi bilinçli olarak devre dışı bırakmak
    // isteniyorsa bu, config'te sessizce 0 yazmak değil, bilinçli bir
    // karar olarak buraya yazılmalıdır.
    for (const [name, value] of Object.entries(config.skillCompositeWeights)) {
      expect(value, `${name} sıfır olmamalı`).toBeGreaterThan(0);
    }
  });

  it('ortalama bir jokey (tüm beceriler 50) TAM nötr değeri verir', () => {
    // Yukarıdaki dosya başı notunun (2) maddesi: bu iddia, ağırlıklar
    // toplamı bozulduğunda da KIRILIR ve "jokey kiralamak gizli bir bonus
    // mu?" sorusunu CI'da yanıtlar.
    expect(calculateJockeySkillComposite(makeJockeySkills(50), config)).toBe(NEUTRAL_UNMODELED_TRAIT_SCORE);
  });

  it('0 ve 100 uçlarında sonuç 0 ve 100\'dür (aralık korunur)', () => {
    expect(calculateJockeySkillComposite(makeJockeySkills(0), config)).toBe(0);
    expect(calculateJockeySkillComposite(makeJockeySkills(100), config)).toBe(100);
  });

  it('sonuç her zaman 0-100 aralığındadır (örneklenen tüm puanlarda)', () => {
    for (let score = 0; score <= 100; score += 5) {
      const composite = calculateJockeySkillComposite(makeJockeySkills(score), config);
      expect(composite).toBeGreaterThanOrEqual(0);
      expect(composite).toBeLessThanOrEqual(100);
    }
  });
});

describe('jockey.config.json — compatibilityWeights ve sabitler', () => {
  it('ağırlıkların toplamı 1.0', () => {
    const w = config.compatibilityWeights;
    const sum = w.temperament + w.style + w.experience + w.history;
    expect(Math.abs(sum - 1)).toBeLessThan(WEIGHT_SUM_EPSILON);
  });

  it('her uyumluluk ağırlığı sıfırdan büyüktür (ölü bileşen yok)', () => {
    for (const [name, value] of Object.entries(config.compatibilityWeights)) {
      expect(value, `${name} sıfır olmamalı`).toBeGreaterThan(0);
    }
  });

  it('experienceForMaxScore pozitiftir (aksi halde deneyim bileşeni hep 100 olurdu)', () => {
    expect(config.experienceForMaxScore).toBeGreaterThan(0);
  });

  it('neutralHistoryScore 0-100 aralığındadır (geçmişi olmayan ikili aralık DIŞINA çıkmamalı)', () => {
    expect(config.neutralHistoryScore).toBeGreaterThanOrEqual(0);
    expect(config.neutralHistoryScore).toBeLessThanOrEqual(100);
  });

  it('uyumluluk sonucu her zaman 0-100 aralığındadır (uç girdilerde bile)', () => {
    const extremes: JockeyCompatibilityInput['jockey'][] = [
      { horseControl: 0, tacticalSkill: 0, sprintSkill: 0, trackKnowledge: 0, experience: 0 },
      { horseControl: 100, tacticalSkill: 100, sprintSkill: 100, trackKnowledge: 100, experience: 10_000 },
    ];
    for (const jockey of extremes) {
      for (const temperament of [0, 50, 100]) {
        for (const racingStyle of ['front_runner', 'closer', 'mid_pack'] as const) {
          const compatibility = calculateJockeyHorseCompatibility(
            { horse: { temperament, racingStyle }, jockey, previousPairAveragePerformance: null },
            config,
          );
          expect(compatibility).toBeGreaterThanOrEqual(0);
          expect(compatibility).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});
