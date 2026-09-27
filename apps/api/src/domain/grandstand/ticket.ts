/**
 * Tribün bileti — SAF domain mantığı (framework'süz TS, `CLAUDE.md`
 * "KATMAN YÖNÜ TEK YÖNLÜ"). Proje sahibinin açık talebi (27.09.2026):
 * "yarış yapılan yerlerde tribüne ücretli girişler olsun insanlar
 * yarışları izleyebilsin".
 *
 * **Burada YAPILMAYAN şey:** para hareketi. `debit`/`credit`
 * (`domain/economy/wallet.ts`) ve `SELECT ... FOR UPDATE` +
 * `economy_transactions` defter kaydı Infrastructure katmanında, TEK bir
 * transaction içinde yapılır (`PostgresGrandstandRepository.purchaseTicket`)
 * — `domain/race/prize.ts`'in `applyPracticeRaceStakes`'i ile AYNI iş
 * bölümü. Bu dosya YALNIZCA "bilet alınabilir mi" sorusunu cevaplar.
 *
 * **Neden bir SAF modül (neden doğrudan use-case içinde değil):** üç kural
 * (yarış bitmiş olmalı, pencere içinde olmalı, kendi yarışın olmamalı) bir
 * veritabanı olmadan test edilebilsin diye — `domain/race/readiness.ts`'in
 * `checkRaceReadiness`'i ile AYNI gerekçe. `apps/api/test/domain/grandstand/
 * ticket.spec.ts` bu üçünü de sınır değerleriyle doğrular.
 */

import { RaceNotWatchableError, RaceTicketAlreadyOwnedError } from './errors';

/** `MS_PER_HOUR` — `config/grandstand.config.json`'daki pencere SAAT cinsindendir, karşılaştırma milisaniye cinsinden yapılır. */
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * `finishedAtMs` (yarışın `races.created_at`'i — yarış sunucuda ANINDA
 * tamamlandığı için "bittiği an" ile aynıdır, bkz. `race.gateway.ts`'in
 * "gerçek zamanlı simülasyon DEĞİL" doc yorumu) ile `nowMs` arasındaki fark
 * `windowHours`'u AŞTIYSA `false` döner.
 *
 * **Gelecekteki bir `finishedAtMs`** (negatif fark — saat kayması/bozuk
 * veri) `true` döner: pencere "en fazla şu kadar eski" anlamına gelir,
 * "en az şu kadar önce" DEĞİL. Bu, sınır durumunu çökmek yerine makul
 * tarafa düşürür (`getCareerProgress`'in güvenli varsayılanı ile AYNI ilke).
 *
 * Sınır değeri KAPSAYICIDIR: tam `windowHours` saat önce bitmiş bir yarış
 * hâlâ izlenebilir sayılır.
 */
export function isWithinWatchWindow(finishedAtMs: number, nowMs: number, windowHours: number): boolean {
  if (!Number.isFinite(finishedAtMs) || !Number.isFinite(nowMs) || !Number.isFinite(windowHours)) {
    return false;
  }
  return nowMs - finishedAtMs <= windowHours * MS_PER_HOUR;
}

/** `assertRaceWatchable` girdisi — çağıran (use-case) bu üç olguyu ZATEN sorgulamış olmalıdır. */
export interface RaceWatchabilityInput {
  raceId: string;
  /** Yarış `finished` durumunda mı? (`races.status = 'finished'`) */
  isFinished: boolean;
  /** Yarışın bitiş anı (ms) — `races.created_at`. */
  finishedAtMs: number;
  /** Şu an (ms) — çağıran tarafından geçirilir, `Date.now()` burada ÇAĞRILMAZ (deterministik test edilebilirlik). */
  nowMs: number;
  /** `config/grandstand.config.json` → `watchWindowHours`. */
  windowHours: number;
  /** İstek sahibinin bu yarışta ATI var mı? Varsa bilet satın almasına gerek yok (zaten katılımcı). */
  isOwnRace: boolean;
}

/**
 * Bilet satın alma ön koşullarını doğrular; sağlanmıyorsa
 * `RaceNotWatchableError` fırlatır.
 *
 * **Kontrol SIRASI önemlidir:** önce "kendi yarışın mı", sonra "bitti mi",
 * en son "pencere doldu mu". Kendi yarışı için bilet almak kavramsal olarak
 * anlamsızdır (zaten erişimi var) ve bu durum yarışın bitip bitmemesinden
 * BAĞIMSIZDIR — sıralama, kullanıcıya en doğru gerekçeyi göstermek içindir,
 * güvenlik açısından üçü de aynı kapıdır.
 */
export function assertRaceWatchable(input: RaceWatchabilityInput): void {
  if (input.isOwnRace) {
    throw new RaceNotWatchableError(input.raceId, 'OWN_RACE');
  }
  if (!input.isFinished) {
    throw new RaceNotWatchableError(input.raceId, 'RACE_NOT_FINISHED');
  }
  if (!isWithinWatchWindow(input.finishedAtMs, input.nowMs, input.windowHours)) {
    throw new RaceNotWatchableError(input.raceId, 'WATCH_WINDOW_EXPIRED');
  }
}

/**
 * Aynı yarışa ikinci bilet alınmasını engeller. `hasTicket` çağıran
 * tarafından `hasTicket(raceId, playerId)` ile SORGULANMIŞ olmalıdır.
 *
 * Bu kontrol TEK BAŞINA yeterli DEĞİLDİR (eşzamanlı iki istek ikisini de
 * geçebilir) — ikinci savunma hattı `race_tickets_unique_per_player`
 * veritabanı kısıtıdır (bkz. `RaceTicketAlreadyOwnedError` doc yorumu).
 */
export function assertTicketNotOwned(hasTicket: boolean, raceId: string): void {
  if (hasTicket) {
    throw new RaceTicketAlreadyOwnedError(raceId);
  }
}

/**
 * Config'teki bilet fiyatını doğrular. `game-config` yükleyicisi saf bir
 * cast olduğundan (çalışma zamanı doğrulaması YOK, bkz. `index.ts` dosya
 * başı notu) bozuk bir config sessizce "bedava bilet" ya da
 * `InvalidAmountError` ile anlaşılmaz bir çökmeye dönüşebilirdi.
 *
 * `domain/economy/wallet.ts`'in `assertValidAmount`'ı ile AYNI kural:
 * sonlu, pozitif, tam sayı. Fiyat 0 olamaz — "ücretli seyirci girişi"
 * talebinin kendisi bunu gerektirir; bedava bir tribün ayrı bir ürün
 * kararıdır ve o zaman bilet satın alma uç noktası hiç çağrılmaz.
 */
export function assertTicketPriceIsValid(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Tribün bilet fiyatı geçersiz (config/grandstand.config.json): ${amount}`);
  }
}
