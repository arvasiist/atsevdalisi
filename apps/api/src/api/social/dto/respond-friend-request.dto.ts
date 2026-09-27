import { IsIn } from 'class-validator';
import { FRIENDSHIP_ACTIONS } from '../../../domain/social/validation';

/**
 * `POST /players/:id/friend-requests/:requestId/respond` gövdesi.
 *
 * `@IsIn` listesi DOMAIN'den okunur (`FRIENDSHIP_ACTIONS`) — burada elle
 * `['accept', 'reject']` yazmak, iki listeyi ayrı ayrı güncelleme riski
 * doğururdu. **Gerçek doğrulama yine domain'dedir**
 * (`parseFriendshipAction` → `InvalidFriendshipActionError`, 400): CLAUDE.md
 * "Kardeş tuzak" — esbuild altında bu dekoratör atlanır.
 */
export class RespondFriendRequestDto {
  @IsIn(FRIENDSHIP_ACTIONS)
  action!: string;
}
