import { IsUUID } from 'class-validator';

/**
 * `POST /market/listings/{id}/buy` gövde şeması (docs/API.md §5). Bu
 * projede henüz gerçek bir kimlik doğrulama/oturum sistemi olmadığından
 * (bkz. `CancelMarketListingUseCase` doc yorumu) ve `req.params.id`
 * burada İLAN id'sidir (OYUNCU id'si DEĞİL — `IdempotencyInterceptor`'ın
 * `req.params.id`'den `playerId` türettiği diğer rotalardan FARKLI),
 * alıcının kimliği (`buyerId`) AÇIKÇA gövdede gönderilmelidir.
 */
export class BuyMarketListingDto {
  @IsUUID()
  buyerId!: string;
}
