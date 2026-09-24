/**
 * At vücut ağırlığı (weight_kg) üretimi — GERÇEK, çeşitlilik gösteren
 * değerler (bkz. `horse.ts`'teki `createStarterHorse`/`generateStarterHorseWeightKg`
 * ve `../breeding/breeding.ts`'teki `breedHorses`, bu dosyanın İKİ
 * tüketicisi). `database/migrations/0002_create_tracks_and_horses.up.sql`'deki
 * `weight_kg` sütunu bu değişiklikten ÖNCE HİÇBİR gerçek kod yolu
 * tarafından doldurulmuyordu (her zaman `null`) — `database/migrations/
 * 0027_backfill_horse_weight_kg.up.sql` mevcut atları AYNI dağılım
 * yaklaşımıyla (SQL'e çevrilmiş hâliyle) geriye dönük doldurur.
 *
 * Bu dosya saf matematiktir, hiçbir at/breeding kavramı bilmez —
 * `../breeding/genetics.ts`'in "sadece sayı üretir" ilkesiyle AYNI.
 *
 * Gerçek bir Thoroughbred yarış atının ortalama vücut ağırlığı ~450-550 kg
 * aralığındadır; burada nüfus ortalaması 495 kg (bu aralığın ortası) ve
 * gerçekçi bir varyans (nüfus geneli için std sapma ~25 kg, tay kalıtımı
 * için daha dar ~15 kg, bkz. `breeding.ts`) kullanılır.
 *
 * Normal dağılıma yaklaşım: `Math.random()`'ın (ya da onun yerine geçen
 * herhangi bir [0,1) rastgelelik kaynağının) ÇIPLAK hâli düz (uniform)
 * dağılım verir — gerçekçi bir popülasyonda ağırlıklar çan eğrisi
 * (normal dağılım) izler. Tam bir Box-Muller dönüşümü yerine, daha basit
 * ve yeterince doğru bir yaklaşım kullanılır: bağımsız ÜÇ tekdüze [0,1)
 * örneğin ortalaması, Irwin-Hall/Bates(n=3) dağılımını verir — bu dağılım
 * ortalaması 0.5, standart sapması `1 / sqrt(12 * 3) = 1/6 ≈ 0.1667`
 * olan, uçlara doğru YOĞUNLUĞU azalan (yani gerçek bir çan eğrisine
 * yeterince yakın) bir dağılımdır. Hedef `stdDevKg`'ye ulaşmak için
 * `(ortalama - 0.5)` değeri `stdDevKg * 6` ile ölçeklenir (çünkü
 * `1/6 * 6 = 1`). `database/migrations/0027_backfill_horse_weight_kg.up.sql`
 * SQL'de AYNI matematiği (`random()` üç kez) tekrarlar.
 */

import { clamp } from '@at-sevdalisi/shared-types';

/** Nüfus ortalaması (kg) — gerçek bir Thoroughbred yarış atının tipik aralığının (~450-550kg) ortası. */
export const HORSE_WEIGHT_POPULATION_MEAN_KG = 495;

/** Gerçekçi sınırlar (kg) — bunların dışına ASLA çıkılmaz (clamp). */
export const HORSE_WEIGHT_MIN_KG = 430;
export const HORSE_WEIGHT_MAX_KG = 580;

/**
 * Bates(n=3) dağılımının standart sapması (birim: [0,1) örnek ölçeği).
 * `stdDevKg` hedefine ulaşmak için ölçekleme çarpanı bunun tersidir (6).
 */
const BATES_3_STD_DEV_SCALING_FACTOR = 6;

/**
 * Bağımsız üç tekdüze ([0,1)) örnekten, verilen ortalama/std sapmaya sahip
 * bir çan-eğrisi-yaklaşımlı ağırlık (kg) üretir; sonuç [`HORSE_WEIGHT_MIN_KG`,
 * `HORSE_WEIGHT_MAX_KG`] aralığına clamp edilip 1 ondalık basamağa
 * yuvarlanır. Saf fonksiyon: aynı üç örnek için her zaman aynı sonucu
 * üretir — çağıran taraf (domain katmanı `Math.random()` ÇAĞIRAMAZ, bkz.
 * `pickStarterHorseName` üstündeki AYNI kural) rastgeleliği kendisi
 * üretip buraya PARAMETRE olarak geçirir.
 */
export function generateBellCurveWeightKg(
  uniformSamples: readonly [number, number, number],
  meanKg: number,
  stdDevKg: number,
): number {
  const batesAverage = (uniformSamples[0] + uniformSamples[1] + uniformSamples[2]) / 3;
  const standardizedDeviation = (batesAverage - 0.5) * (stdDevKg * BATES_3_STD_DEV_SCALING_FACTOR);
  const rawWeightKg = meanKg + standardizedDeviation;
  const clampedWeightKg = clamp(rawWeightKg, HORSE_WEIGHT_MIN_KG, HORSE_WEIGHT_MAX_KG);
  return Math.round(clampedWeightKg * 10) / 10;
}
