import { clamp, type Horse, type HorseStats, type RaceEntrantSnapshot, type RaceTacticInput, type RecentRaceResultView } from '@at-sevdalisi/shared-types';
import { FINAL_STRETCH_PLANS, RACING_STYLES, RISK_LEVELS, START_APPROACHES } from './validation';
import { InvalidRaceTacticError } from './errors';

/**
 * `RaceEntrantSnapshot`'ın `surfaceCompatibility`/`distanceCompatibility`/
 * `jockeySkillComposite` alanları için nötr değer — `form`'un kendi tip
 * yorumunda ZATEN tanımlanan "bilinmiyorsa 50 kullan" ilkesiyle AYNI
 * (bkz. `packages/shared-types/src/race.ts`). `form` ARTIK bu listede
 * DEĞİL — AUDIT_REPORT.md Bulgu R3 (bu oturum, proje sahibinin "R3 —
 * davranış derinliği" seçimiyle) kapsamında gerçek `race_entries`
 * geçmişinden türetilmeye başlandı, bkz. aşağıdaki `deriveFormFromRecentResults`.
 *
 * **BULUNAN ama bu dilimde KAPSAM DIŞI bırakılan bir eksik:**
 * `horse_surface_stats`/`horse_distance_stats` tabloları (migration 0003)
 * TAM OLARAK bu iki alan için mevcut — ama `PostgresHorseRepository.save()`
 * bunlara HİÇBİR ZAMAN varsayılan satır eklemedi (`horse_stats`/`horse_health`'in
 * AKSİNE), bu yüzden hiçbir at için satırları yok. Bunları gerçek anlamda
 * bağlamak (save()'i güncellemek + yeni repository + brief §8.2'nin
 * "keşif hissi" gerektiren scout mekanizması) kendi başına bir dilimi hak
 * ediyor — burada aceleyle yapılmadı. `jockeySkillComposite` de aynı
 * gerekçeyle nötr: Jockey sistemi (FAZ 2) henüz wiring edilmedi, bu
 * pratik yarışta oyuncunun kiralı bir jokeyi yok (`race_entries.jockey_id
 * = NULL`, tıpkı gerçek DB satırında olduğu gibi).
 *
 * AUDIT_AND_HARDENING Öncelik 8 (bu oturum) — denetim bu gapı "sessizce
 * sonsuza kadar nötr 50 varsayma" riski olarak işaretledi (Mutlak Kural 4:
 * bir risk asla sessizce kabul edilemez, ya düzeltilir ya da AÇIKÇA
 * belgelenip bir telafi edici kontrol eklenir). Tam scout/keşif mekaniğini
 * kurmak (brief §34) burada YENİ BİR ÖZELLİK olurdu — bu bir sertleştirme
 * oturumu, KAPSAM DIŞI. Bunun yerine gap ÜÇ KATMANDA da AÇIKÇA GÖRÜNÜR
 * kılınır (kod yorumu YETERLİ DEĞİLDİR, sadece kaynağı okuyan bir
 * geliştiriciye görünür):
 *  1. Kod: `UNMODELED_SNAPSHOT_FIELDS` — aşağıda, HANGİ alanların sahte
 *     olduğunu PROGRAMATİK olarak listeler; `entrant-snapshot.spec.ts`
 *     bu listenin ÜZERİNDE döngüyle test eder — biri gerçek veri
 *     bağlarken bu listeyi güncellemeyi UNUTURSA test KIRILIR ("tripwire").
 *  2. Veritabanı şeması: `database/migrations/0022_document_unwired_horse_
 *     compatibility_stats.up.sql` — `horse_surface_stats`/`horse_distance_
 *     stats` tablolarına `COMMENT ON TABLE` ile AÇIKÇA "hiçbir satır asla
 *     yazılmaz" notu ekler; bir DBA/denetçi kaynak koduna hiç bakmadan,
 *     doğrudan şemayı inceleyerek (`\d+ horse_surface_stats`) bunu görür.
 *  3. Doküman: `docs/ROADMAP.md` (bkz. AUDIT_AND_HARDENING bölümü) —
 *     proje durumu her incelendiğinde bu KAYITLI sınırlama yeniden
 *     yüzeye çıkar, sessizce unutulmaz.
 */
export const NEUTRAL_UNMODELED_TRAIT_SCORE = 50;

/**
 * `RaceEntrantSnapshot`'ın, bu oturum itibarıyla HALA gerçek veriyle
 * BAĞLANMAMIŞ (`NEUTRAL_UNMODELED_TRAIT_SCORE` ile doldurulan) alanları.
 * Bkz. bu dosyanın üstündeki AUDIT_AND_HARDENING Öncelik 8 doc yorumu.
 */
export const UNMODELED_SNAPSHOT_FIELDS: ReadonlyArray<keyof RaceEntrantSnapshot> = [
  'surfaceCompatibility',
  'distanceCompatibility',
  'jockeySkillComposite',
];

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
 * AUDIT_REPORT.md Bulgu R3 (bu oturum) — `recentResults` YENİ, OPSİYONEL
 * bir parametredir (çağıran vermezse `[]`, yani `form` nötr 50 kalır —
 * GERİYE DÖNÜK UYUMLU): çağıran use-case, bu saf/domain fonksiyonunu
 * çağırmadan ÖNCE `raceRepository.findRecentResultsByHorseId`'den (async,
 * DB) elde ettiği listeyi buraya iletir — bu fonksiyonun KENDİSİ hâlâ
 * saf kalır, hiçbir I/O yapmaz (bkz. `deriveFormFromRecentResults`).
 */
export function buildHorseEntrantSnapshot(
  horse: Horse,
  stats: HorseStats,
  tactic: RaceTacticInput,
  recentResults: readonly RecentRaceResultView[] = [],
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
    surfaceCompatibility: NEUTRAL_UNMODELED_TRAIT_SCORE,
    distanceCompatibility: NEUTRAL_UNMODELED_TRAIT_SCORE,
    jockeySkillComposite: NEUTRAL_UNMODELED_TRAIT_SCORE,
    form: deriveFormFromRecentResults(recentResults),
    tactic,
  };
}
