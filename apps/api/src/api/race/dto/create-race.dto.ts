import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * `POST /races` gövde şeması (brief §1, §42 PHASE 1).
 *
 * **BU DTO'NUN ALANLARI `unknown`'DIR — VE BU BİLİNÇLİDİR.** Diğer
 * DTO'lardan (`run-practice-race.dto.ts` vb.) görünen sapma şudur:
 * buradaki alanlar `number`/`string` diye tiplanmaz. Sebep CLAUDE.md
 * kural 5'tir — Vitest/esbuild `design:paramtypes` üretmediği için
 * `ValidationPipe` gövdeyi HİÇ doğrulamaz, yani çalışma anında
 * `dto.fieldSize` gerçekten bir metin olabilir. Alanı `number` diye
 * tiplamak derleyiciyi susturur, hatayı GİZLEMEZ: `validateRaceCreation`
 * `config.fieldSizes.includes("8")` üzerinden `false` döner ve kullanıcı
 * 400 alır — ama `name` için aynı şey olsaydı `42.trim()` **500**
 * fırlatırdı. `unknown`, derleyiciyi "önce kontrol et" demeye ZORLAR ve
 * tek doğruluk kaynağını (`domain/race/lobby.ts`) zorunlu kılar.
 *
 * **DEKORATÖRLER BURADA YALNIZCA TİP KONTROLÜ YAPAR — `@IsIn` YOKTUR.**
 * `run-practice-race.dto.ts`'teki `tierId` ile AYNI gerekçe: sınırların
 * TAMAMI `config/race-lobby.config.json`'dan gelir (at sayıları, giriş
 * ücreti seçenekleri, tribün ücretleri, kapasiteler, pist/hava kümeleri) ve
 * bunlar DERLEME ZAMANINDA bilinmez. `@IsIn([8, 10, 12, 14, 16])` yazmak
 * config ile DTO'nun zamanla ayrışacağı İKİNCİ bir doğruluk kaynağı
 * yaratırdı (config'e 20 eklenip DTO'ya eklenmezse geçerli bir istek
 * reddedilirdi). Aralık kuralı tek bir yerde — domain'de — yaşar.
 *
 * Yani bu dosya gerçek bir HTTP sunucusunda çalışan bir ÖN KONTROLDÜR
 * (yanlış TİPTE alanı erkenden eler); asıl kapı domain'dedir. Bu, "hiçbir
 * tek katmana güvenme" ilkesinin (docs/SECURITY.md §2) bir uygulamasıdır,
 * ihlali değil.
 *
 * **`unknown` ALANLARDA DEKORATÖR YİNE ÇALIŞIR:** `class-validator`
 * ÇALIŞMA ANINDAKİ değeri okur, TypeScript tipini değil. Derleyicinin
 * itiraz etmemesi için `!` kullanılır (alanlar `strictPropertyInitialization`
 * altında doldurulmuş sayılsın diye); gerçek doldurma `ValidationPipe`'ın
 * ya da `plainToInstance`'ın işidir — o adım atlanırsa (esbuild senaryosu)
 * domain doğrulaması zaten devrededir.
 *
 * **`@IsNumber()` BİLİNÇLİ OLARAK YOK:** tüm sayısal alanlar TAM sayıdır
 * (ücret, mesafe, kapasite, oyuncu sayısı). Ondalık kabul eden bir alan
 * (ör. `temperatureC`) eklenirse `IsNumber` import edilip o alana
 * eklenmelidir.
 */
export class CreateRaceDto {
  /** brief §1 "yarış adı" — uzunluk sınırları config'te (`nameLength`). */
  @IsString()
  name!: unknown;

  /** brief §1/§7 "at sayısı" — `config.fieldSizes` üyesi olmalı (8/10/12/14/16). */
  @IsInt()
  fieldSize!: unknown;

  /** brief §1/§6 "maksimum oyuncu" — `fieldSize`'ı aşamaz, `minPlayers`'ın altına inemez. */
  @IsInt()
  maxPlayers!: unknown;

  /** brief §2 giriş ücreti — `raceType = 'free'` ise tam olarak 0 olmalı. */
  @IsInt()
  entryFee!: unknown;

  /** brief §1 "yarış tipi" — `'free'` | `'paid'`. */
  @IsString()
  raceType!: unknown;

  /** brief §1 "başlangıç zamanı" — ISO 8601 metni. Ayrıştırma domain'de (`Date.parse`). */
  @IsString()
  startTime!: unknown;

  /** brief §1 "pist" — `grass` | `dirt` | `synthetic`. */
  @IsString()
  surface!: unknown;

  /** `races.weather` zorunlu olduğu için gövdede de zorunlu — `sunny`/`rainy`/`windy`/`cloudy`/`hot`/`cold`. */
  @IsString()
  weather!: unknown;

  /** brief §1 "yarış mesafesi" (metre) — config'teki `distanceMeters` aralığında tam sayı. */
  @IsInt()
  distanceMeters!: unknown;

  /** brief §10 tribün ücreti — `0` = FREE. Seçenekler config'te (`tribuneFeeOptions`). */
  @IsInt()
  tribuneFee!: unknown;

  /** brief §11 izleyici kapasitesi — seçenekler config'te (`spectatorCapacityOptions`). */
  @IsInt()
  spectatorCapacity!: unknown;

  /**
   * 01.10.2026 — oyuncu kontrollü canlı yarış. `main.ts` `whitelist: true`
   * olduğundan DTO'da OLMAYAN alan üretimde sessizce silinirdi; doğrulamanın
   * kendisi domain'dedir (`validateRaceCreation`).
   */
  @IsOptional()
  @IsBoolean()
  playerControl?: unknown;
}
