import type { Horse, HorseStats, RaceEntrantSnapshot, RaceTacticInput } from '@at-sevdalisi/shared-types';
import { FINAL_STRETCH_PLANS, RACING_STYLES, RISK_LEVELS, START_APPROACHES } from './validation';
import { InvalidRaceTacticError } from './errors';

/**
 * `RaceEntrantSnapshot`'ın `surfaceCompatibility`/`distanceCompatibility`/
 * `jockeySkillComposite`/`form` alanları için nötr değer — `form`'un
 * kendi tip yorumunda ZATEN tanımlanan "bilinmiyorsa 50 kullan" ilkesiyle
 * AYNI (bkz. `packages/shared-types/src/race.ts`).
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
  'form',
];

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
 */
export function buildHorseEntrantSnapshot(horse: Horse, stats: HorseStats, tactic: RaceTacticInput): RaceEntrantSnapshot {
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
    form: NEUTRAL_UNMODELED_TRAIT_SCORE,
    tactic,
  };
}
