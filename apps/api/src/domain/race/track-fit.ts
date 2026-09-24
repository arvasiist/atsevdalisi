import type { HorseDistanceStats, HorseSurfaceStats, RaceSurface } from '@at-sevdalisi/shared-types';

/**
 * R3 (davranış hattı) — Track Fit / Zemin-Mesafe Uyumu.
 *
 * `entrant-snapshot.ts`'in `UNMODELED_SNAPSHOT_FIELDS` doc yorumunda
 * BULUNAN ama o dilimde bilinçli olarak KAPSAM DIŞI bırakılan iki alanın
 * (`surfaceCompatibility`/`distanceCompatibility`) GERÇEK hesaplamasını
 * içerir. Draw (`gate-assignment.ts`) ve Current Form
 * (`deriveFormFromRecentResults`) ile AYNI desen: `horse_surface_stats`/
 * `horse_distance_stats` (migration 0003) şeması ZATEN vardı, tüketen
 * formül (`base-ability.ts`'teki `trackCompatibility = (surfaceCompatibility
 * + distanceCompatibility) / 2`) ZATEN vardı — eksik olan tek şey bu iki
 * tabloyu okuyup gerçek bir sayıya çeviren SAF bir fonksiyondu.
 *
 * `race-engine.ts` ile AYNI "saf mantığı ayır" ilkesi: bu dosya hiçbir
 * I/O yapmaz, hiçbir DB/NestJS bağımlılığı içermez — bu yüzden
 * `apps/api/tsconfig.domain.json` (`src/domain/**\/*.ts` içeriyor) ile
 * BU SANDBOX'TA GERÇEK `tsc --noEmit` ile doğrulanabilir (framework'e
 * bağımlı dosyaların aksine, bkz. `race.gateway.ts`'teki CI #134 dersi).
 */

/**
 * `RaceSurface` ('grass' | 'dirt' | 'synthetic') içindeki 'synthetic'
 * değeri için `horse_surface_stats` şemasında (migration 0003, brief §7)
 * HİÇBİR karşılık sütun YOK — yalnızca grass/dirt/wet/heavy/dry/mud var.
 * Bugün itibarıyla codebase'de HİÇBİR gerçek yarış yolu 'synthetic'
 * KULLANMIYOR (`PRACTICE_RACE_SURFACE`/`PVP_MATCH_SURFACE` ikisi de sabit
 * `'grass'` — bkz. `run-practice-race.use-case.ts`/`join-matchmaking-
 * queue.use-case.ts`), yani bu dal bugün ÇALIŞMA ZAMANINDA hiç
 * tetiklenmiyor. Yine de `RaceSurface` union'ı TypeScript'i exhaustive
 * bir switch'e zorladığı için (gelecekte sentetik pist eklenirse
 * ÇÖKMEDEN nötr davranması için) burada AÇIKÇA ele alınır. Değer,
 * `entrant-snapshot.ts`'teki `NEUTRAL_UNMODELED_TRAIT_SCORE` (50) ile
 * AYNI — döngüsel import'tan kaçınmak için (o dosya BU dosyayı çağırır)
 * burada BAĞIMSIZ, kendi sabiti olarak tutulur.
 */
const SYNTHETIC_SURFACE_NEUTRAL_SCORE = 50;

/**
 * Mesafe kategorisi eşikleri. brief §62 "Short/Middle/Long" kategorik
 * ayrımını verir ama SAYISAL bir sınır belirtmez (yalnızca 800-2400m
 * arası örnek mesafeler listeler). Gerçek at yarışçılığı geleneğiyle
 * uyumlu (kısa/sprint ≲1400m, orta/"mil" 1400-2000m, uzun >2000m) VE
 * projedeki TEK gerçek mesafeyi (1600m — `PRACTICE_RACE_DISTANCE_METERS`,
 * hem Pratik Yarış hem PvP tarafından kullanılıyor, bkz. `validation.ts`)
 * bilinçli olarak "Middle" (klasik mil yarışı) kategorisine düşürecek
 * şekilde seçildi.
 */
export const SHORT_DISTANCE_MAX_METERS = 1400;
export const MIDDLE_DISTANCE_MAX_METERS = 2000;

/**
 * Bir atın `HorseSurfaceStats`'ını, belirli bir yarışın zeminine göre TEK
 * bir uyum puanına (0-100) indirger. `wet`/`heavy`/`dry`/`mud` sütunları
 * (pist KOŞULU — hava durumuna bağlı, bkz. `environment.ts`'teki
 * `getEnvironmentModifier`'ın `surfaceCondition` türetimi) BİLİNÇLİ olarak
 * bu hesaplamaya DAHIL EDİLMEDİ: `trackCompatibility` Race Engine'de TEK
 * bir skaler terim (bkz. `base-ability.ts`), ve pist koşulunun etkisi
 * zaten AYRI bir mekanizmayla (`getEnvironmentModifier`'ın
 * `surfaceModifier`'ı, TÜM atlara eşit uygulanan bir çevresel çarpan
 * olarak) motora giriyor. İkisini TEK bir sayıda birleştirmek (örn.
 * ağırlıklı ortalama) YENİ bir denge kararı olurdu — bu, Track Fit'in
 * "en küçük/en izole R3 dilimi" olarak seçilmesinin gerekçesini bozardı
 * (bkz. proje durumu dokümanı). Bu yüzden yalnızca temel zemin TÜRÜ
 * (grass/dirt) kullanılır; wet/heavy/dry/mud alanları şemada/tipte
 * KALIR ama bilinçli olarak KAPSAM DIŞI bırakılır (gelecekte "pist
 * koşulu uyumu" ayrı bir dilim olarak ele alınabilir).
 */
export function computeSurfaceCompatibility(stats: HorseSurfaceStats, surface: RaceSurface): number {
  switch (surface) {
    case 'grass':
      return stats.grass;
    case 'dirt':
      return stats.dirt;
    case 'synthetic':
      return SYNTHETIC_SURFACE_NEUTRAL_SCORE;
  }
}

/**
 * Bir atın `HorseDistanceStats`'ını, belirli bir yarış mesafesine göre
 * TEK bir uyum puanına (0-100) indirger. Sınırlar dahil/hariç seçimi:
 * `SHORT_DISTANCE_MAX_METERS`'a EŞİT bir mesafe "Middle" sayılır (ör. tam
 * 1400m bir sprint DEĞİL, orta mesafenin alt ucudur); `MIDDLE_DISTANCE_
 * MAX_METERS`'a EŞİT bir mesafe (ör. tam 2000m) hâlâ "Middle" sayılır,
 * yalnızca bunu AŞAN mesafeler "Long" olur.
 */
export function computeDistanceCompatibility(stats: HorseDistanceStats, distanceMeters: number): number {
  if (distanceMeters < SHORT_DISTANCE_MAX_METERS) {
    return stats.shortDistance;
  }
  if (distanceMeters <= MIDDLE_DISTANCE_MAX_METERS) {
    return stats.middleDistance;
  }
  return stats.longDistance;
}
