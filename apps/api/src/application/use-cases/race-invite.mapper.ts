import type { RaceInviteView } from '@at-sevdalisi/shared-types';
import type { RaceInviteRow } from '../ports/race-invite.repository';

/**
 * `RaceInviteRow` → `RaceInviteView` (brief §16, §42 PHASE 11).
 *
 * **NEDEN AYRI DOSYA:** üç use-case (`send-race-invite`,
 * `respond-race-invite`) ve ileride PHASE 13'ün davet listesi aynı çeviriyi
 * yapar. Kopyalamak, `Date` → ISO dönüşümünün bir kopyada unutulmasına ve
 * sözleşmenin (`createdAt: string`) sessizce çiğnenmesine yol açardı —
 * JSON'da `Date` yoktur, bu yüzden dönüşüm ZORUNLUDUR
 * (`packages/shared-types/src/chat.ts` başlığındaki AYNI uyarı).
 *
 * `respondedAt` `null` KORUNUR (boş dizeye ya da `undefined`a çevrilmez):
 * sözleşme `null` = "henüz yanıtlanmadı" der ve `status === 'pending'`
 * ile birebir örtüşür (migration 0039'un `race_invites_responded_at_ck`
 * kısıtı).
 */
export function toRaceInviteView(row: RaceInviteRow): RaceInviteView {
  return {
    inviteId: row.id,
    raceId: row.raceId,
    raceName: row.raceName,
    inviterId: row.inviterId,
    inviterDisplayName: row.inviterDisplayName,
    inviteeId: row.inviteeId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt === null ? null : row.respondedAt.toISOString(),
  };
}
