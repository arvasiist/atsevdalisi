import type { EconomyConfig } from '@at-sevdalisi/game-config';
import { credit, debit, type WalletBalance } from '../economy/wallet';

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

/**
 * Giriş ücretini düşer, ödülü ekler — TEK bir SAF fonksiyonda (bu, gerçek
 * CI'da bulunan bir hatanın düzeltilmiş halidir, bkz. altta). Gerçek
 * satır kilitleme `run-practice-race.use-case.ts`de uygulanır; bu
 * fonksiyon yalnızca "hangi sırayla, hangi korumalarla" sorusunu saf bir
 * şekilde cevaplar.
 *
 * BULUNAN HATA (CI, bu oturum): `wallet.ts`deki `credit`/`debit`,
 * `assertValidAmount` ile SIFIR miktarı reddeder (`amount <= 0` →
 * `InvalidAmountError`) — önceki tüm kullanımlarda (Ahır Yükseltme'nin
 * maliyeti, Günlük Ödül'ün sabit miktarı) miktar hep pozitif olduğu için
 * bu HİÇ sorun çıkarmamıştı. `prizeByFinishPosition`'ın SON sırası
 * BİLEREK 0'dır (son bitirene ödül yok) — bu yüzden yarışı son sırada
 * bitiren HER oyuncu için `credit(..., 0, ...)` çağrılıyor ve
 * `InvalidAmountError` fırlatıyordu; bu hata `http-exception.filter.ts`de
 * eşlenmediği için istemciye `500 Internal Server Error` olarak
 * dönüyordu. Yerel testler bunu YAKALAYAMADI çünkü yerel doğrulama
 * yalnızca framework'ten bağımsız domain testleriydi (gerçek PostgreSQL
 * gerektiren e2e senaryoları, önceki dilimlerdeki AYNI kısıtla, yalnızca
 * CI'da çalışabiliyor) — GitHub'ın robotu, rastgele yarış sonucunun
 * OYUNCUYU son sıraya düşürdüğü birkaç senaryoda bunu yakaladı.
 *
 * Düzeltme: miktar SIFIR olduğunda `debit`/`credit` HİÇ ÇAĞRILMAZ (işlem
 * atlanır) — `wallet.ts`in "sıfır olmayan pozitif miktar" kuralı
 * GEVŞETİLMEDİ, sadece "kazanılacak/harcanacak bir şey yoksa hiç
 * çağırma" mantığı eklendi.
 */
export function applyPracticeRaceStakes(balance: WalletBalance, entryFee: number, prizeWon: number): WalletBalance {
  const afterEntryFee = entryFee > 0 ? debit(balance, entryFee, 'money') : balance;
  return prizeWon > 0 ? credit(afterEntryFee, prizeWon, 'money') : afterEntryFee;
}
