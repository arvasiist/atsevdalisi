import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type {
  ApiSuccess,
  BlockedPlayerView,
  DirectMessageView,
  FriendRequestView,
  RemoveBlockResult,
  RemoveFriendResult,
  ReportPlayerResult,
  RespondFriendRequestResult,
  SocialOverviewView,
} from '@at-sevdalisi/shared-types';
import { BlockPlayerUseCase } from '../../application/use-cases/block-player.use-case';
import { GetConversationUseCase } from '../../application/use-cases/get-conversation.use-case';
import { GetInboxUseCase } from '../../application/use-cases/get-inbox.use-case';
import { GetSocialOverviewUseCase } from '../../application/use-cases/get-social-overview.use-case';
import { ListBlockedPlayersUseCase } from '../../application/use-cases/list-blocked-players.use-case';
import { RemoveFriendUseCase } from '../../application/use-cases/remove-friend.use-case';
import { ReportPlayerUseCase } from '../../application/use-cases/report-player.use-case';
import { RespondFriendRequestUseCase } from '../../application/use-cases/respond-friend-request.use-case';
import { SendFriendRequestUseCase } from '../../application/use-cases/send-friend-request.use-case';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';
import { UnblockPlayerUseCase } from '../../application/use-cases/unblock-player.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { BlockPlayerDto } from './dto/block-player.dto';
import { ReportPlayerDto } from './dto/report-player.dto';
import { RespondFriendRequestDto } from './dto/respond-friend-request.dto';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { SendMessageDto } from './dto/send-message.dto';

/**
 * Arkadaşlık + mesajlaşma (proje sahibinin açık talebi, 27.09.2026).
 *
 * `@Controller()` (boş prefix) + TAM yollar — `FeedController` ile AYNI
 * gerekçe: uç noktalar `players/:id/...` eksenindedir ama iki farklı
 * controller'ın (`PlayerController`, `FeedController`) paylaştığı prefix'i
 * `@Controller('players')` ile almak, aynı prefix'i üçüncü kez bildirmek
 * olurdu.
 *
 * **On bir uç noktanın TAMAMI `assertSelf` ile korunur** — `:id` her zaman
 * İŞLEMİ YAPAN oyuncudur, hiçbir zaman "hedef" değildir (hedef gövdede ya
 * da ikinci yol parametresinde gelir). Bu, IDOR'a karşı ilk kapıdır
 * (AUDIT_REPORT.md Bulgu S4): başkasının sosyal listesini okumak veya
 * onun adına istek göndermek bu satır olmadan mümkün olurdu.
 *
 * **`Idempotency-Key` KULLANILMAZ (bilinçli):** bu uç noktaların HİÇBİRİ
 * para/mülkiyet değiştirmez (bkz. `SocialRepository` port doc yorumu) —
 * interceptor'ın çözdüğü sorun ("zaman aşımından sonra tekrarlanan istek
 * İKİ KEZ TAHSİL ETMESİN") burada YOKTUR. Çift tıklanan bir mesaj iki satır
 * üretebilir; bu bir doğruluk hatası değil, kozmetik bir gürültüdür ve
 * istemci butonu istek sürerken devre dışı bırakarak çözer. Bunun yerine
 * **`@RateLimit`** uygulanır (aşağıda) — spam'in asıl savunması.
 *
 * **BU SINIFTAKİ HER YAZMA ROTASI SINIRLIDIR — KAPALI KÜME (28.09.2026).**
 * brief §32 "spam engelle" der ve tek tek saydığı beş işlem asgariyi
 * verir; aynı yüzeydeki kardeş yazma rotaları (isteğe yanıt, arkadaş
 * silme, engel kaldırma) korumasız kalsaydı spam kapısı ORADAN açık
 * kalırdı. Üçü bu dilimde eklendi. `test/security/phase16-hardening.spec.ts`
 * bu kümeyi **kapalı** olarak doğrular: yeni bir yazma rotası eklenip
 * `@RateLimit` konmazsa o test KIRILIR — `RateLimitGuard` opt-in çalıştığı
 * için (bkz. `rate-limit.decorator.ts`) aksi hâlde rota sessizce sınırsız
 * kalırdı ve bunu ne derleyici ne başka bir test fark ederdi.
 *
 * İş kuralı İÇERMEZ — yalnızca Application katmanını çağırır ve sonucu
 * docs/API.md §1.1 zarfına sarar.
 */
@Controller()
export class SocialController {
  constructor(
    @Inject(GetSocialOverviewUseCase) private readonly getSocialOverviewUseCase: GetSocialOverviewUseCase,
    @Inject(SendFriendRequestUseCase) private readonly sendFriendRequestUseCase: SendFriendRequestUseCase,
    @Inject(RespondFriendRequestUseCase) private readonly respondFriendRequestUseCase: RespondFriendRequestUseCase,
    @Inject(RemoveFriendUseCase) private readonly removeFriendUseCase: RemoveFriendUseCase,
    @Inject(SendMessageUseCase) private readonly sendMessageUseCase: SendMessageUseCase,
    @Inject(GetConversationUseCase) private readonly getConversationUseCase: GetConversationUseCase,
    @Inject(GetInboxUseCase) private readonly getInboxUseCase: GetInboxUseCase,
    @Inject(BlockPlayerUseCase) private readonly blockPlayerUseCase: BlockPlayerUseCase,
    @Inject(UnblockPlayerUseCase) private readonly unblockPlayerUseCase: UnblockPlayerUseCase,
    @Inject(ListBlockedPlayersUseCase)
    private readonly listBlockedPlayersUseCase: ListBlockedPlayersUseCase,
    @Inject(ReportPlayerUseCase) private readonly reportPlayerUseCase: ReportPlayerUseCase,
  ) {}

  /**
   * Sosyal özet: arkadaşlar + gelen/giden istekler + okunmamış mesaj sayısı.
   * Ekran açıldığında çağrılan TEK istek (bkz. `SocialOverviewView`).
   */
  @Get('players/:id/social')
  async getOverview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<SocialOverviewView>> {
    assertSelf(currentPlayer.id, id);
    const overview = await this.getSocialOverviewUseCase.execute(id);
    return { success: true, data: overview };
  }

  /**
   * Arkadaşlık isteği gönderir. Yeni bir kaynak (`friendships` satırı)
   * yarattığı için varsayılan 201 Created döner — `BuyFeed`'in "kaynak
   * yaratmaz, 200" istisnasının tam tersi durum.
   *
   * `@RateLimit` — istek, karşı tarafa BİLDİRİM üreten tek sosyal uç
   * noktadır; `keyBy: 'player'` (IP değil) çünkü limitin amacı paylaşılan
   * bir ağı cezalandırmak değil, tek bir hesabın saniyeler içinde onlarca
   * kişiye istek atmasını durdurmaktır (`GrandstandController.purchaseTicket`
   * ile AYNI gerekçe). Bekleyen istek TAVANI
   * (`config/social.config.json` → `pendingRequestsLimit`, 409) ikinci
   * savunma hattıdır.
   */
  @RateLimit({ name: 'friend-request', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @Post('players/:id/friend-requests')
  async sendFriendRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendFriendRequestDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<FriendRequestView>> {
    assertSelf(currentPlayer.id, id);

    // İKİNCİ SAVUNMA HATTI — `@IsUUID()` dekoratörüne TEK BAŞINA güvenilmez.
    // Kök neden `MatchmakingController.join`'in doc yorumunda ayrıntılı
    // yazılıdır (docs/ARCHITECTURE.md §9.1 Hata 7): Vitest/esbuild
    // `design:paramtypes` üretmediği için `ValidationPipe` gövde
    // doğrulamasını SESSİZCE atlar. Bu kontrol olmadan geçersiz bir
    // `addresseeId` repository'ye ulaşır, `WHERE p.id = $1` ham bir Postgres
    // tip hatası (`22P02 invalid input syntax for type uuid`) atar ve istemci
    // 400 yerine **500** görür. `GiftController.sendGift`/
    // `BreedingController.breed` ile AYNI sınıf hata ve AYNI desen.
    //
    // NOT: `addresseeId` bir YOL PARAMETRESİ DEĞİL, GÖVDE alanıdır — bu
    // yüzden `@Param('id', ParseUUIDPipe)` koruması buraya UZANMAZ.
    if (!dto.addresseeId || !isUUID(dto.addresseeId)) {
      throw new BadRequestException('addresseeId geçerli bir UUID olmalıdır.');
    }

    const request = await this.sendFriendRequestUseCase.execute(id, dto.addresseeId);
    return { success: true, data: request };
  }

  /**
   * Gelen isteği yanıtlar. Yeni kaynak YARATMAZ (mevcut satırın durumunu
   * değiştirir) — bu yüzden 200 OK (`FeedController.buyFeed` ile AYNI
   * gerekçe).
   *
   * `:requestId` bir `friendships.id`'dir ve `ParseUUIDPipe` ile
   * doğrulanır: geçersiz bir uuid veritabanına hiç gitmez (`22P02` yerine
   * anında 400).
   */
  @RateLimit({ name: 'friend-request-respond', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @Post('players/:id/friend-requests/:requestId/respond')
  @HttpCode(HttpStatus.OK)
  async respondToFriendRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RespondFriendRequestDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RespondFriendRequestResult>> {
    assertSelf(currentPlayer.id, id);
    // `dto.action` HAM geçirilir (`string` tipinde ama `unknown` bekleyen
    // bir imzaya): doğrulama domain'dedir (`parseFriendshipAction`) ve
    // burada tip daraltmak, CLAUDE.md'nin uyardığı "DTO dekoratörüne
    // güven" tuzağını büyütürdü.
    const result = await this.respondFriendRequestUseCase.execute(id, requestId, dto.action);
    return { success: true, data: result };
  }

  /**
   * Arkadaşlıktan çıkar VEYA bekleyen isteği geri çeker (iki anlam,
   * bilinçli — bkz. `RemoveFriendUseCase`).
   *
   * **200 OK + gövde (204 NO CONTENT DEĞİL):** istemcinin `request()`
   * yardımcısı her yanıtta `response.json()` çağırır ve gövdesiz bir 204
   * orada patlardı — gerekçe `RemoveFriendResult` doc yorumunda. Gövde,
   * silinen satırın kimliğini taşır.
   */
  @RateLimit({ name: 'friend-remove', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @Delete('players/:id/friends/:friendId')
  @HttpCode(HttpStatus.OK)
  async removeFriend(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('friendId', ParseUUIDPipe) friendId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RemoveFriendResult>> {
    assertSelf(currentPlayer.id, id);
    const result = await this.removeFriendUseCase.execute(id, friendId);
    return { success: true, data: result };
  }

  /**
   * Mesaj gönderir. Yeni bir `direct_messages` satırı yaratır → 201.
   *
   * `@RateLimit` — spam savunmasının İKİNCİ hattı: arkadaşlık kapısı
   * (`NOT_FRIENDS`, 403) "KİME" sorusunu kapatır, hız sınırı "NE KADAR
   * SIK" sorusunu. Kabul edilmiş bir arkadaşa dakikada 30 mesaj makul bir
   * sohbet temposudur.
   */
  @RateLimit({ name: 'direct-message', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @Post('players/:id/messages')
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<DirectMessageView>> {
    assertSelf(currentPlayer.id, id);

    // İKİNCİ SAVUNMA HATTI — `sendFriendRequest` ile AYNI gerekçe ve AYNI
    // desen: `recipientId` GÖVDE alanıdır, `ParseUUIDPipe` ona UZANMAZ ve
    // `@IsUUID()` esbuild altında atlanır. `body`nin doğrulaması BURADA
    // DEĞİL, `normalizeMessageBody`tedir (kırpma/boş/uzunluk) — o zaten
    // domain katmanında ve bağımsızdır.
    if (!dto.recipientId || !isUUID(dto.recipientId)) {
      throw new BadRequestException('recipientId geçerli bir UUID olmalıdır.');
    }

    const message = await this.sendMessageUseCase.execute(id, dto.recipientId, dto.body);
    return { success: true, data: message };
  }

  /**
   * İki oyuncu arasındaki yazışma (en yeniden eskiye). **Yan etkisi
   * vardır:** bana gelen okunmamış mesajları okundu işaretler (bkz.
   * `GetConversationUseCase` doc yorumu).
   *
   * `:otherPlayerId` bir oyuncu id'sidir — `/inbox` ile ÇAKIŞMAZ çünkü o
   * uç nokta `messages` altında DEĞİL, doğrudan `players/:id/inbox`
   * altındadır (`ListWatchableRacesUseCase`'in `/races/watchable` vs
   * `/races/:id/timeline` ayrımıyla AYNI gerekçe).
   */
  @Get('players/:id/messages/:otherPlayerId')
  async getConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('otherPlayerId', ParseUUIDPipe) otherPlayerId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<DirectMessageView[]>> {
    assertSelf(currentPlayer.id, id);
    const messages = await this.getConversationUseCase.execute(id, otherPlayerId);
    return { success: true, data: messages };
  }

  /**
   * Gelen kutusu — bana gelen son mesajlar (gönderen adıyla). Okundu
   * işaretlemesi YAPMAZ (bkz. `GetInboxUseCase`).
   */
  @Get('players/:id/inbox')
  async getInbox(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<DirectMessageView[]>> {
    assertSelf(currentPlayer.id, id);
    const messages = await this.getInboxUseCase.execute(id);
    return { success: true, data: messages };
  }

  /**
   * Bir oyuncuyu engeller (brief §33, §42 PHASE 15). Yeni bir
   * `player_blocks` satırı yaratır → 201.
   *
   * **İDEMPOTENTTİR (409 DEĞİL, 201):** zaten engelli bir oyuncu için
   * ikinci çağrı da 201 döner ve var olan satırın `blockedAt`ini taşır.
   * Gerekçe `SocialRepository.blockPlayer` doc yorumunda — engelleme bir
   * DURUMdur, olay değil; istemci çift tıklarsa 409 almak anlamsız olurdu.
   *
   * `@RateLimit` — engelleme karşı tarafa bildirim ÜRETMEZ (bilinçli,
   * bkz. repository notu), yani limitin amacı bildirim spam'i değil
   * `player_blocks` tablosuna yazma hızıdır. 60/60sn, insan eliyle
   * engellemenin kat kat üzerindedir.
   */
  @RateLimit({ name: 'player-block', limit: 60, windowSeconds: 60, keyBy: 'player' })
  @Post('players/:id/blocks')
  async blockPlayer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockPlayerDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BlockedPlayerView>> {
    assertSelf(currentPlayer.id, id);

    // İKİNCİ SAVUNMA HATTI — `sendFriendRequest` ile AYNI gerekçe: `blockedId`
    // GÖVDE alanıdır, `ParseUUIDPipe` ona UZANMAZ ve `@IsUUID()` esbuild
    // altında atlanır. Bu kontrol olmadan geçersiz bir uuid repository'ye
    // ulaşır ve istemci 400 yerine 500 (`22P02`) görür.
    if (!dto.blockedId || !isUUID(dto.blockedId)) {
      throw new BadRequestException('blockedId geçerli bir UUID olmalıdır.');
    }

    const blocked = await this.blockPlayerUseCase.execute(id, dto.blockedId);
    return { success: true, data: blocked };
  }

  /**
   * Engeli kaldırır. **200 OK + gövde (204 DEĞİL)** — `removeFriend` ile
   * AYNI gerekçe (`RemoveBlockResult` doc yorumu).
   *
   * `:blockedId` YOL PARAMETRESİDİR ve `ParseUUIDPipe` ile doğrulanır:
   * geçersiz bir uuid veritabanına hiç gitmez. Gövde UUID'sindeki ek
   * `isUUID` kapısı burada GEREKMEZ — boru hattı zaten aynı işi yapar.
   *
   * Engel YOKSA 404 döner (sessiz başarı DEĞİL): gerekçe
   * `BlockNotFoundError` doc yorumunda.
   */
  @RateLimit({ name: 'player-unblock', limit: 60, windowSeconds: 60, keyBy: 'player' })
  @Delete('players/:id/blocks/:blockedId')
  @HttpCode(HttpStatus.OK)
  async unblockPlayer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('blockedId', ParseUUIDPipe) blockedId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RemoveBlockResult>> {
    assertSelf(currentPlayer.id, id);
    const result = await this.unblockPlayerUseCase.execute(id, blockedId);
    return { success: true, data: result };
  }

  /**
   * Engellenen oyuncuların listesi (en yeniden eskiye).
   *
   * **YALNIZCA TEK YÖN:** kullanıcı KENDİ koyduğu engelleri görür. "Beni
   * engelleyenler" listesi bilinçli olarak YOKTUR — o liste engellemeyi
   * sessiz bir mesafe olmaktan çıkarıp bir sosyal sinyale çevirirdi
   * (gerekçe: `SocialRepository.findBlockedPlayers` doc yorumu).
   *
   * **`@Public()` DEĞİLDİR ve OLMAYACAKTIR:** liste yalnızca sahibine
   * açıktır (`assertSelf`), çünkü "kim kimi engellemiş" bilgisi
   * `GET /players/profile/:username`in aksine bir GİZLİLİK konusudur.
   */
  @Get('players/:id/blocks')
  async getBlockedPlayers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BlockedPlayerView[]>> {
    assertSelf(currentPlayer.id, id);
    const blocked = await this.listBlockedPlayersUseCase.execute(id);
    return { success: true, data: blocked };
  }

  /**
   * Bir oyuncuyu şikâyet eder (brief §33). Yeni bir `player_reports` satırı
   * yaratır → 201.
   *
   * **İDEMPOTENT DEĞİLDİR:** aynı oyuncuyu iki kez şikâyet etmek İKİ satır
   * üretir (tekrarlayan şikâyet moderasyon için bir sinyaldir — bkz.
   * `ReportPlayerUseCase`).
   *
   * `@RateLimit` — şikâyet karşı tarafa bildirim ÜRETMEZ (yalnızca
   * moderasyon kuyruğuna düşer, brief §34), yani limitin amacı bildirim
   * spam'i değil `player_reports` tablosuna yazma hızıdır. 20/60sn,
   * gerçek bir kullanıcının kat kat üzerindedir.
   */
  @RateLimit({ name: 'player-report', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @Post('players/:id/reports')
  async reportPlayer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportPlayerDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ReportPlayerResult>> {
    assertSelf(currentPlayer.id, id);

    // İKİNCİ SAVUNMA HATTI — `reportedId` GÖVDE alanıdır. `category` için
    // BURADA bir kontrol YOKTUR ve olmamalıdır: geçerli küme
    // `parseReportCategory`dedir (domain) ve oradaki liste DB CHECK'iyle
    // hizalıdır — burada ikinci bir kopya tutmak, ayrışacak üçüncü bir
    // kaynak yaratırdı (bkz. `ReportPlayerDto` doc yorumu).
    if (!dto.reportedId || !isUUID(dto.reportedId)) {
      throw new BadRequestException('reportedId geçerli bir UUID olmalıdır.');
    }

    const report = await this.reportPlayerUseCase.execute(id, dto.reportedId, dto.category, dto.reason);
    return { success: true, data: report };
  }
}
