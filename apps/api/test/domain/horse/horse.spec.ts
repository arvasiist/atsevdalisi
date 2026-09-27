import { describe, expect, it } from 'vitest';
import {
  STARTER_HORSE_AGE_MONTHS,
  STARTER_HORSE_GENDERS,
  STARTER_HORSE_NAMES,
  STARTER_HORSE_POTENTIAL,
  STARTER_HORSE_QUALITY,
  STARTER_HORSE_WEIGHT_STD_DEV_KG,
  createStarterHorse,
  generateStarterHorseWeightKg,
  pickStarterHorseGender,
  pickStarterHorseName,
} from '../../../src/domain/horse/horse';
import { HORSE_WEIGHT_MAX_KG, HORSE_WEIGHT_MIN_KG, HORSE_WEIGHT_POPULATION_MEAN_KG } from '../../../src/domain/horse/weight';
import { InvalidHorseNameError } from '../../../src/domain/horse/errors';
import { getLifeStage } from '../../../src/domain/horse/age-curve';
import { loadHorseGrowthConfig } from '@at-sevdalisi/game-config';

/** Testlerde kullanılan, popülasyon ortalamasına ([0.5, 0.5, 0.5]) denk düşen sabit ağırlık örneği. */
const NEUTRAL_WEIGHT_SAMPLE: [number, number, number] = [0.5, 0.5, 0.5];

describe('createStarterHorse', () => {
  const now = new Date('2026-09-12T00:00:00.000Z');

  it('brief §7/§9 alanlarını doğru başlangıç değerleriyle doldurur', () => {
    const weightKg = generateStarterHorseWeightKg(NEUTRAL_WEIGHT_SAMPLE);
    const horse = createStarterHorse({ id: 'horse-1', ownerId: 'player-1', name: 'Yıldız', now, weightKg, gender: 'mare' });

    expect(horse.id).toBe('horse-1');
    expect(horse.ownerId).toBe('player-1');
    expect(horse.name).toBe('Yıldız');
    // 27.09.2026 — cinsiyet artık SABİT `gelding` DEĞİL, çağıranın verdiği
    // değerdir (bkz. `STARTER_HORSE_GENDERS` doc yorumu). Bu test onu
    // AYNEN geçirdiğini kanıtlar; dağılımın kendisi `pickStarterHorseGender`
    // testindedir.
    expect(horse.gender).toBe('mare');
    expect(horse.level).toBe(1);
    expect(horse.xp).toBe(0);
    expect(horse.quality).toBe(STARTER_HORSE_QUALITY);
    expect(horse.potential).toBe(STARTER_HORSE_POTENTIAL);
    expect(horse.health).toBe(100);
    expect(horse.fitness).toBe(50);
    expect(horse.fatigue).toBe(0);
    expect(horse.energy).toBe(100);
    expect(horse.morale).toBe(80);
    expect(horse.status).toBe('active');
    expect(horse.sireId).toBeNull();
    expect(horse.damId).toBeNull();
    expect(horse.weightKg).toBe(weightKg);
  });

  it('isim baştaki/sondaki boşlukları kırpar', () => {
    const horse = createStarterHorse({
      id: 'horse-1',
      ownerId: 'player-1',
      name: '  Rüzgar  ',
      now,
      weightKg: generateStarterHorseWeightKg(NEUTRAL_WEIGHT_SAMPLE),
      gender: 'stallion',
    });
    expect(horse.name).toBe('Rüzgar');
  });

  it('çok kısa isim için InvalidHorseNameError fırlatır', () => {
    expect(() =>
      createStarterHorse({
        id: 'horse-1',
        ownerId: 'player-1',
        name: 'A',
        now,
        weightKg: generateStarterHorseWeightKg(NEUTRAL_WEIGHT_SAMPLE),
        gender: 'gelding',
      }),
    ).toThrow(InvalidHorseNameError);
  });

  it('doğum tarihi, atın "prime" evresinde (antrenmana/yarışa hazır) olacak şekilde ayarlanır', () => {
    const horse = createStarterHorse({
      id: 'horse-1',
      ownerId: 'player-1',
      name: 'Yıldız',
      now,
      weightKg: generateStarterHorseWeightKg(NEUTRAL_WEIGHT_SAMPLE),
      gender: 'gelding',
    });
    const config = loadHorseGrowthConfig();
    const stage = getLifeStage(STARTER_HORSE_AGE_MONTHS, config);
    expect(stage.name).toBe('prime');
    expect(new Date(horse.birthDate).getTime()).toBeLessThan(now.getTime());
  });
});

describe('generateStarterHorseWeightKg (R4 — Carried Weight)', () => {
  it('[0.5, 0.5, 0.5] (Bates(3) ortalaması) için nüfus ortalamasını (495kg) döner', () => {
    expect(generateStarterHorseWeightKg([0.5, 0.5, 0.5])).toBe(HORSE_WEIGHT_POPULATION_MEAN_KG);
  });

  it('aynı girdi için her zaman aynı ağırlığı döner (saf fonksiyon)', () => {
    const samples: [number, number, number] = [0.12, 0.83, 0.47];
    expect(generateStarterHorseWeightKg(samples)).toBe(generateStarterHorseWeightKg(samples));
  });

  it('farklı örnekler [430, 580] aralığının dışına ASLA çıkmaz (clamp)', () => {
    expect(generateStarterHorseWeightKg([0, 0, 0])).toBeGreaterThanOrEqual(HORSE_WEIGHT_MIN_KG);
    expect(generateStarterHorseWeightKg([0.999999, 0.999999, 0.999999])).toBeLessThanOrEqual(HORSE_WEIGHT_MAX_KG);
  });

  it('farklı örnekler gerçekten farklı (çeşitlilik gösteren) ağırlıklar üretir — sabit/mock bir değer DEĞİL', () => {
    const low = generateStarterHorseWeightKg([0.1, 0.1, 0.1]);
    const mid = generateStarterHorseWeightKg([0.5, 0.5, 0.5]);
    const high = generateStarterHorseWeightKg([0.9, 0.9, 0.9]);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it(`nüfus std sapması (${STARTER_HORSE_WEIGHT_STD_DEV_KG}kg) tay std sapmasından (breeding.ts, 15kg) BİLİNÇLİ olarak daha geniştir`, () => {
    expect(STARTER_HORSE_WEIGHT_STD_DEV_KG).toBeGreaterThan(15);
  });
});

describe('pickStarterHorseName', () => {
  it('0 için ilk ismi döner', () => {
    expect(pickStarterHorseName(0)).toBe(STARTER_HORSE_NAMES[0]);
  });

  it("0.999... (1'e en yakın değer) için son ismi döner", () => {
    expect(pickStarterHorseName(0.9999999)).toBe(STARTER_HORSE_NAMES[STARTER_HORSE_NAMES.length - 1]);
  });

  it('geçerli aralık dışındaki değerlerde bile havuzdaki bir isme sınırlanır (clamp)', () => {
    expect(STARTER_HORSE_NAMES).toContain(pickStarterHorseName(-1));
    expect(STARTER_HORSE_NAMES).toContain(pickStarterHorseName(2));
  });

  it('aynı girdi için her zaman aynı ismi döner (saf fonksiyon)', () => {
    expect(pickStarterHorseName(0.42)).toBe(pickStarterHorseName(0.42));
  });
});

/**
 * 27.09.2026 — başlangıç atı artık HER ZAMAN `gelding` DEĞİL (bkz.
 * `STARTER_HORSE_GENDERS` doc yorumu). Bu blok yalnızca fonksiyonun
 * mekaniğini değil, **kilidin geri gelmemesini** de korur: havuzda
 * `mare`/`stallion` bulunmalı ve ikisi de GERÇEKTEN üretilebilmelidir —
 * aksi halde oyunda üreyebilen at bulunamaz ve yetiştiricilik yine
 * ulaşılamaz hale gelir.
 */
describe('pickStarterHorseGender', () => {
  it('0 için havuzun ilk cinsiyetini döner', () => {
    expect(pickStarterHorseGender(0)).toBe(STARTER_HORSE_GENDERS[0]);
  });

  it("0.999... (1'e en yakın değer) için havuzun son cinsiyetini döner", () => {
    expect(pickStarterHorseGender(0.9999999)).toBe(STARTER_HORSE_GENDERS[STARTER_HORSE_GENDERS.length - 1]);
  });

  it('geçerli aralık dışındaki değerlerde bile havuzdaki bir cinsiyete sınırlanır (clamp)', () => {
    expect(STARTER_HORSE_GENDERS).toContain(pickStarterHorseGender(-1));
    expect(STARTER_HORSE_GENDERS).toContain(pickStarterHorseGender(2));
  });

  it('aynı girdi için her zaman aynı cinsiyeti döner (saf fonksiyon)', () => {
    expect(pickStarterHorseGender(0.42)).toBe(pickStarterHorseGender(0.42));
  });

  it('havuz ÜREYEBİLEN cinsiyetleri İÇERİR — mare ve stallion üretilebilir OLMALI', () => {
    // Bu iddia, "başlangıç atı hep gelding" kararının sessizce geri
    // dönmesini engelleyen asıl testtir (bkz. describe üstü yorum).
    expect(STARTER_HORSE_GENDERS).toContain('mare');
    expect(STARTER_HORSE_GENDERS).toContain('stallion');

    const produced = new Set(
      Array.from({ length: 300 }, (_, index) => pickStarterHorseGender(index / 300)),
    );
    expect(produced).toContain('mare');
    expect(produced).toContain('stallion');
    // Ve hiçbiri TEK BAŞINA tüm sonuç değildir (sabit değer regresyonu).
    expect(produced.size).toBeGreaterThan(1);
  });
});
