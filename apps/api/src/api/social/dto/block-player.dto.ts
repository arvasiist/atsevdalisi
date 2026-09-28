import { IsUUID } from 'class-validator';

/**
 * `POST /players/:id/blocks` gövdesi (brief §33, PHASE 15).
 *
 * DİKKAT: buradaki `@IsUUID` TEK BAŞINA YETERLİ DEĞİL — CLAUDE.md "Kardeş
 * tuzak": Vitest/esbuild altında DTO dekoratörleri sessizce atlanır. Gerçek
 * doğrulama controller'da (`isUUID`, 400) ve Application katmanındadır:
 * hedefin VARLIĞI (`BlockPlayerUseCase` → `PlayerNotFoundError`) ve kendini
 * engelleme yasağı (`assertNotSelfBlock`). Buradaki dekoratör yalnızca
 * üretimde (derlenmiş Nest) erken/ucuz bir kapıdır
 * (`send-friend-request.dto.ts` ile AYNI desen).
 */
export class BlockPlayerDto {
  @IsUUID()
  blockedId!: string;
}
