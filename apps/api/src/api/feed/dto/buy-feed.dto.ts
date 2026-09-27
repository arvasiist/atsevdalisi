import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * `POST /players/:id/feed-inventory/:type/buy` gövde şeması — bu turda
 * EKLENDİ.
 *
 * `count` OPSİYONELDIR; verilmezse Application katmanı `1` kabul eder
 * ("bir adet al" en yaygın kullanımdır).
 *
 * DİKKAT: buradaki `@IsInt`/`@Min` TEK BAŞINA YETERLİ DEĞİLDİR — CLAUDE.md
 * "Kardeş tuzak": Vitest/esbuild altında DTO dekoratörleri sessizce
 * atlanabilir. Gerçek doğrulama domain'dedir
 * (`BuyFeedUseCase.parseCount` → `InvalidFeedPurchaseCountError`), üst sınır
 * da oradan (`care.config.json` `feedPurchaseMaxCount`) gelir; buradaki
 * dekoratörler yalnızca üretimde (derlenmiş Nest) erken/ucuz bir kapıdır.
 */
export class BuyFeedDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;
}
