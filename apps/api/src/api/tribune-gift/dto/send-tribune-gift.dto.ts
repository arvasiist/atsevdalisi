import { IsString, IsUUID } from 'class-validator';

/**
 * Tribün hediyesi gövdesi — YALNIZCA at + hediye anahtarı. Fiyat/alıcı
 * gönderilemez (`forbidNonWhitelisted` fazladan alanı 400'ler). `horseId`
 * controller'da `isUUID` ile ayrıca doğrulanır (esbuild dekoratör tuzağı).
 */
export class SendTribuneGiftDto {
  @IsUUID()
  horseId!: string;

  @IsString()
  giftKey!: string;
}
