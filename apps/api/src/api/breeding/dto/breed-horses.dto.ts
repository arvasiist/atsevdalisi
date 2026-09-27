import { IsString, IsUUID } from 'class-validator';

/**
 * `POST /players/:id/breeding` gövdesi.
 *
 * **`@Length`/`@Matches` BİLİNÇLİ OLARAK YOKTUR** — `SendGiftDto` ile AYNI
 * iki gerekçe:
 *   1. Sınırlar `domain/horse/validation.ts`'tedir
 *      (`HORSE_NAME_MIN_LENGTH`/`HORSE_NAME_MAX_LENGTH`) ve DTO
 *      dekoratörünün argümanı DERLEME ZAMANI sabiti olmak zorundadır —
 *      sabiti buraya gömseydik ikinci bir doğruluk kaynağı doğardı.
 *   2. Bu dekoratörler Vitest/esbuild altında ZATEN atlanır (CLAUDE.md
 *      "Kardeş tuzak"): buraya yazılan bir kontrol ÜRETİMDE çalışıp
 *      testlerde çalışmayan İKİ farklı davranış demek olurdu.
 *
 * **`@IsUUID()`/`@IsString()` YİNE DE VARDIR — "erken kapı" olarak ve
 * ZORUNLUDUR:** `main.ts` `ValidationPipe`'ı `whitelist: true` +
 * `forbidNonWhitelisted: true` ile kuruludur; dekoratörsüz bir alan
 * "property should not exist" hatasıyla REDDEDİLİRDİ. Bunlar TİP
 * iddiasıdır ("bir UUID mi", "bir metin mi"), DEĞER iddiası değil.
 *
 * `foalName` tipi `string` işaretlenir ama use-case imzası `unknown` KABUL
 * EDER (bkz. `BreedHorsesUseCase.execute`): esbuild altında dekoratör
 * atlandığında gövdeden sayı/nesne gelebilir ve `validateHorseName` bunu
 * anlaşılır bir 400'e çevirir, 500'e değil.
 */
export class BreedHorsesDto {
  /** Kısrak — İSTEĞİ YAPAN oyuncuya ait olmalıdır (bkz. `MareNotOwnedError`). */
  @IsUUID()
  mareId!: string;

  /** Aygır — başkasının olabilir; sahibine damızlık ücreti ödenir. */
  @IsUUID()
  stallionId!: string;

  /** Tayın adı. Uzunluk/kalite kontrolü `validateHorseName`'dedir. */
  @IsString()
  foalName!: string;
}
