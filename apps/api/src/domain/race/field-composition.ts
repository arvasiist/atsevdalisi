/**
 * `fieldSize` (sahadaki AT sayısı) ile `humanPlayerCount` (GERÇEK oyuncu
 * sayısı) AYRI İKİ KAVRAMDIR (§42 PHASE 2, 28.09.2026).
 *
 * **BU AYRIMIN YOKLUĞU SESSİZ BİR HATAYDI.** Öncesinde `aiFillEnabled`
 * config değeri **HİÇBİR KOD TARAFINDAN OKUNMUYORDU**: yalnızca config
 * dosyasında ve tipinde duruyordu, bir test de yalnızca "boolean mı"
 * diye bakıyordu. Yani sahibi onu `false` yapsa **hiçbir şey değişmezdi**
 * ve bunu hiçbir derleyici/test söylemezdi. Bir config değerinin hiçbir
 * etkisi olmaması, o değerin olmamasından DAHA KÖTÜDÜR: okuyan onu
 * "kapatma düğmesi" sanar.
 *
 * **KARAR BURADA VERİLİR, `settle-race.use-case.ts`TE DEĞİL.** Bu kural
 * saf bir fonksiyondur (I/O yok, framework yok — CLAUDE.md "KATMAN YÖNÜ
 * TEK YÖNLÜ"), yani tam test matrisi (8/10/12/14/16 × oyuncu sayıları)
 * saniyeler içinde ve VERİTABANI OLMADAN koşabilir. Use-case yalnızca
 * sonucu tüketir.
 */

/** `resolveFieldComposition` ret nedenleri. */
export type FieldCompositionRejection =
  /** `fieldSize` desteklenen kümede değil (8/10/12/14/16). */
  | 'UNSUPPORTED_FIELD_SIZE'
  /** Gerçek oyuncu sayısı sahaya sığmıyor (kadro `fieldSize`ı aşmış). */
  | 'TOO_MANY_PLAYERS'
  /**
   * Sahada HİÇ gerçek oyuncu yok. `checkRaceSettleable`/`checkRaceLockable`
   * bunu zaten `NO_PARTICIPANTS` ile reddeder (bkz. `lobby.ts`); burada
   * İKİNCİ kez reddedilmesi bilinçlidir: bu fonksiyon saf bir kuraldır ve
   * "0 oyuncu + N bot" diye bir yarış **kavramsal olarak yoktur** — ödül
   * havuzu gerçek giriş ücretlerinden oluşur, yani boş bir sahanın havuzu
   * da yoktur.
   */
  | 'NO_HUMAN_PLAYERS';

/** Sahadaki koltukların gerçek/AI dağılımı. */
export interface FieldComposition {
  /** Gerçek oyuncu koltuğu sayısı — `humanCount` ile AYNI. */
  humans: number;
  /** AI ile doldurulacak koltuk sayısı — `aiFillEnabled` kapalıysa 0. */
  bots: number;
  /** Sahadaki TOPLAM at: `humans + bots` (≤ `fieldSize`). */
  total: number;
  /**
   * `fieldSize − humans` — AI dolgusu KAPALIYKEN boş kalan koltuk sayısı.
   *
   * **BU ALAN SÜS DEĞİLDİR:** "saha dolmadı" durumunun kaç koltuk
   * eksik olduğunu söyler ve bu, yarışın gerçekten daha az atla
   * koşacağını AÇIKÇA kabul etmek demektir. Eksik koltukları sessizce
   * botla doldurmak (eski davranış) `aiFillEnabled = false`ın hiçbir
   * anlamı olmaması demekti.
   */
  emptySeats: number;
}

/** `resolveFieldComposition` sonucu. */
export type FieldCompositionResult =
  | { ok: true; composition: FieldComposition }
  | { ok: false; reason: FieldCompositionRejection };

/**
 * Desteklenen saha büyüklükleri — **BURADA SABİT TUTULMAZ, config'ten
 * gelir.** `config/race-lobby.config.json` → `fieldSizes` (8/10/12/14/16)
 * tek doğruluk kaynağıdır; koda ikinci bir liste gömmek, config'e yeni bir
 * boyut eklendiğinde onu sessizce reddeden bir kod doğururdu
 * (CLAUDE.md kural 6 — sihirli sayı yok).
 */
export interface FieldCompositionConfig {
  /** `raceLobby.fieldSizes` — `races.field_size` sütununun izinli değerleri. */
  fieldSizes: readonly number[];
  /** `raceLobby.aiFillEnabled` — kalan koltuklar AI ile dolar mı? */
  aiFillEnabled: boolean;
}

/**
 * Bir yarışın gerçek/AI kompozisyonunu hesaplar; kural dışıysa ret nedeni
 * döner (`null` fırlatmaz — çağıran kararı kendisi verir).
 *
 * **`fieldSize` KONTROLÜ BURADA TEKRARLANIR.** `validateRaceCreation`
 * zaten yapmıştır; bu bir "hiçbir tek katmana güvenme" uygulamasıdır
 * (docs/SECURITY.md §2). Kesinleşme anında `races.field_size` okunur ve
 * o sütunu **doğrudan SQL ile** değiştirmek mümkündür — o durumda
 * `generateBotEntrants` negatif bir sayı alır ve `fieldSize - humans`
 * sessizce eksiye düşerdi.
 */
export function resolveFieldComposition(
  input: { fieldSize: number; humanCount: number },
  config: FieldCompositionConfig,
): FieldCompositionResult {
  const { fieldSize, humanCount } = input;

  if (!config.fieldSizes.includes(fieldSize)) {
    return { ok: false, reason: 'UNSUPPORTED_FIELD_SIZE' };
  }
  if (!Number.isInteger(humanCount) || humanCount < 0) {
    return { ok: false, reason: 'TOO_MANY_PLAYERS' };
  }
  if (humanCount > fieldSize) {
    return { ok: false, reason: 'TOO_MANY_PLAYERS' };
  }
  if (humanCount < 1) {
    return { ok: false, reason: 'NO_HUMAN_PLAYERS' };
  }

  // ⚠️ BOT SAYISI `fieldSize`A TAMAMLAR — ama YALNIZCA dolgu açıkken.
  // `Math.max(0, ...)` gereksizdir (yukarıdaki iki kapı eksi değeri
  // imkânsız kılar) ve gereksiz bir koruma, gerçek bir boşluğu gizlerdi.
  const bots = config.aiFillEnabled ? fieldSize - humanCount : 0;

  return {
    ok: true,
    composition: {
      humans: humanCount,
      bots,
      total: humanCount + bots,
      emptySeats: fieldSize - humanCount,
    },
  };
}
