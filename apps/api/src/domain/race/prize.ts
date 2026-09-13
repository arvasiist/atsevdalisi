import type { EconomyConfig } from '@at-sevdalisi/game-config';

/**
 * FAZ 1 wiring, dokuzuncu dilim — Pratik Yarış'a giriş ücreti + ödül
 * (brief §31 Economy, docs/SECURITY.md §5). `domain/economy/wallet.ts`
 * (`debit`/`credit`) ile AYNI "SAF fonksiyon" deseni: hiçbir DB/HTTP
 * erişimi içermezler, sadece config + girdiden hesaplarlar. Gerçek
 * bakiye değişikliği (debit+credit, TEK satır kilidi altında) yalnızca
 * `application/use-cases/run-practice-race.use-case.ts`'te uygulanır —
 * bu dosya sadece "ne kadar" sorusuna cevap verir, "nasıl uygulanır"
 * sorusuna değil.
 */

/**
 * Giriş ücreti = temel ücret × çarpan (`config/economy.config.json`daki
 * `raceEntryFeeMultiplier`, altıncı/yedinci dilimlerden beri taslakta
 * duruyordu ama hiç kullanılmamıştı). Sonuç en yakın tam sayıya
 * yuvarlanır (`money` bir tam sayı birimidir — bkz. `wallet.ts`daki
 * `assertValidAmount`'ın `Number.isInteger` kontrolü).
 */
export function getPracticeRaceEntryFee(config: EconomyConfig): number {
  return Math.round(config.practiceRace.baseEntryFee * config.raceEntryFeeMultiplier);
}

/**
 * Bitiş sırasına göre ödül. `finishPosition` 1 tabanlıdır (1. = birinci).
 * `prizeByFinishPosition` dizisinin sınırları dışında bir sıralama
 * gelirse (örn. config değişip dizi kısaltılırsa) ödül 0 kabul edilir —
 * bu, `entrant-snapshot.ts`deki nötr-değer felsefesiyle AYNI: eksik/
 * beklenmeyen veri bir çökmeye DEĞİL, güvenli bir varsayılana yol açar.
 *
 * NOT: Bu, gerçek çok oyunculu bir ödül havuzu DEĞİLDİR (botlar para
 * yatırmaz) — `prizeByFinishPosition` sabit, önceden belirlenmiş bir
 * ödül tablosudur. Gerçek çok oyunculu yarışlarda (FAZ 7 Matchmaking)
 * `prizePool`, katılımcıların giriş ücretlerinin GERÇEK toplamı olacak
 * ve bu fonksiyon yerini o hesaplamaya bırakacaktır.
 */
export function getPracticeRacePrize(finishPosition: number, config: EconomyConfig): number {
  const table = config.practiceRace.prizeByFinishPosition;
  const index = finishPosition - 1;
  const prize = table[index];
  // `noUncheckedIndexedAccess` `table[index]`'i `number | undefined` yapar
  // (dizi sınırları derleme zamanında BİLİNMEZ) — `?? 0`, hem sınır dışı
  // erişimi HEM DE (mantıken imkansız ama tip sisteminin bilemediği)
  // `undefined` durumunu AYNI güvenli varsayılana indirger.
  return prize ?? 0;
}
