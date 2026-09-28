import { IsUUID } from 'class-validator';

/**
 * `POST /players/:id/race-invites` gövdesi.
 *
 * DİKKAT: buradaki `@IsUUID` TEK BAŞINA YETERLİ DEĞİL — CLAUDE.md "Kardeş
 * tuzak": Vitest/esbuild altında DTO dekoratörleri sessizce atlanır. Gerçek
 * doğrulama Application/Domain'dedir: hedef oyuncunun ve yarışın VARLIĞI
 * (`PlayerNotFoundError`/`RaceNotFoundError`), kendini davet yasağı
 * (`assertInviteNotSelf`), arkadaşlık kapısı (`areFriends`) ve yarışın
 * davet edilebilirliği (`checkInviteable`). Buradaki dekoratörler yalnızca
 * üretimde (derlenmiş Nest) erken/ucuz bir kapıdır
 * (`SendFriendRequestDto` ile AYNI desen).
 *
 * `inviteeId` GÖVDEDEDİR, yol parametresinde DEĞİL: `:id` her zaman İŞLEMİ
 * YAPAN oyuncudur (davet eden) ve `assertSelf` ile korunur — hedefi yola
 * koymak, iki farklı oyuncu kimliğini aynı rotada karıştırma riski
 * doğururdu (bkz. `SocialController` doc yorumu, AYNI ilke).
 */
export class SendRaceInviteDto {
  @IsUUID()
  inviteeId!: string;

  @IsUUID()
  raceId!: string;
}
