import { IsString } from 'class-validator';

/**
 * `POST /races/:id/ready` gövde şeması (brief §6, §42 PHASE 3).
 *
 * **ALAN `unknown`'DIR — `JoinRaceDto`/`CreateRaceDto` İLE AYNI GEREKÇE:**
 * Vitest/esbuild `design:paramtypes` üretmediği için `ValidationPipe` gövdeyi
 * HİÇ doğrulamaz (CLAUDE.md kural 5), yani çalışma anında `dto.status`
 * gerçekten bir sayı, dizi ya da `null` olabilir. `string` diye tiplamak
 * derleyiciyi susturur, hatayı GİZLEMEZ; `unknown` ise derleyiciyi "önce
 * kontrol et" demeye ZORLAR ve tek doğruluk kaynağını
 * (`domain/race/lobby.ts` → `validateEntryReady`) zorunlu kılar.
 *
 * **`@IsIn(READY_SETTABLE_STATUSES)` BİLİNÇLİ OLARAK YOK.** `JoinRaceDto`
 * doc yorumundaki gerekçenin AYNISI: `@IsUUID()`/`@IsIn()` esbuild altında
 * atlanır ve geçersiz bir değer veritabanına ulaşıp `23514`
 * (check_violation) ile **500** döndürür — oysa doğru cevap 400'dür.
 * `READY_SETTABLE_STATUSES` bu yüzden domain'de, `validateEntryReady`
 * içinde BAĞIMSIZ olarak uygulanır; buradaki `@IsString()` yalnızca
 * gerçek bir HTTP sunucusunda çalışan ÖN KONTROLDÜR.
 *
 * **`cancelled` SEÇİLEMEZ.** Katılım iptali ücretli bir yarışta iade
 * gerektirir ve ayrı bir uçtur; buradan yazılabilseydi ücret ödemeden
 * çıkmanın bir yolu doğardı (bkz. `READY_SETTABLE_STATUSES` doc yorumu).
 *
 * **`playerId`/`raceId` ALANI YOKTUR:** oyuncu `CurrentPlayer()`'dan (JWT),
 * yarış ise URL yolundan gelir ve `ParseUUIDPipe` ile elenir.
 */
export class EntryReadyDto {
  /**
   * Oyuncunun bildirdiği yeni durum — `ready` ya da `not_ready`.
   *
   * `!:` (zorunlu) yazılır çünkü `EntryReadyInput.status` de zorunludur:
   * `undefined` orada "alan yok" değil, "geçersiz değer" demektir ve
   * `validateEntryReady` bunu 400'e çevirir. `?:` yazılsaydı DTO
   * `EntryReadyInput`'a ATANAMAZDI (`TS2345` — `JoinRaceDto`'da birebir
   * yaşandı, 27.09.2026).
   */
  @IsString()
  status!: unknown;
}
