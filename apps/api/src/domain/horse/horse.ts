/**
 * At (Horse) domain fonksiyonları — FAZ 1 wiring, ikinci dilim (bkz.
 * docs/ROADMAP.md). Bu dosya, `domain/player/player.ts`'teki
 * `createNewPlayer` ile AYNI desendedir: saf bir fabrika (factory),
 * `id`/`now` gibi yan etkili değerler dışarıdan (Application katmanından)
 * parametre olarak verilir.
 *
 * KAPSAM (bilinçli, bu dilim): yalnızca `horses` tablosuna karşılık gelen
 * ANA alanlar dolduruluyor. `horse_stats`/`horse_surface_stats`/
 * `horse_distance_stats`/`horse_health` (görünen/gizli performans
 * özellikleri, zemin/mesafe uyumu, detaylı sağlık) bu dilimin KAPSAMI
 * DIŞINDA bırakılmıştır — bunlar Antrenman/Bakım/Yarış Motoru wiring'i
 * sırasında, o özellikler gerçekten KULLANILDIĞINDA eklenecektir (erken
 * eklemek, henüz hiçbir use-case tarafından okunmayan/yazılmayan "ölü kod"
 * üretir).
 */

import type { BreedDefinitionConfig } from '@at-sevdalisi/game-config';
import type { Horse, HorseAppearance, HorseGender } from '@at-sevdalisi/shared-types';
import { validateHorseName } from './validation';
import { generateBellCurveWeightKg, HORSE_WEIGHT_POPULATION_MEAN_KG } from './weight';

/**
 * Yeni oyuncuya verilen başlangıç atının yaşı (ay). `config/
 * horse-growth.config.json`'daki "prime" evresi (36-84 ay) içinde bir
 * değer seçilmiştir — böylece başlangıç atı hemen antrenmana/yarışa
 * hazır olur (bkz. `domain/horse/age-curve.ts` `getLifeStage`); bir tay
 * (foal) verilseydi oyuncu aylarca bekleyip antrenman/yarış YAPAMAZDI.
 */
export const STARTER_HORSE_AGE_MONTHS = 48;

// 07.10.2026 — başlangıç atının kalite/potansiyeli artık IRKTAN gelir
// (`config/breeds.config.json` → `starterBreed`); eski sabitler (45/55)
// başlangıç ırkının değerleri olarak oraya taşındı.

/**
 * Başlangıç atının cinsiyet havuzu — **27.09.2026'da DEĞİŞTİ.**
 *
 * ÖNCEDEN başlangıç atı HER ZAMAN `gelding` idi. Gerekçesi şuydu: "henüz
 * wiring edilmemiş bir FAZ 3 (Yetiştiricilik) özelliğini erken açığa
 * çıkarmamak". **O gerekçe artık geçersiz** — ve daha kötüsü, o karar
 * kendi kendini kilitliyordu: `createStarterHorse` tek at üretme yoludur,
 * Pazar yalnızca VAR OLAN atları el değiştirir, dolayısıyla HER at
 * `gelding` olduğu sürece oyunda **tek bir `mare`/`stallion` bile var
 * olamaz** ve yetiştiricilik (çiftleştirme → tay) hiçbir oyuncu için
 * ULAŞILAMAZ kalır. Proje sahibi bu kilidi açmayı onayladı (27.09.2026).
 *
 * `gelding` havuzdan ÇIKARILMADI: yarışabilen ama üreyemeyen bir at da
 * meşru bir başlangıçtır ve üç cinsiyet de gerçek atçılıkta görülür.
 */
export const STARTER_HORSE_GENDERS = ['mare', 'stallion', 'gelding'] as const;

/**
 * `[0, 1)` aralığında bir rastgelelik değerini (Application katmanının
 * `Math.random()` ile ürettiği) cinsiyet havuzundan bir cinsiyete çevirir.
 * `pickStarterHorseName` ile AYNI desen: saf fonksiyon, aynı `randomValue`
 * için her zaman aynı sonucu üretir; domain `Math.random()` ÇAĞIRMAZ.
 *
 * Dağılım DÜZGÜNDÜR (üçte bir) — ağırlıklandırma bilinçli olarak
 * YAPILMADI: `gelding`'i daha olası kılmak, yukarıda açıklanan "üreyebilen
 * at bulunamaz" kilidini kısmen geri getirirdi.
 */
export function pickStarterHorseGender(randomValue: number): HorseGender {
  const index = Math.min(
    STARTER_HORSE_GENDERS.length - 1,
    Math.max(0, Math.floor(randomValue * STARTER_HORSE_GENDERS.length)),
  );
  return STARTER_HORSE_GENDERS[index]!;
}

/**
 * Küçük, sabit bir isim havuzu. Application katmanı `pickStarterHorseName`
 * ile bu havuzdan (kendi ürettiği bir rastgelelik değeriyle) seçim yapar —
 * domain katmanı kendisi `Math.random()` ÇAĞIRMAZ (saflık kuralı,
 * docs/ARCHITECTURE.md §4).
 */
export const STARTER_HORSE_NAMES = [
  'Yıldız',
  'Rüzgar',
  'Şimşek',
  'Bahar',
  'Doru',
  'Kaplan',
  'Fırtına',
  'Akıncı',
] as const;

/**
 * `[0, 1)` aralığında bir rastgelelik değerini (Application katmanının
 * `Math.random()` ile ürettiği) sabit isim havuzundan bir isme çevirir.
 * Saf fonksiyon: aynı `randomValue` için her zaman aynı sonucu üretir.
 */
export function pickStarterHorseName(randomValue: number): string {
  const index = Math.min(STARTER_HORSE_NAMES.length - 1, Math.max(0, Math.floor(randomValue * STARTER_HORSE_NAMES.length)));
  return STARTER_HORSE_NAMES[index]!;
}

/**
 * Nüfus genelinde (kalıtım tarafından henüz daraltılmamış) kullanılan std
 * sapma (kg) — `domain/breeding/breeding.ts`'in tay ağırlığı için kullandığı
 * DAHA DAR std sapmadan (~15kg) BİLİNÇLİ olarak daha geniştir: bir
 * başlangıç atı belirli bir soydan gelmez (ebeveyni yok), bu yüzden tüm
 * popülasyonun doğal varyansını yansıtmalıdır.
 */
export const STARTER_HORSE_WEIGHT_STD_DEV_KG = 25;

/**
 * `weight_kg` (brief §7 Horse, `domain/race/carried-weight.ts`'in
 * `computeWeightCompatibility`'sinin tükettiği ham veri) için gerçek,
 * çeşitlilik gösteren bir başlangıç değeri üretir. `pickStarterHorseName`
 * ile AYNI desen: domain katmanı `Math.random()` ÇAĞIRMAZ — Application
 * katmanı (`RegisterPlayerUseCase`/`LoginWithProviderUseCase`) üç bağımsız
 * `Math.random()` değeri üretip buraya parametre olarak geçirir.
 */
export function generateStarterHorseWeightKg(uniformSamples: readonly [number, number, number]): number {
  return generateBellCurveWeightKg(uniformSamples, HORSE_WEIGHT_POPULATION_MEAN_KG, STARTER_HORSE_WEIGHT_STD_DEV_KG);
}

export interface NewStarterHorseInput {
  id: string;
  ownerId: string;
  name: string;
  /** 01.10.2026 — görünüş (bkz. `appearance.ts` `deriveAppearance`); zorunlu — atlar sessizce 'bay' doğmasın. */
  appearance: HorseAppearance;
  now?: Date;
  /**
   * Gerçek, çeşitlilik gösteren bir vücut ağırlığı (kg) — bkz.
   * `generateStarterHorseWeightKg`. Domain katmanı kendisi `Math.random()`
   * ÇAĞIRAMAYACAĞI için OPSİYONEL DEĞİLDİR: çağıran taraf bu değeri
   * `generateStarterHorseWeightKg([Math.random(), Math.random(), Math.random()])`
   * ile üretip AÇIKÇA geçirmelidir (eskiden olduğu gibi sessizce `null`
   * bırakan bir varsayılan YOKTUR — bu, "her yeni at gerçek bir ağırlıkla
   * doğar" değişmezini derleme zamanında zorunlu kılar).
   */
  weightKg: number;
  /**
   * Atın cinsiyeti — `weightKg` ile AYNI gerekçeyle ZORUNLUDUR: çağıran
   * taraf `pickStarterHorseGender(Math.random())` ile üretip AÇIKÇA
   * geçirir. Sessiz bir varsayılan (`gelding`) BIRAKILMAMIŞTIR, çünkü
   * böyle bir varsayılan yukarıda açıklanan "oyunda hiç mare/stallion
   * olamaz" kilidini fark edilmeden geri getirirdi.
   */
  gender: HorseGender;
  /**
   * 07.10.2026 — atın ırkı (kalite/potansiyel buradan). Başlangıç atında
   * `getStarterBreed(config)` — ücretsiz verilen en zayıf ırk.
   */
  breed: BreedDefinitionConfig;
  /** Varsayılan `STARTER_HORSE_AGE_MONTHS`; ırk mağazası config'teki yaşı verir. */
  ageMonths?: number;
}

/**
 * Yeni bir oyuncuya verilen başlangıç atının başlangıç durumunu oluşturur.
 * 07.10.2026'dan beri ırk mağazasının atını da AYNI fabrika üretir (ırk ve
 * yaş girdidir) — iki ayrı "yeni at" yolu ayrışmasın diye.
 * `database/migrations/0002_create_tracks_and_horses.up.sql`'deki DEFAULT
 * değerlerle BİREBİR aynı vital sinyal başlangıç değerleri kullanılır
 * (health:100, fitness:50, fatigue:0, energy:100, morale:80) — bkz.
 * `domain/horse/vital-signs.ts` `VitalSigns`.
 */
export function createStarterHorse(input: NewStarterHorseInput): Horse {
  validateHorseName(input.name);

  const now = input.now ?? new Date();
  const birthDate = new Date(now);
  birthDate.setMonth(birthDate.getMonth() - (input.ageMonths ?? STARTER_HORSE_AGE_MONTHS));

  return {
    id: input.id,
    ownerId: input.ownerId,
    name: input.name.trim(),
    gender: input.gender,
    breed: input.breed.key,
    birthDate: birthDate.toISOString(),
    level: 1,
    xp: 0,
    quality: input.breed.quality,
    potential: input.breed.potential,
    health: 100,
    fitness: 50,
    fatigue: 0,
    energy: 100,
    morale: 80,
    weightKg: input.weightKg,
    status: 'active',
    sireId: null,
    damId: null,
    appearance: input.appearance,
    // 15.10.2026 — yaş bu andan itibaren hızlı akar (takvim yaşı = `ageMonths`).
    agingStartedAt: now.toISOString(),
    retiredAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
