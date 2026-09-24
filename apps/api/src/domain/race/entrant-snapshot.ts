import {
  clamp,
  type Horse,
  type HorseDistanceStats,
  type HorseStats,
  type HorseSurfaceStats,
  type RaceEntrantSnapshot,
  type RaceSurface,
  type RaceTacticInput,
  type RecentRaceResultView,
} from '@at-sevdalisi/shared-types';
import { computeDistanceCompatibility, computeSurfaceCompatibility } from './track-fit';
import { computeWeightCompatibility } from './carried-weight';
import { FINAL_STRETCH_PLANS, RACING_STYLES, RISK_LEVELS, START_APPROACHES } from './validation';
import { InvalidRaceTacticError } from './errors';

/**
 * `RaceEntrantSnapshot`'ın henüz gerçek veriyle bağlanmamış alanları için
 * nötr değer — `form`'un kendi tip yorumunda ZATEN tanımlanan "bilinmiyorsa
 * 50 kullan" ilkesiyle AYNI (bkz. `packages/shared-types/src/race.ts`).
 * `form` ARTIK bu listede DEĞİL — AUDIT_REPORT.md Bulgu R3 (proje
 * sahibinin "R3 — davranış derinliği" seçimiyle) kapsamında gerçek
 * `race_entries` geçmişinden türetilmeye başlandı, bkz. aşağıdaki
 * `deriveFormFromRecentResults`.
 *
 * **R3 — Track Fit (bu turda TAMAMLANDI):** `surfaceCompatibility`/
 * `distanceCompatibility` da ARTIK bu listede DEĞİL. `horse_surface_stats`/
 * `horse_distance_stats` tabloları (migration 0003) ZATEN vardı ve
 * `base-ability.ts`'in `trackCompatibility` formülü ZATEN bu iki alanı
 * tüketiyordu (bkz. o dosyanın doc yorumu) — eksik olan tek şey (a)
 * `PostgresHorseRepository.save()`'in bu iki tabloya da varsayılan satır
 * eklemesi (bkz. o dosyanın doc yorumu + migration 0026 backfill), (b) bu
 * satırları okuyup gerçek bir sayıya çeviren saf fonksiyonlardı
 * (`domain/race/track-fit.ts`'teki `computeSurfaceCompatibility`/
 * `computeDistanceCompatibility`). `jockeySkillComposite` HALA nötr:
 * Jockey sistemi (FAZ 2) henüz wiring edilmedi, pratik yarışta oyuncunun
 * kiralı bir jokeyi yok (`race_entries.jockey_id = NULL`, tıpkı gerçek DB
 * satırında olduğu gibi) — bu, Carried Weight'in jokey/handikap/ekipman
 * ağırlığı alt-faktörleriyle AYNI kategoride, gerçek bir jokey-atama
 * akışını (ve bir yarış-sınıfı/handikap sistemini) gerektiren, ayrı ve
 * daha büyük bir dilimi hak ediyor.
 *
 * **R4 — Carried Weight, SADECE at vücut ağırlığı alt-faktörü (bu turda
 * EKLENDİ):** `weightCompatibility` ARTIK bu listede DEĞİL (hiç
 * OLMADI — bkz. aşağıdaki `buildHorseEntrantSnapshot`). `Horse.weightKg`
 * (migration 0002) `createStarterHorse`/`breedHorses` tarafından ARTIK
 * gerçek, çeşitlilik gösteren bir değerle üretiliyor (bkz. `domain/horse/
 * weight.ts`, `domain/breeding/breeding.ts`) ve `database/migrations/
 * 0027_backfill_horse_weight_kg` mevcut atları da backfill etti — bu
 * yüzden `weightCompatibility` HİÇBİR ZAMAN "sahte" bir nötr değer
 * DEĞİLDİR (jokey/handikap/ekipman ağırlığı alt-faktörleri hâlâ kapsam
 * dışıdır, bkz. `domain/race/carried-weight.ts`'in doc yorumu).
 *
 * AUDIT_AND_HARDENING Öncelik 8'in (önceki oturum) "sessizce sonsuza kadar
 * nötr 50 varsayma" riskine (Mutlak Kural 4) karşı kurduğu ÜÇ KATMANLI
 * görünürlük hâlâ geçerli, `jockeySkillComposite` için:
 *  1. Kod: `UNMODELED_SNAPSHOT_FIELDS` — aşağıda, HANGİ alanların sahte
 *     olduğunu PROGRAMATİK olarak listeler; `entrant-snapshot.spec.ts`
 *     bu listenin ÜZERİNDE döngüyle test eder — biri gerçek veri
 *     bağlarken bu listeyi güncellemeyi UNUTURSA test KIRILIR ("tripwire").
 *  2. Veritabanı şeması: `database/migrations/0022_document_unwired_horse_
 *     compatibility_stats.up.sql` — migration 0026 ile `horse_surface_stats`/
 *     `horse_distance_stats` için ARTIK GEÇERSİZ (bkz. o migration'ın
 *     güncellenmiş `COMMENT ON TABLE` metni).
 *  3. Doküman: `docs/ROADMAP.md` (bkz. AUDIT_AND_HARDENING bölümü) —
 *     proje durumu her incelendiğinde bu KAYITLI sınırlama yeniden
 *     yüzeye çıkar, sessizce unutulmaz.
 */
export const NEUTRAL_UNMODELED_TRAIT_SCORE = 50;

/**
 * `RaceEntrantSnapshot`'ın, bu oturum itibarıyla HALA gerçek veriyle
 * BAĞLANMAMIŞ (`NEUTRAL_UNMODELED_TRAIT_SCORE` ile doldurulan) alanları.
 * `surfaceCompatibility`/`distanceCompatibility` ARTIK bu listede DEĞİL
 * (R3 — Track Fit, bu turda TAMAMLANDI) — bkz. bu dosyanın üstündeki doc
 * yorumu.
 */
export const UNMODELED_SNAPSHOT_FIELDS: ReadonlyArray<keyof RaceEntrantSnapshot> = ['jockeySkillComposite'];

/**
 * R3 — Track Fit (bu turda EKLENDİ). `buildHorseEntrantSnapshot`'a
 * OPSİYONEL olarak verilir (bkz. o fonksiyonun doc yorumu) — `recentResults`
 * parametresiyle AYNI "çağıran vermezse nötr kalır, GERİYE DÖNÜK UYUMLU"
 * deseni. `surface`/`distanceMeters` burada AYRICA taşınır çünkü
 * `HorseSurfaceStats`/`HorseDistanceStats`'ın KENDİSİ tek başına yeterli
 * DEĞİLDİR — hangi zemin/mesafeye göre değerlendirileceğini bilmek için
 * yarışın KENDİ `surface`/`distanceMeters`'ına da ihtiyaç vardır (bkz.
 * `track-fit.ts`'teki `computeSurfaceCompatibility`/
 * `computeDistanceCompatibility`).
 */
export interface TrackFitInput {
  surfaceStats: HorseSurfaceStats;
  distanceStats: HorseDistanceStats;
  surface: RaceSurface;
  distanceMeters: number;
}

/**
 * AUDIT_REPORT.md Bulgu R3 (Low, bu oturum) — `form` alanı artık bir
 * oyuncunun/botun atının SON `FORM_SAMPLE_SIZE` (5) sonuçlanmış
 * pratik-yarış/PvP maçının (`race_entries.performance_score`, bkz.
 * `RecentRaceResultView`) ORTALAMASI olarak hesaplanır — brief §17'nin
 * `w_form` ağırlığının artık GERÇEK bir sinyal taşıması için.
 *
 * **Neden basit ortalama (recency-ağırlıklı DEĞİL):** `performance_score`
 * zaten 0-100 ölçeğinde ve doğrudan karşılaştırılabilir (bkz.
 * `race-engine.ts`'in `performanceScore` hesaplaması) — daha karmaşık bir
 * üstel/recency-ağırlıklı ortalama, T3b'nin (bu oturum) öğrettiği "motor
 * mekanikleri doğrusal/simetrik tepki vermeyebilir" dersine göre push
 * ÖNCESİ ampirik doğrulama gerektirirdi; basit ortalama hem tahmin
 * edilebilir hem de `docs/ALGORITHMS.md §2`'nin `w_form: 0.03` gibi zaten
 * KÜÇÜK bir ağırlık verdiği bir sinyal için yeterli hassasiyette.
 *
 * **Neden `race_entries` GEÇMİŞİ yoksa nötr 50 (asla 0/boş DEĞİL):** Yeni
 * doğan/hiç yarışmamış bir at "formsuz" (kötü) SAYILAMAZ — `NEUTRAL_
 * UNMODELED_TRAIT_SCORE` ile AYNI "bilinmiyorsa tarafsız" ilkesi (bkz.
 * `RaceEntrantSnapshot.form` tip yorumu) burada da korunur.
 *
 * Botlar (`bot-generator.ts`) bu fonksiyonu HİÇ ÇAĞIRMAZ — botların
 * kalıcı bir `horses` satırı/geçmişi yok, `NEUTRAL_UNMODELED_TRAIT_SCORE`
 * ile sabit kalmaya devam ederler (bilinçli, değişmedi).
 */
export const FORM_SAMPLE_SIZE = 5;

export function deriveFormFromRecentResults(recentResults: readonly RecentRaceResultView[]): number {
  if (recentResults.length === 0) {
    return NEUTRAL_UNMODELED_TRAIT_SCORE;
  }
  const sample = recentResults.slice(0, FORM_SAMPLE_SIZE);
  const average = sample.reduce((sum, result) => sum + result.performanceScore, 0) / sample.length;
  return clamp(Math.round(average), 0, 100);
}

/**
 * FAZ 1 wiring, sekizinci dilim — DTO'nun `@IsIn(...)` kontrolü atlanabilir
 * ihtimaline karşı domain katmanı taktik alanlarını BAĞIMSIZ olarak da
 * doğrular (bkz. `errors.ts` üstündeki not — burada bir çökme riski değil,
 * veri bütünlüğü gerekçesi vardır).
 */
export function assertValidRaceTactic(tactic: RaceTacticInput): void {
  if (!RACING_STYLES.includes(tactic.racingStyle)) {
    throw new InvalidRaceTacticError(`Geçersiz yarış stili: "${String(tactic.racingStyle)}".`);
  }
  if (!RISK_LEVELS.includes(tactic.riskLevel)) {
    throw new InvalidRaceTacticError(`Geçersiz risk seviyesi: "${String(tactic.riskLevel)}".`);
  }
  if (!START_APPROACHES.includes(tactic.startApproach)) {
    throw new InvalidRaceTacticError(`Geçersiz start yaklaşımı: "${String(tactic.startApproach)}".`);
  }
  if (!FINAL_STRETCH_PLANS.includes(tactic.finalStretchPlan)) {
    throw new InvalidRaceTacticError(`Geçersiz final düzlük planı: "${String(tactic.finalStretchPlan)}".`);
  }
}

/**
 * Bir oyuncunun atını, Race Engine'in (`domain/race/race-engine.ts`)
 * beklediği donmuş `RaceEntrantSnapshot`'a çevirir. `Horse`/`HorseStats`
 * zaten gerçek veritabanına bağlı (At + Antrenman dilimleri) — burada
 * yeni olan yalnızca bu İKİ aggregate'i TEK bir snapshot'ta birleştirmek
 * ve henüz modellenmemiş alanları nötr değerle doldurmak.
 *
 * AUDIT_REPORT.md Bulgu R3 (önceki oturum) — `recentResults` OPSİYONEL bir
 * parametredir (çağıran vermezse `[]`, yani `form` nötr 50 kalır — GERİYE
 * DÖNÜK UYUMLU): çağıran use-case, bu saf/domain fonksiyonunu çağırmadan
 * ÖNCE `raceRepository.findRecentResultsByHorseId`'den (async, DB) elde
 * ettiği listeyi buraya iletir — bu fonksiyonun KENDİSİ hâlâ saf kalır,
 * hiçbir I/O yapmaz (bkz. `deriveFormFromRecentResults`).
 *
 * R3 — Track Fit (bu turda EKLENDİ) — `trackFit` de AYNI "OPSİYONEL,
 * verilmezse nötr" desenini izler: `null`/verilmemişse (ör. `horse_
 * surface_stats`/`horse_distance_stats` satırı henüz olmayan — migration
 * 0026 ÖNCESİ oluşturulmuş, backfill'den KAÇAN teorik bir at, ya da bot)
 * `surfaceCompatibility`/`distanceCompatibility` `NEUTRAL_UNMODELED_
 * TRAIT_SCORE` (50) kalır — bu, TAM OLARAK bu alanın Track Fit'ten ÖNCEKİ
 * davranışıdır, yani geriye dönük UYUMLUDUR. Botlar (`bot-generator.ts`)
 * bu parametreyi HİÇ VERMEZ (`recentResults` ile AYNI gerekçe: botların
 * kalıcı bir `horses` satırı yok).
 */
export function buildHorseEntrantSnapshot(
  horse: Horse,
  stats: HorseStats,
  tactic: RaceTacticInput,
  recentResults: readonly RecentRaceResultView[] = [],
  trackFit: TrackFitInput | null = null,
): RaceEntrantSnapshot {
  assertValidRaceTactic(tactic);

  return {
    horseId: horse.id,
    speed: stats.speed,
    stamina: stats.stamina,
    acceleration: stats.acceleration,
    fitness: horse.fitness,
    fatigue: horse.fatigue,
    health: horse.health,
    morale: horse.morale,
    surfaceCompatibility:
      trackFit === null ? NEUTRAL_UNMODELED_TRAIT_SCORE : computeSurfaceCompatibility(trackFit.surfaceStats, trackFit.surface),
    distanceCompatibility:
      trackFit === null ? NEUTRAL_UNMODELED_TRAIT_SCORE : computeDistanceCompatibility(trackFit.distanceStats, trackFit.distanceMeters),
    jockeySkillComposite: NEUTRAL_UNMODELED_TRAIT_SCORE,
    form: deriveFormFromRecentResults(recentResults),
    // R4 — Carried Weight (bu turda EKLENDİ). YENİ bir repository/DB
    // sorgusu GEREKMEZ: `horse.weightKg` `Horse` aggregate'inde ZATEN
    // mevcuttur (bkz. `carried-weight.ts`'in doc yorumu — jokey/handikap/
    // ekipman ağırlığı BİLİNÇLİ olarak kapsam dışı).
    weightCompatibility: computeWeightCompatibility(horse.weightKg),
    tactic,
  };
}
