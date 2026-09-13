import type { Horse, PublicHorse } from '@at-sevdalisi/shared-types';

/**
 * AUDIT_AND_HARDENING Öncelik 5 (bu oturum) — docs/SECURITY.md §9'un
 * "Bu kural apps/api/src/api/dto katmanında [...] uygulanır" iddiasının
 * GERÇEKTEN karşılığı — bu dizin/dosya bu oturumdan ÖNCE hiç yoktu, bkz.
 * `PublicHorse` doc yorumu (shared-types) ve `horse.controller.ts`.
 *
 * Bant genişliği (10 puan, ondalık dilim): brief §34'teki İLK (henüz scout
 * tutulmamış/temel) örnek "78-84"/"85-92" ile aynı büyüklük mertebesinde,
 * sabit ve KOLAY DOĞRULANABİLİR bir taban. Bilhassa SİMETRİK bir bant
 * (ör. `[potential-7, potential+7]`) BİLEREK KULLANILMAZ: simetrik bir
 * bantta `(min+max)/2` HER ZAMAN ham `potential`in KENDİSİNE eşit olur —
 * yani aralık görünse de basit bir aritmetik ham değeri anında geri verir.
 * Ondalık dilimleme (`floor(potential/10)*10`) bu sızıntıyı ENGELLER:
 * dilim içindeki 10 farklı gerçek değer (ör. 80-89) AYNI `[80, 89]`
 * aralığını üretir, dilimin kendisinden ham değer YENİDEN TÜRETİLEMEZ.
 *
 * `potential === 100` özel durumu: dilim `[100, 109]` olur ama üst sınır
 * [0,100] aralığına kırpılır, sonuç `[100, 100]` — tek bir olası değer
 * kalır (100 zaten skalanın TAVANI olduğu için, "en azından 100" demek
 * zaten "tam olarak 100" demektir). Bu, bir SIZINTI değil, skalanın kendi
 * sınırının kaçınılmaz bir sonucudur.
 */
const POTENTIAL_ESTIMATE_BAND_SIZE = 10;

export function estimatePotentialRange(potential: number): { min: number; max: number } {
  const bandStart = Math.floor(potential / POTENTIAL_ESTIMATE_BAND_SIZE) * POTENTIAL_ESTIMATE_BAND_SIZE;
  return {
    min: Math.max(0, bandStart),
    max: Math.min(100, bandStart + POTENTIAL_ESTIMATE_BAND_SIZE - 1),
  };
}

/**
 * `Horse` (Domain/Application katmanlarının iç görünümü, ham `potential`
 * DAHİL) → `PublicHorse` (API'nin dışa açtığı görünüm). `HorseController`
 * DIŞINDA hiçbir yerde çağrılmamalıdır — Application katmanı `Horse`
 * döndürmeye devam eder (docs/ARCHITECTURE.md §4: gizlilik kuralı bir
 * SUNUM/API kaygısıdır, Domain/Application'ın kendi iç modelini
 * KISITLAMAMALIDIR — ör. `RunPracticeRaceUseCase` gerçek `potential`'a
 * ihtiyaç duyabilir).
 */
export function toPublicHorse(horse: Horse): PublicHorse {
  const { potential, ...visibleFields } = horse;
  return {
    ...visibleFields,
    potentialEstimate: estimatePotentialRange(potential),
  };
}
