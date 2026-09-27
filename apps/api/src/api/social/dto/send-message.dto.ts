import { IsString, IsUUID } from 'class-validator';

/**
 * `POST /players/:id/messages` gövdesi.
 *
 * **`@MaxLength` BİLİNÇLİ OLARAK YOKTUR:** azami uzunluk
 * `config/social.config.json` → `maxMessageLength` değeridir ve DTO
 * dekoratörünün argümanı DERLEME ZAMANI sabiti olmak zorundadır — config'i
 * buraya gömseydik "SİHİRLİ SAYI YOK" kuralını çiğner ve DB CHECK'i
 * (`char_length(body) BETWEEN 1 AND 500`) ile config arasında üçüncü bir
 * kopya doğururduk. Gerçek kontrol `normalizeMessageBody`'dedir (kırpma +
 * boş + uzunluk, `InvalidMessageBodyError` → 400).
 *
 * `body` tipi `string` DEĞİL `unknown` KABUL EDİLİR (bkz.
 * `SendMessageUseCase.execute` imzası): istemci sayı/dizi gönderirse
 * domain `NOT_A_STRING` ile 400 döner, çökme olmaz. Buradaki `@IsString`
 * yalnızca üretimdeki erken kapıdır.
 */
export class SendMessageDto {
  @IsUUID()
  recipientId!: string;

  @IsString()
  body!: string;
}
