import { IsUUID } from 'class-validator';

/**
 * `POST /players/:id/friend-requests` gövdesi.
 *
 * DİKKAT: buradaki `@IsUUID` TEK BAŞINA YETERLİ DEĞİL — CLAUDE.md "Kardeş
 * tuzak": Vitest/esbuild altında DTO dekoratörleri sessizce atlanır. Gerçek
 * doğrulama Application/Domain'dedir: hedef oyuncunun VARLIĞI
 * (`SendFriendRequestUseCase` → `PlayerNotFoundError`), kendine istek
 * yasağı (`assertNotSelf`) ve çift/kanonik sıra mantığı. Buradaki dekoratör
 * yalnızca üretimde (derlenmiş Nest) erken/ucuz bir kapıdır
 * (`api/feed/dto/buy-feed.dto.ts` ile AYNI desen).
 */
export class SendFriendRequestDto {
  @IsUUID()
  addresseeId!: string;
}
