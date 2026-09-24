/**
 * Carried Weight — At Vücut Ağırlığı Uyumluluğu (hardening-realism-master-plan.md §26).
 *
 * KAPSAM (bilinçli, dikkatle sınırlı — bkz. proje geçmişindeki "Carried
 * Weight kendi kararımla scoplanamaz" araştırması): Master Plan §26,
 * Carried Weight'i DÖRT alt-faktöre ayırır — "horse body weight, jockey
 * weight, assigned weight, equipment weight". Bu dosya SADECE bunlardan
 * BİRİNCİSİNİ (at vücut ağırlığı, `horses.weight_kg` — migration 0002,
 * `domain/horse/weight.ts`'te ARTIK gerçek bir değerle üretiliyor) modeller.
 * Diğer ÜÇÜ BİLİNÇLİ olarak kapsam dışıdır:
 *   - jockey weight: projede bir jokey-ATAMA akışı yok (pratik yarışta
 *     `race_entries.jockey_id` her zaman NULL — bkz.
 *     `entrant-snapshot.ts`'teki `jockeySkillComposite` doc yorumu, AYNI
 *     kategoride, ayrı ve daha büyük bir dilim).
 *   - assigned/handikap weight: projede bir yarış SINIFI/handikap reytingi
 *     sistemi YOK — bu ağırlığın dayanacağı bir mekanizma hiç var olmadığı
 *     için modellemesi YENİ BİR ÖZELLİK icat etmek olurdu.
 *   - equipment weight: projede ekipman/gear envanteri kavramı YOK.
 * Bu üçünü tek bir sayıda "tahmin ederek" birleştirmek YENİ bir denge
 * kararı (ve sahte veri) olurdu — bu yüzden `computeWeightCompatibility`
 * yalnızca gerçek, veritabanında var olan `weight_kg` girdisini kullanır.
 *
 * `track-fit.ts` ile AYNI desen: bu dosya hiçbir I/O yapmaz, hiçbir DB/
 * NestJS bağımlılığı içermez — `apps/api/tsconfig.domain.json` ile gerçek
 * `tsc --noEmit` ile doğrulanabilir.
 */

/**
 * `weightKg` bilinmiyorsa (`null` — ör. `database/migrations/0027_backfill_
 * horse_weight_kg`'dan ÖNCE oluşturulmuş teorik bir at, ya da bot —
 * `bot-generator.ts` bu fonksiyonu HİÇ ÇAĞIRMAZ, doğrudan bu sabitle AYNI
 * nötr değeri kullanır) döndürülen nötr puan — `entrant-snapshot.ts`'teki
 * `NEUTRAL_UNMODELED_TRAIT_SCORE` (50) ile AYNI değer, döngüsel import'tan
 * kaçınmak için (o dosya BU dosyayı çağırır) burada BAĞIMSIZ, kendi
 * sabiti olarak tutulur — `track-fit.ts`'teki `SYNTHETIC_SURFACE_NEUTRAL_
 * SCORE` ile AYNI gerekçe.
 */
const WEIGHT_DATA_MISSING_NEUTRAL_SCORE = 50;

/** İdeal aralığın merkezi (kg) — `domain/horse/weight.ts`'teki nüfus ortalamasıyla AYNI (`HORSE_WEIGHT_POPULATION_MEAN_KG`). */
const IDEAL_CENTER_KG = 495;

/** İdeal aralığın yarı genişliği (kg) — ideal aralık [470, 520]'dir. */
const IDEAL_HALF_WIDTH_KG = 25;

/** Merkezde (495kg) ulaşılan en yüksek puan. */
const PEAK_SCORE = 100;

/** İdeal aralığın kenarlarında (470/520kg) ulaşılan puan. */
const IDEAL_EDGE_SCORE = 95;

/**
 * Puanın asla ULAŞAMAYACAĞI (yalnızca asimptotik olarak yaklaşacağı) bir
 * taban değer — aşırı ağır/hafif bir at bile "yarışamaz" (0'a yakın)
 * duruma DÜŞÜRÜLMEZ, yalnızca dezavantajlı sayılır. `track-fit.ts`'teki
 * "sert bir eşiğe/0'a asla düşme, her zaman nötr/ölçülü bir davranış"
 * ilkesinin (bkz. `computeSurfaceCompatibility`'nin `synthetic` dalı) bu
 * dosyadaki karşılığı.
 *
 * **Kalibrasyon notu (T3b ile AYNI ampirik yöntem, bkz. `race-engine-
 * field-balance.spec.ts`'in dosya başı doc yorumu):** İLK taslakta bu
 * değer `20` idi ("örn. 20" — keyfi bir başlangıç varsayımı). GERÇEK
 * `simulateRace` motoruna karşı 250+ denemeli bir Monte Carlo testiyle
 * (bu turda, push ÖNCESİ `tsx` ile) ölçüldüğünde, bu `20`'lik taban
 * (`FALLOFF_DECAY_KG: 40` ile birlikte) 430/580kg gibi gerçekçi UÇ
 * ağırlıklardaki atların galibiyet payını ~%3-4'e (yani PRATİKTE yapısal
 * olarak ölü) düşürdüğü GÖZLEMLENDİ — `baseAbility`'ye eklenen puan farkı
 * KÜÇÜK (`weights.carriedWeight: 0.05`) olsa bile, HER segmentte sabit
 * olarak tekrar eklendiğinden (bkz. `race-engine.ts`'in `baseAbility`
 * kullanımı) 8 segment boyunca BİRİKTİĞİ ve rastgele gürültünün
 * ortalamada baskılandığı için bu küçük fark bile son derece belirleyici
 * hale geldiği ortaya çıktı — brief'in "küçük ve kontrollü etki" isteğine
 * AYKIRI bir sonuçtu. Taban `90`'a (ve sönümleme `120`'ye) YÜKSELTİLEREK
 * yeniden ölçüldü: aynı 250+ denemeli testte uç ağırlıklı atların
 * galibiyet payı ~%35-40'a (yapısal olarak ne ölü ne baskın) oturdu —
 * GERÇEKTEN "küçük ve kontrollü" bir etki. Bu YENİ taban, TEORİK bir
 * tahminden değil, T3b'nin öğrettiği "motor mekanikleri doğrusal/simetrik
 * tepki vermeyebilir" dersine göre GERÇEK motora karşı yapılan ampirik bir
 * ölçümden seçildi.
 */
const FLOOR_SCORE = 90;

/**
 * İdeal aralığın DIŞINDA, puanın `FLOOR_SCORE`'a ne kadar HIZLI yaklaştığını
 * kontrol eden üstel sönümleme sabiti (kg). Büyük bir değer = daha YAVAŞ
 * düşüş (daha toleranslı); küçük bir değer = daha HIZLI düşüş. `FLOOR_SCORE`
 * ile AYNI ampirik kalibrasyon turunda `40`'tan `120`'ye yükseltildi (bkz.
 * `FLOOR_SCORE`'un doc yorumu).
 */
const FALLOFF_DECAY_KG = 120;

/**
 * Bir atın vücut ağırlığını (`Horse.weightKg`), belirli bir yarış için TEK
 * bir uyumluluk puanına (0-100) indirger. `computeSurfaceCompatibility`/
 * `computeDistanceCompatibility` (`track-fit.ts`) ile AYNI şekil: saf,
 * girdisi/çıktısı basit, framework'ten bağımsız.
 *
 * Formül (bilinçli tasarım kararı — brief'te sayısal bir formül
 * VERİLMEMİŞTİR, yalnızca "acceleration/stamina consumption/final speed
 * üzerinden küçük ve kontrollü etki" istenir; `race.config.json`'daki
 * `carriedWeight` ağırlığının (0.05) zaten KÜÇÜK olması bu "kontrollü etki"
 * isteğini `base-ability.ts` seviyesinde ayrıca sağlar):
 *   - İdeal aralık [470, 520] kg (merkez 495) içinde: `PEAK_SCORE`'dan
 *     (100, merkezde) `IDEAL_EDGE_SCORE`'a (95, kenarlarda) DOĞRUSAL düşüş.
 *   - İdeal aralığın DIŞINDA (SİMETRİK, hem ağır hem hafif yönde):
 *     `IDEAL_EDGE_SCORE`'dan `FLOOR_SCORE`'a (90) doğru ÜSTEL sönümleme —
 *     asla `FLOOR_SCORE`'a tam ULAŞMAZ (yalnızca yaklaşır), yani hiçbir
 *     ağırlık değeri atı "yarışamaz" hale getirmez, yalnızca (küçük ve
 *     kontrollü ölçüde) dezavantajlı sayar. `FLOOR_SCORE`'un kendi doc
 *     yorumu, bu değerin `20` DEĞİL `90` olmasının GERÇEK motora karşı
 *     ampirik olarak ölçülmüş gerekçesini açıklar.
 */
export function computeWeightCompatibility(weightKg: number | null): number {
  if (weightKg === null) {
    return WEIGHT_DATA_MISSING_NEUTRAL_SCORE;
  }

  const distanceFromCenterKg = Math.abs(weightKg - IDEAL_CENTER_KG);

  if (distanceFromCenterKg <= IDEAL_HALF_WIDTH_KG) {
    const interiorFraction = distanceFromCenterKg / IDEAL_HALF_WIDTH_KG;
    return PEAK_SCORE - interiorFraction * (PEAK_SCORE - IDEAL_EDGE_SCORE);
  }

  const excessKg = distanceFromCenterKg - IDEAL_HALF_WIDTH_KG;
  return FLOOR_SCORE + (IDEAL_EDGE_SCORE - FLOOR_SCORE) * Math.exp(-excessKg / FALLOFF_DECAY_KG);
}
