import { Inject, Injectable } from '@nestjs/common';
import type { RespondRaceInviteResult } from '@at-sevdalisi/shared-types';
import {
  InvalidRaceInviteActionError,
  RaceInviteNotFoundError,
  RaceInviteNotRespondableError,
} from '../../domain/social/errors';
import { parseRaceInviteAction } from '../../domain/social/invite';
import { NOTIFICATION_NOTIFIER, type NotificationNotifier } from '../ports/notification-notifier';
import { RACE_INVITE_REPOSITORY, type RaceInviteRepository } from '../ports/race-invite.repository';
import { toRaceInviteView } from './race-invite.mapper';

/**
 * Yarış davetini yanıtlama. `POST /players/:id/race-invites/:inviteId/respond`.
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. `parseRaceInviteAction` — gövde `accept`/`decline` dışındaysa 400.
 *      Doğrulama DOMAIN'de yapılır çünkü `@IsIn` esbuild altında atlanır
 *      (CLAUDE.md kural 5) ve gövde çalışma anında gerçekten bozuk olabilir.
 *   2. Davet okunur. Yoksa VEYA davet edilen bu oyuncu DEĞİLSE 404 —
 *      `FriendshipNotFoundError` ile AYNI gerekçe: "bu id var ama senin
 *      değil" demek başkasının davetinin VARLIĞINI sızdırırdı. Kendi
 *      gönderdiğin daveti yanıtlamaya çalışmak da bu kapıya düşer.
 *   3. `status !== 'pending'` ise 409 — yanıtlanmış bir davet yeniden
 *      yanıtlanamaz. Aynı daveti iki kez kabul etmek, davet edene ikinci
 *      bir "kabul etti" bilgisi doğururdu.
 *   4. `respond` — SQL'de de `invitee_id` ve `status = 'pending'` koşulları
 *      TEKRARLANIR; `null` dönerse araya giren eşzamanlı bir yanıt vardır
 *      → 409.
 *   5. Yayın — DAVET EDENE `race.invite.responded` (kabul de red de aynı
 *      olayla gider; ayrım `status` alanındadır). Davet edilen zaten
 *      kendi HTTP cevabını alır.
 *
 * **`accept` YARIŞA KATILMAK DEĞİLDİR (bilinçli — brief §16'nın [JOIN]
 * düğmesi istemcide iki adımdır):** katılım bir ATA ve bir GİRİŞ ÜCRETİNE
 * bağlıdır (`POST /races/:id/join` gövdesi `horseId` ister). Davetin
 * gövdesinde at yoktur ve olamaz, çünkü hangi atın koşacağı oyuncunun
 * kararıdır. Bu yüzden bu use-case para yoluna HİÇ dokunmaz: ne
 * `SELECT ... FOR UPDATE`, ne `economy_transactions`. Giriş ücreti tek
 * yoldan (`JoinRaceUseCase`) geçmeye devam eder — CLAUDE.md kural 7.
 */
@Injectable()
export class RespondRaceInviteUseCase {
  constructor(
    @Inject(RACE_INVITE_REPOSITORY) private readonly inviteRepository: RaceInviteRepository,
    @Inject(NOTIFICATION_NOTIFIER) private readonly notifier: NotificationNotifier,
  ) {}

  async execute(playerId: string, inviteId: string, rawAction: unknown): Promise<RespondRaceInviteResult> {
    const action = parseRaceInviteAction(rawAction);
    if (action === null) {
      throw new InvalidRaceInviteActionError(rawAction);
    }

    const invite = await this.inviteRepository.findById(inviteId);
    // İki durum TEK kapıya düşer (bilinçli): davet yok VE davet bu oyuncuya
    // gelmemiş. İkincisinde "senin değil" demek, kimliğin VARLIĞINI
    // sızdırırdı.
    if (invite === null || invite.inviteeId !== playerId) {
      throw new RaceInviteNotFoundError(inviteId);
    }

    if (invite.status !== 'pending') {
      throw new RaceInviteNotRespondableError(invite.status);
    }

    const status = action === 'accept' ? 'accepted' : 'declined';
    const row = await this.inviteRepository.respond({
      inviteId,
      inviteeId: playerId,
      status,
      respondedAt: new Date(),
    });
    if (row === null) {
      // Araya giren eşzamanlı bir yanıt (2–4 arası kontroller transaction
      // DIŞINDA okunur). Zararsızdır: hiçbir şey yazılmadı, istemci doğru
      // cevabı alır.
      throw new RaceInviteNotRespondableError(invite.status);
    }

    this.notifier.notifyRaceInviteResponded(row.inviterId, toRaceInviteView(row));
    return { inviteId: row.id, status: row.status };
  }
}
