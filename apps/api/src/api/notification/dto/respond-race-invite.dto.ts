import { IsIn } from 'class-validator';
import { RACE_INVITE_ACTIONS } from '../../../domain/social/invite';

/**
 * `POST /players/:id/race-invites/:inviteId/respond` gövdesi.
 *
 * `@IsIn` listesi DOMAIN'den okunur (`RACE_INVITE_ACTIONS`) — iki yerde iki
 * ayrı liste tutmak, birinin güncellenip diğerinin unutulmasına yol açardı.
 *
 * DİKKAT: buradaki dekoratör TEK BAŞINA YETERLİ DEĞİL — CLAUDE.md "Kardeş
 * tuzak": Vitest/esbuild altında DTO dekoratörleri sessizce atlanır. Gerçek
 * doğrulama `RespondRaceInviteUseCase` → `parseRaceInviteAction` içindedir
 * (`RespondFriendRequestDto` ile AYNI desen).
 */
export class RespondRaceInviteDto {
  @IsIn([...RACE_INVITE_ACTIONS])
  action!: string;
}
