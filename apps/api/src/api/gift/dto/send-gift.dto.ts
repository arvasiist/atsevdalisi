import { IsInt, IsString, IsUUID } from 'class-validator';

/**
 * `POST /players/:id/gifts` gövdesi.
 *
 * **`@Min`/`@Max`/`@IsIn` BİLİNÇLİ OLARAK YOKTUR (iki ayrı gerekçe):**
 *
 *   1. **Sınırlar config'tedir** (`config/gift.config.json → minAmount/
 *      maxAmount/allowedCurrencies`) ve DTO dekoratörünün argümanı DERLEME
 *      ZAMANI sabiti olmak zorundadır — config'i buraya gömseydik
 *      "SİHİRLİ SAYI YOK" kuralını çiğner ve `gift_sends.amount > 0`
 *      CHECK'i ile config arasında ÜÇÜNCÜ bir kopya doğururduk
 *      (`SendMessageDto`'nun `@MaxLength` notuyla AYNI gerekçe).
 *   2. **Bu dekoratörler Vitest/esbuild altında ZATEN atlanır**
 *      (`CLAUDE.md` "Kardeş tuzak"): testlerde gövde doğrulanmadan geçer.
 *      Buraya yazılan bir aralık kontrolü ÜRETİMDE çalışıp testlerde
 *      çalışmayan, İKİ farklı davranış demek olurdu.
 *
 * Gerçek doğrulama domain'dedir: `parseGiftAmount` (tam sayı mı) →
 * `assertValidGiftAmount` (aralık) → `resolveGiftCurrency` (izinli birim).
 * Hepsi `INVALID_GIFT_AMOUNT` / `GIFT_CURRENCY_NOT_ALLOWED` → 400 döner.
 *
 * **`@IsInt()`/`@IsString()` YİNE DE VARDIR — "erken kapı" olarak, ve
 * ZORUNLUDUR:** `main.ts` `ValidationPipe`'ı `whitelist: true` +
 * `forbidNonWhitelisted: true` ile kuruludur; dekoratörsüz bir alan
 * "property should not exist" hatasıyla REDDEDİLİRDİ — yani dekoratörü
 * kaldırmak, üretimde her hediye isteğini 400 yapardı. Bu ikisi TİP
 * iddiasıdır ("bir sayı mı", "bir metin mi"), DEĞER iddiası değil —
 * sınırlar hâlâ tek bir yerde, config'te yaşar.
 *
 * `amount`/`currency` tipleri `number`/`string` olarak işaretlenir ama
 * use-case imzaları `unknown` KABUL EDER (bkz. `SendGiftUseCase.execute`):
 * esbuild altında dekoratör atlandığında gövdeden dizi/nesne gelebilir ve
 * domain bunu anlaşılır bir 400'e çevirir, çökme olmaz.
 */
export class SendGiftDto {
  @IsUUID()
  recipientId!: string;

  /** Ham değer — aralık/tam sayı kontrolü `assertValidGiftAmount`'tadır. */
  @IsInt()
  amount!: number;

  /** Ham değer — `CURRENCIES` + `allowedCurrencies` kontrolü `resolveGiftCurrency`'dedir. */
  @IsString()
  currency!: string;
}
