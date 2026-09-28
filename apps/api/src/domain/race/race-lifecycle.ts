import type { RaceStatus } from '@at-sevdalisi/shared-types';
import { InvalidRaceTransitionError } from './errors';

/**
 * `domain/race/race-lifecycle.ts` — YARIŞIN DURUM MAKİNESİ (brief §42
 * PHASE 1, 28.09.2026).
 *
 * Framework'süz saf TS'tir (CLAUDE.md kural 4) ve bu yüzden Vitest/esbuild
 * altında GERÇEKTEN koşar — DTO dekoratörlerinin aksine (CLAUDE.md kural 5
 * "Kardeş tuzak": `@IsIn` esbuild altında sessizce atlanır).
 *
 * ## Bu dosya neyi ÇÖZER
 *
 * `races.status` yazan ÜÇ yol vardı ve her biri kendi kuralını kendi
 * içinde taşıyordu:
 *
 *  - `postgres-race.repository.ts` → `settleLobbyRace` (`scheduled → finished`)
 *  - `postgres-admin.repository.ts` → `cancelRaceWithLock` (`scheduled → cancelled`)
 *  - `race-lock.use-case.ts` + repository → kilit (`scheduled → locking`, YENİ)
 *
 * Kurallar tek tek doğruydu ama ARALARINDAKİ tutarlılığı söyleyen bir yer
 * yoktu: "hangi geçiş meşrudur" sorusunun cevabı üç dosyaya dağılmıştı ve
 * yeni bir durum eklendiğinde (bu dilimde `locking` eklendi) hiçbir
 * derleyici uyarısı çıkmıyordu. Bu dosya o cevabı TEK bir tabloya taşır.
 *
 * ## `scheduled → finished` NEDEN HÂLÂ MEŞRU
 *
 * Zamanlayıcı (scheduler) bir YETENEKTİR, bir ZORUNLULUK değil: süreç
 * kapalıyken `startTime`'ı geçen bir yarış kilitlenemez ve `POST
 * /races/:id/settle` "crank"i onu doğrudan koşmalıdır (§13.14). Bu yolu
 * kapatmak, zamanlayıcı hiç çalışmadığında ödenen ücretleri havuzda
 * KALICI olarak kilitlerdi. Aradaki fark şudur: kilit yolundan geçen bir
 * yarışta snapshot `startTime` ANINDA donar (adil), doğrudan koşulan
 * yarışta ise koşma anında alınır (eski davranış, `settle-race.use-case.ts`
 * doc yorumundaki açık pencere).
 *
 * ## `locking → cancelled` NEDEN MEŞRU
 *
 * Bir yarış `locking`te (kadro donmuş, seed üretilmiş, henüz koşmamış)
 * takılı kalabilir: süreç kilit anında çökerse, ya da kesinleştirme hiç
 * çağrılmazsa. `cancelled` bu durumda TEK meşru çıkıştır — kapatılsaydı
 * havuz kalıcı olarak kilitlenirdi (brief §34 "Cancel" tam olarak bunun
 * için vardır). `finished`ten farkı şudur: ödül HENÜZ dağıtılmamıştır,
 * dolayısıyla iade doğru tutarı bulur.
 *
 * ## AYNI DURUMA GEÇİŞ YASAKTIR
 *
 * `scheduled → scheduled` gibi bir geçiş "hiçbir şey yapmadım" demenin
 * yanıltıcı hâlidir ve iki eşzamanlı çağrının ikisinin de "başardım"
 * dönmesine izin verirdi. `REPORT_STATUS_TRANSITIONS`in (§13.17) aynı
 * kuralıdır: bayat bir istemci göstergesini meşrulaştırmamak için.
 */

/** `races.status` CHECK'i (migration 0006 + 0042) ile BİREBİR aynı liste. */
export const RACE_STATUSES = ['scheduled', 'locking', 'in_progress', 'finished', 'cancelled'] as const;

/**
 * Durum → izin verilen SONRAKİ durumlar.
 *
 * `Record<RaceStatus, ...>` olarak yazılması BİLİNÇLİDİR: `RaceStatus`'a
 * yeni bir değer eklenip buranın unutulması `tsc`yi KIRAR
 * (`REFUSAL_BY_STATUS`in ve `REPORT_STATUS_TRANSITIONS`in kapalı-çizge
 * disipliniyle AYNI).
 */
export const RACE_LIFECYCLE_TRANSITIONS: Record<RaceStatus, readonly RaceStatus[]> = {
  scheduled: ['locking', 'finished', 'cancelled'],
  locking: ['finished', 'cancelled'],
  // MİRAS (migration 0006): hiçbir kod yolu `in_progress` YAZMAZ — motor
  // senkron koşar, "koşuyor" diye gözlemlenebilir bir ara durum yoktur.
  // Ama sütun geçmişte bu değeri kabul ediyordu; bir gün yazılırsa
  // kuralın onu da tanıması gerekir (kapalı küme olmasa `tsc` susardı).
  in_progress: ['finished', 'cancelled'],
  finished: [],
  cancelled: [],
};

/** Çıkışsız durumlar — buradan HİÇBİR geçiş yoktur. */
export const TERMINAL_RACE_STATUSES: readonly RaceStatus[] = ['finished', 'cancelled'];

/** `from`dan `to`ya geçiş meşru mu? Fırlatmaz, cevap döner (test edilebilirlik). */
export function canTransitionRace(from: RaceStatus, to: RaceStatus): boolean {
  return RACE_LIFECYCLE_TRANSITIONS[from].includes(to);
}

/**
 * Geçişi doğrular; meşru değilse `InvalidRaceTransitionError` fırlatır.
 *
 * Girdi `string` DEĞİL `RaceStatus`tir: bu fonksiyonun çağrıldığı yerler
 * durumu ZATEN daraltmıştır (repository kilit altında okur ve `check*`
 * fonksiyonlarından geçirir). Tanınmayan bir durumun buraya ulaşması bir
 * bütünlük hatasıdır ve `RACE_LIFECYCLE_TRANSITIONS[from]` `undefined`
 * dönerdi — bu yüzden çağıran taraf `assertRaceStatus` ile daraltır.
 */
export function assertRaceTransitionAllowed(from: RaceStatus, to: RaceStatus): void {
  if (!canTransitionRace(from, to)) {
    throw new InvalidRaceTransitionError(from, to);
  }
}

/**
 * Ham `string`i `RaceStatus`e daraltır; tanınmayan değerde fırlatır.
 *
 * NEDEN GEREKLİ: durum veritabanından gelir ve `pg` onu daraltılmamış
 * metin olarak döndürür. Tanınmayan bir değeri sessizce geçirmek,
 * `RACE_LIFECYCLE_TRANSITIONS[from]` üzerinden `undefined.includes(...)`
 * çağrısına ve dolayısıyla ANLAMSIZ bir `TypeError`a yol açardı.
 */
export function assertRaceStatus(value: string): RaceStatus {
  if (!(RACE_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Tanınmayan yarış durumu: ${value}`);
  }
  return value as RaceStatus;
}
