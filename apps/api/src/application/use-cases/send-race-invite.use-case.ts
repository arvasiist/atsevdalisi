import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { NotificationView, RaceInviteView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { assertUnderSocialLimit, canonicalPair } from '../../domain/social/friendship';
import { RaceNotFoundError } from '../../domain/race/errors';
import {
  InviteRequiresFriendshipError,
  RaceInviteAlreadyExistsError,
  RaceNotInvitableError,
} from '../../domain/social/errors';
import { assertInviteNotSelf, checkInviteable, isUuid } from '../../domain/social/invite';
import { assertNoBlock } from '../../domain/social/moderation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { NOTIFICATION_NOTIFIER, type NotificationNotifier } from '../ports/notification-notifier';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { RACE_INVITE_REPOSITORY, type RaceInviteRepository, type RaceInviteRow } from '../ports/race-invite.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';
import { toRaceInviteView } from './race-invite.mapper';

/**
 * Arkadaşı yarışa davet etme. `POST /players/:id/race-invites`.
 *
 * brief §16: "Arkadaşlar birbirlerini yarışa davet edebilsin. Örneğin:
 * 'Ömer seni At Sevdalısı Cup yarışına davet etti.' [JOIN] [DECLINE]
 * bildirimi gelsin."
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. `assertInviteNotSelf` — kendini davet (400). Hedefi SORGULAMADAN
 *      önce, çünkü hedef kendisi olduğunda yapılacak bir sorgu yoktur
 *      (`SendFriendRequestUseCase` ile AYNI sıra).
 *   2. `isUuid` — gövdeden gelen iki kimliğin ŞEKLİ (bkz. o fonksiyonun
 *      doc yorumu: bu satırlar olmadan bozuk bir kimlik 500 üretirdi).
 *      Şekli bozuk kimlik 404 döner: öyle bir satır var olamaz.
 *   3. Hedef oyuncu okunur; yoksa `PlayerNotFoundError` (404). Bu adım
 *      ZORUNLUDUR: atlanırsa olmayan bir `inviteeId` doğrudan INSERT'e
 *      gider, `race_invites` FK'sı `23503` ile düşer ve istemci 500 görür.
 *   4. Yarış okunur; yoksa `RaceNotFoundError` (404). Aynı gerekçe.
 *   5. `checkInviteable` — yarış `scheduled` değilse ya da başlangıç
 *      zamanı geçmişse 409. Davet, KATILIMIN mümkün olduğu pencerede
 *      anlamlıdır; başlamış bir yarışa davet göndermek karşı tarafa
 *      tıklanamayan bir [JOIN] düğmesi göstermek olurdu.
 *   6. `areFriends` — brief §16'nın açık şartı: yalnızca ARKADAŞLAR
 *      birbirini davet edebilir (403). Bu, istenmeyen davetleri
 *      (spam/taciz) YAPISAL olarak engeller: davet edebilmek için karşı
 *      tarafın arkadaşlık isteğini KABUL etmiş olması gerekir.
 *   7. `assertUnderSocialLimit` — gönderenin bekleyen davet TAVANI (409).
 *      Neden burada: tavanın amacı BİLDİRİM spam'ini engellemektir,
 *      isteği GÖNDEREN tarafı sınırlar.
 *   8. `saveInvite` — davet satırını VE bildirimi TEK transaction'da
 *      yazar. `null` dönerse bu oyuncu bu yarışa zaten davet edilmiştir
 *      (tekil indeks) → 409.
 *   9. Yayın — davet edilene `race.invite` VE `notification.created`,
 *      davet edene hiçbir şey (kendi ekranında zaten görüyor).
 *
 * **NEDEN DAVET EDENE YAYIN YOK:** davet eden, daveti gönderen taraftır ve
 * yanıtı kendi isteğinin HTTP cevabında alır. Aynı bilgiyi soketten de
 * göndermek, istemciye iki kaynaktan gelen ve birleştirilmesi gereken
 * yinelenen bir satır bırakırdı.
 *
 * **NEDEN KİMLİK BURADA ÜRETİLİR (`randomUUID`):** davet kimliği,
 * bildirimin `payload`ına YAZILIR ve ikisi tek transaction'da doğar. Kimlik
 * veritabanında üretilseydi (`gen_random_uuid()`), payload INSERT anında
 * henüz bilinmeyen bir değeri taşımak zorunda kalırdı — ya boş yazılır ya
 * da satır ikinci bir `UPDATE` ile düzeltilirdi. Kimliği baştan üretmek
 * ikisini de gereksiz kılar. `create-race.use-case.ts`in `raceId`yi
 * `randomUUID()` ile üretmesiyle AYNI desen; DETERMİNİZM kuralını
 * (CLAUDE.md kural 3) İHLAL ETMEZ: o kural yarış SİMÜLASYONU içindir,
 * kayıt kimlikleri için değil.
 */
@Injectable()
export class SendRaceInviteUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(RACE_INVITE_REPOSITORY) private readonly inviteRepository: RaceInviteRepository,
    @Inject(NOTIFICATION_NOTIFIER) private readonly notifier: NotificationNotifier,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(inviterId: string, inviteeId: string, raceId: string): Promise<RaceInviteView> {
    assertInviteNotSelf(inviterId, inviteeId);

    // ŞEKİL kontrolü, VARLIK kontrolünden ÖNCE (bkz. `isUuid` doc yorumu):
    // `inviteeId`/`raceId` GÖVDE alanlarıdır, `@IsUUID()` esbuild altında
    // atlanır ve `ParseUUIDPipe` yalnızca yol parametrelerini korur. Bu iki
    // satır olmadan `{"inviteeId":"abc"}` istemciye 500 döndürürdü.
    // Şekli bozuk bir kimlik için 404 doğrudur: öyle bir satır var olamaz.
    if (!isUuid(inviteeId)) {
      throw new PlayerNotFoundError(inviteeId);
    }
    if (!isUuid(raceId)) {
      throw new RaceNotFoundError(raceId);
    }

    const invitee = await this.playerRepository.findById(inviteeId);
    if (invitee === null) {
      throw new PlayerNotFoundError(inviteeId);
    }

    const race = await this.inviteRepository.findRaceForInvite(raceId);
    if (race === null) {
      throw new RaceNotFoundError(raceId);
    }

    // `now` TEK KEZ üretilir: karşılaştırma bu değere göre yapılır ve
    // test edilebilirlik için kaynağın tek olması gerekir
    // (`checkRaceJoinable` ile AYNI disiplin).
    const rejection = checkInviteable(race, new Date());
    if (rejection !== null) {
      throw new RaceNotInvitableError(rejection);
    }

    const { lowId, highId } = canonicalPair(inviterId, inviteeId);
    const friends = await this.socialRepository.areFriends(lowId, highId);
    if (!friends) {
      throw new InviteRequiresFriendshipError(inviteeId);
    }

    // brief §33: engel varsa yarış daveti GÖNDERİLEMEZ (403). Arkadaşlık
    // kapısından SONRA sorulur — arkadaş olmayan biri zaten 403 alır ve
    // engel sorgusu boşuna yapılmamış olur. `areFriends` YERİNE GEÇMEZ:
    // engelleme arkadaşlık satırını silmediği için eskiden arkadaş olan
    // iki oyuncu aksi hâlde davetleşmeye devam ederdi.
    assertNoBlock(await this.socialRepository.isBlockedBetween(inviterId, inviteeId));

    const pendingCount = await this.inviteRepository.countOutgoingPending(inviterId);
    assertUnderSocialLimit(pendingCount, this.config.social.pendingInvitesLimit, 'PENDING_INVITES');

    const inviter = await this.playerRepository.findById(inviterId);
    if (inviter === null) {
      // Kimlik doğrulanmış oyuncunun KENDİSİ okunamadı: bu bir yetki
      // sorunu değil, VERİ sorunudur (token geçerli ama satır yok).
      // Sessizce devam etmek, bildirim payload'ına boş bir ad yazardı.
      throw new PlayerNotFoundError(inviterId);
    }

    const inviteId = randomUUID();
    const row = await this.inviteRepository.saveInvite({
      inviteId,
      raceId,
      inviterId,
      inviteeId,
      notificationPayload: {
        inviteId,
        raceId,
        raceName: race.raceName,
        inviterId,
        inviterDisplayName: inviter.displayName,
      },
    });
    if (row === null) {
      // Bu oyuncu bu yarışa zaten davet edilmiş (tekil indeks). Araya
      // giren eşzamanlı bir istek de olabilir; ikisi de aynı yanıtı hak
      // eder ve hiçbir şey yazılmamıştır.
      throw new RaceInviteAlreadyExistsError();
    }

    const view = toRaceInviteView(row);
    this.notifier.notifyRaceInvite(inviteeId, view);
    this.notifier.notifyNotification(inviteeId, toRaceInviteNotification(row));
    return view;
  }
}

/**
 * Davet satırından, davet edilene düşen `race_invite` bildirimini üretir.
 *
 * **NEDEN AYRI BİR FONKSİYON (repository'nin döndürdüğü satırdan değil de
 * buradan):** bildirim satırının `notificationId`si ile davetin `inviteId`
 *si AYRI kimliklerdir (iki farklı tablo). Burada üretilen nesne yalnızca
 * SOKET yayını içindir — `readAt: null` ve `createdAt` davetle aynı andır.
 * Kalıcı bildirim satırının kimliği veritabanında üretilir ve istemci onu
 * `GET /players/:id/notifications` çağrısında görür.
 */
function toRaceInviteNotification(row: RaceInviteRow): NotificationView {
  return {
    notificationId: row.id,
    type: 'race_invite',
    payload: {
      inviteId: row.id,
      raceId: row.raceId,
      raceName: row.raceName,
      inviterId: row.inviterId,
      inviterDisplayName: row.inviterDisplayName,
    },
    readAt: null,
    createdAt: row.createdAt.toISOString(),
  };
}
