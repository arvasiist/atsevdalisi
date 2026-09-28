import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type {
  ApiSuccess,
  NotificationListResult,
  NotificationView,
  RaceInviteView,
  RespondRaceInviteResult,
} from '@at-sevdalisi/shared-types';
import { ListNotificationsUseCase } from '../../application/use-cases/list-notifications.use-case';
import {
  MarkAllNotificationsReadUseCase,
  type MarkAllNotificationsReadResult,
} from '../../application/use-cases/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from '../../application/use-cases/mark-notification-read.use-case';
import { RespondRaceInviteUseCase } from '../../application/use-cases/respond-race-invite.use-case';
import { SendRaceInviteUseCase } from '../../application/use-cases/send-race-invite.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RespondRaceInviteDto } from './dto/respond-race-invite.dto';
import { SendRaceInviteDto } from './dto/send-race-invite.dto';

/**
 * Bildirimler + yarış daveti (brief §16 RACE INVITE, §28 SOCIAL
 * NOTIFICATIONS, §42 PHASE 11).
 *
 * `@Controller()` (boş prefix) + TAM yollar — `SocialController` ile AYNI
 * gerekçe: uç noktalar `players/:id/...` eksenindedir ama o prefix'i
 * `@Controller('players')` ile almak, aynı prefix'i üçüncü kez bildirmek
 * olurdu.
 *
 * **BEŞ UÇ NOKTANIN TAMAMI `assertSelf` ile korunur** — `:id` her zaman
 * İŞLEMİ YAPAN oyuncudur, hiçbir zaman "hedef" değildir (hedef gövdede ya
 * da ikinci yol parametresinde gelir). IDOR'a karşı ilk kapı
 * (`AUDIT_REPORT.md` Bulgu S4): başkasının bildirimlerini okumak veya onun
 * adına davet göndermek bu satır olmadan mümkün olurdu.
 *
 * **`Idempotency-Key` KULLANILMAZ (bilinçli):** bu uç noktaların HİÇBİRİ
 * para/mülkiyet değiştirmez (bkz. `RaceInviteRepository` port doc yorumu —
 * davet kabul etmek yarışa katılmak DEĞİLDİR, giriş ücreti ödemez).
 * Interceptor'ın çözdüğü sorun ("zaman aşımından sonra tekrarlanan istek
 * İKİ KEZ TAHSİL ETMESİN") burada yoktur. Bunun yerine davet uç noktasında
 * **`@RateLimit`** uygulanır (aşağıda) — spam'in asıl savunması.
 *
 * İş kuralı İÇERMEZ — yalnızca Application katmanını çağırır ve sonucu
 * docs/API.md §1.1 zarfına sarar.
 */
@Controller()
export class NotificationController {
  constructor(
    @Inject(ListNotificationsUseCase) private readonly listNotificationsUseCase: ListNotificationsUseCase,
    @Inject(MarkAllNotificationsReadUseCase)
    private readonly markAllNotificationsReadUseCase: MarkAllNotificationsReadUseCase,
    @Inject(MarkNotificationReadUseCase)
    private readonly markNotificationReadUseCase: MarkNotificationReadUseCase,
    @Inject(SendRaceInviteUseCase) private readonly sendRaceInviteUseCase: SendRaceInviteUseCase,
    @Inject(RespondRaceInviteUseCase) private readonly respondRaceInviteUseCase: RespondRaceInviteUseCase,
  ) {}

  /**
   * Bildirimler + okunmamış sayısı. Ekran açıldığında çağrılan TEK istek
   * (bkz. `NotificationListResult` doc yorumu — `unreadCount` ayrı bir
   * `COUNT(*)`tur, listenin kırpılmış uzunluğu DEĞİLDİR).
   */
  @Get('players/:id/notifications')
  async listNotifications(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<NotificationListResult>> {
    assertSelf(currentPlayer.id, id);
    const result = await this.listNotificationsUseCase.execute(id);
    return { success: true, data: result };
  }

  /**
   * TÜM bildirimleri okundu işaretler.
   *
   * **BU ROTA DİĞERİNDEN ÖNCE TANIMLANMALIDIR.** `players/:id/notifications/
   * read-all` yolunun `read-all` parçası, alttaki
   * `players/:id/notifications/:notificationId/read` rotasının
   * `:notificationId` parametresiyle ÇAKIŞMAZ çünkü segment SAYISI farklıdır
   * (2'ye 3) — yani Nest ikisini ayırt eder. Yine de sıra bilinçli olarak
   * böyle bırakılmıştır: ileride `read-all` benzeri tek segmentli bir yol
   * eklenirse, önce tanımlı olan kazanır ve davranış şaşırtmaz.
   *
   * **`markedCount` DÖNER (204 yerine):** `RemoveFriendResult` ile AYNI
   * gerekçe — istemcinin `request()` yardımcısı her yanıtta
   * `response.json()` çağırır.
   */
  @Post('players/:id/notifications/read-all')
  @HttpCode(HttpStatus.OK)
  async markAllNotificationsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<MarkAllNotificationsReadResult>> {
    assertSelf(currentPlayer.id, id);
    const result = await this.markAllNotificationsReadUseCase.execute(id);
    return { success: true, data: result };
  }

  /**
   * Tek bildirimi okundu işaretler. Yeni kaynak YARATMAZ (mevcut satırın
   * `read_at`ini doldurur) — bu yüzden 200 OK. **İdempotenttir:** zaten
   * okunmuş bir bildirim yine 200 döner, gövdesi değişmez.
   */
  @Post('players/:id/notifications/:notificationId/read')
  @HttpCode(HttpStatus.OK)
  async markNotificationRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<NotificationView>> {
    assertSelf(currentPlayer.id, id);
    const notification = await this.markNotificationReadUseCase.execute(id, notificationId);
    return { success: true, data: notification };
  }

  /**
   * Arkadaşı yarışa davet eder. Yeni bir `race_invites` satırı (ve ona
   * bağlı `notifications` satırı) yarattığı için varsayılan 201 Created
   * döner.
   *
   * `@RateLimit` — davet, karşı tarafa BİLDİRİM üreten bir uçtur;
   * `keyBy: 'player'` (IP değil) çünkü limitin amacı paylaşılan bir ağı
   * cezalandırmak değil, tek bir hesabın saniyeler içinde onlarca kişiye
   * davet atmasını durdurmaktır (`SocialController.sendFriendRequest` ile
   * AYNI gerekçe). Bekleyen davet TAVANI
   * (`config/social.config.json` → `pendingInvitesLimit`, 409) ikinci
   * savunma hattıdır.
   */
  @RateLimit({ name: 'race-invite', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @Post('players/:id/race-invites')
  async sendRaceInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendRaceInviteDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceInviteView>> {
    assertSelf(currentPlayer.id, id);
    const invite = await this.sendRaceInviteUseCase.execute(id, dto.inviteeId, dto.raceId);
    return { success: true, data: invite };
  }

  /**
   * Daveti yanıtlar. Yeni kaynak YARATMAZ (mevcut satırın durumunu
   * değiştirir) — bu yüzden 200 OK.
   *
   * **`accept` YARIŞA KATILMAK DEĞİLDİR** — brief §16'nın `[JOIN]` düğmesi
   * istemcide iki adımdır: bu uç nokta yalnızca daveti kabul eder, istemci
   * sonra lobiye gidip atını seçer (bkz. `RespondRaceInviteResult` doc
   * yorumu — giriş ücreti tek yoldan, `JoinRaceUseCase`, geçer).
   */
  @Post('players/:id/race-invites/:inviteId/respond')
  @HttpCode(HttpStatus.OK)
  async respondToRaceInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Body() dto: RespondRaceInviteDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RespondRaceInviteResult>> {
    assertSelf(currentPlayer.id, id);
    // `dto.action` HAM geçirilir (`string` tipinde ama `unknown` bekleyen bir
    // imzaya): doğrulama domain'dedir (`parseRaceInviteAction`) ve burada tip
    // daraltmak, CLAUDE.md'nin uyardığı "DTO dekoratörüne güven" tuzağını
    // büyütürdü (`SocialController.respondToFriendRequest` ile AYNI satır).
    const result = await this.respondRaceInviteUseCase.execute(id, inviteId, dto.action);
    return { success: true, data: result };
  }
}
