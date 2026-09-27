import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ApiSuccess, GiftView, SendGiftResult } from '@at-sevdalisi/shared-types';
import { ListMyGiftsUseCase } from '../../application/use-cases/list-my-gifts.use-case';
import { SendGiftUseCase } from '../../application/use-cases/send-gift.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { SendGiftDto } from './dto/send-gift.dto';

/**
 * Hediye gönderimi (proje sahibinin açık talebi, 27.09.2026 — üç parçanın
 * üçüncüsü). **BU BİR PARA YOLUDUR.**
 *
 * `@Controller()` (boş prefix) + TAM yollar — `SocialController`/`FeedController`
 * ile AYNI gerekçe: uç noktalar `players/:id/...` eksenindedir.
 *
 * **İki uç nokta da `assertSelf` ile korunur** — `:id` her zaman İŞLEMİ
 * YAPAN oyuncudur (gönderen), hiçbir zaman "hedef" değildir; alıcı gövdede
 * gelir. Bu, IDOR'a karşı ilk kapıdır (AUDIT_REPORT.md Bulgu S4): bu satır
 * olmadan bir oyuncu BAŞKASININ bakiyesinden hediye gönderebilirdi.
 *
 * İş kuralı İÇERMEZ — yalnızca Application katmanını çağırır ve sonucu
 * docs/API.md §1.1 zarfına sarar.
 */
@Controller()
export class GiftController {
  constructor(
    @Inject(SendGiftUseCase) private readonly sendGiftUseCase: SendGiftUseCase,
    @Inject(ListMyGiftsUseCase) private readonly listMyGiftsUseCase: ListMyGiftsUseCase,
  ) {}

  /**
   * Hediye gönderir. Yeni bir kaynak (`gift_sends` satırı) yarattığı için
   * varsayılan 201 Created döner.
   *
   * **`@RateLimit` + `IdempotencyInterceptor` BİRLİKTE, ÇÜNKÜ İKİ FARKLI
   * SORUNU ÇÖZERLER:**
   *   - `IdempotencyInterceptor` (zorunlu `Idempotency-Key` başlığı):
   *     **"aynı istek İKİ KEZ tahsil edilmesin"**. Hediye bir TRANSFER
   *     olduğundan çift yürütme parayı İKİ KEZ taşır — istemci zaman
   *     aşımından sonra tekrar denediğinde kullanıcı farkında olmadan iki
   *     hediye göndermiş olurdu. Piyasa alımı ve tribün bileti ile AYNI
   *     desen (`@IdempotencyScope('player')` → kilit anahtarı `request.
   *     player.id`'dir, yani anahtar başka bir oyuncuya GEÇİRİLEMEZ).
   *   - `@RateLimit`: "ne kadar SIK" — idempotency anahtarı her istekte
   *     YENİ olduğundan hızlı ardışık istekleri DURDURMAZ. Günlük SAYI
   *     tavanı (`config/gift.config.json → dailyLimit`, 409) üçüncü ve
   *     farklı bir zaman ölçeğidir.
   */
  @RateLimit({ name: 'gift-send', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post('players/:id/gifts')
  @UseInterceptors(IdempotencyInterceptor)
  async sendGift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendGiftDto,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<SendGiftResult>> {
    assertSelf(currentPlayer.id, id);

    // İKİNCİ SAVUNMA HATTI — `@IsUUID()` dekoratörüne TEK BAŞINA güvenilmez.
    // Kök neden `MatchmakingController.join`'in doc yorumunda ayrıntılı
    // yazılıdır (docs/ARCHITECTURE.md §9.1 Hata 7): Vitest/esbuild
    // `design:paramtypes` üretmediği için `ValidationPipe` gövde
    // doğrulamasını SESSİZCE atlar. Bu kontrol olmadan geçersiz bir
    // `recipientId` repository'ye ulaşır, `WHERE p.id = $1` ham bir Postgres
    // tip hatası (`22P02 invalid input syntax for type uuid`) atar ve istemci
    // 400 yerine **500** görür. `BreedingController.breed`'in `mareId`/
    // `stallionId` kontrolüyle AYNI sınıf hata ve AYNI desen.
    //
    // NOT: `recipientId` bir YOL PARAMETRESİ DEĞİL, GÖVDE alanıdır — bu
    // yüzden `@Param('id', ParseUUIDPipe)` koruması buraya UZANMAZ; gönderen
    // (`:id`) korunurken ALICI korumasız kalırdı.
    if (!dto.recipientId || !isUUID(dto.recipientId)) {
      throw new BadRequestException('recipientId geçerli bir UUID olmalıdır.');
    }

    // `dto.amount`/`dto.currency` HAM geçirilir (`unknown` bekleyen bir
    // imzaya): doğrulama domain'dedir ve burada tip daraltmak,
    // CLAUDE.md'nin uyardığı "DTO dekoratörüne güven" tuzağını büyütürdü
    // (`SocialController.respondToFriendRequest` ile AYNI desen).
    const result = await this.sendGiftUseCase.execute(id, dto.recipientId, dto.amount, dto.currency, idempotencyKey ?? null);
    return { success: true, data: result };
  }

  /**
   * Oyuncunun hediye geçmişi (gelen + giden, tek akış). Salt okunur —
   * `Idempotency-Key` GEREKMEZ ve `@RateLimit` de uygulanmaz (okuma, para
   * hareketi üretmez; `GetSocialOverviewUseCase`'in uç noktasıyla AYNI
   * durum).
   */
  @Get('players/:id/gifts')
  @HttpCode(HttpStatus.OK)
  async listGifts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<GiftView[]>> {
    assertSelf(currentPlayer.id, id);
    const gifts = await this.listMyGiftsUseCase.execute(id);
    return { success: true, data: gifts };
  }
}
