import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import type { ApiSuccess, BuyFeedResult, FeedInventoryView, FeedStatusView } from '@at-sevdalisi/shared-types';
import { BuyFeedUseCase } from '../../application/use-cases/buy-feed.use-case';
import { GetFeedInventoryUseCase } from '../../application/use-cases/get-feed-inventory.use-case';
import { GetHorseFeedStatusUseCase } from '../../application/use-cases/get-horse-feed-status.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { BuyFeedDto } from './dto/buy-feed.dto';

/**
 * Yem envanteri + yem dükkânı — bu turda EKLENDİ. brief §12 Beslenme.
 *
 * ÜÇ UÇ NOKTA, İKİ FARKLI KAYNAK EKSENİ (bu yüzden TEK `@Controller()`
 * altında tam yollar kullanılır — `@Controller('players')` ya da
 * `@Controller('horses')` seçilseydi diğer eksen yanlış prefix alırdı):
 *  - `GET  /players/:id/feed-inventory` — oyuncunun stoğu + kalem kataloğu.
 *  - `POST /players/:id/feed-inventory/:type/buy` — elmasla satın alma.
 *  - `GET  /horses/:id/feed-status` — bir atın stoğu + günlük kalan hakkı.
 *
 * `@Controller()` (boş prefix) + tam yollar Nest'te geçerlidir ve
 * `HorseController`/`TrainingController`/`CareController`'ın paylaştığı
 * `horses` prefix'iyle ÇAKIŞMAZ: `horses/:id/feed-status` iki segmentli bir
 * GET'tir, `horses/:id/feed` ise bir POST'tur.
 *
 * İş kuralı İÇERMEZ — yalnızca Application katmanını çağırır ve sonucu
 * docs/API.md §1.1 zarfına sarar (`FarmController` ile AYNI desen).
 */
@Controller()
export class FeedController {
  constructor(
    @Inject(GetFeedInventoryUseCase) private readonly getFeedInventoryUseCase: GetFeedInventoryUseCase,
    @Inject(GetHorseFeedStatusUseCase) private readonly getHorseFeedStatusUseCase: GetHorseFeedStatusUseCase,
    @Inject(BuyFeedUseCase) private readonly buyFeedUseCase: BuyFeedUseCase,
  ) {}

  // Envanter, oyuncunun NE KADAR harcayabileceğini gösterir (para/envanter
  // düzeyinde bilgi) — bu yüzden yalnızca oyuncunun KENDİSİNE gösterilir
  // (`FarmController.getFarm` ile AYNI gerekçe, AUDIT_REPORT.md Bulgu S4).
  @Get('players/:id/feed-inventory')
  async getInventory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<FeedInventoryView>> {
    assertSelf(currentPlayer.id, id);
    const inventory = await this.getFeedInventoryUseCase.execute(id);
    return { success: true, data: inventory };
  }

  // brief §54: bu uç nokta PARA harcadığı için `Idempotency-Key` header'ı
  // ZORUNLUDUR. Rota `/players/:id/...` olduğundan interceptor kapsam
  // kimliği olarak `req.params.id`'yi (playerId) kullanır — docs/SECURITY.md
  // §4'ün `idempotency:{playerId}:{key}` biçimiyle BİREBİR örtüşür
  // (`FarmController.upgradeFacility` ile AYNI desen).
  //
  // Yeni bir KAYNAK yaratmaz (mevcut bir kalemin stoğunu artırır) — bu
  // yüzden 200 OK döner (201 Created DEĞİL).
  @Post('players/:id/feed-inventory/:type/buy')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async buyFeed(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type') type: string,
    @Body() dto: BuyFeedDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BuyFeedResult>> {
    assertSelf(currentPlayer.id, id);
    // `:type` yol parametresi serbest metindir; doğrulama DTO'ya değil
    // DOMAIN'e aittir (CLAUDE.md "Kardeş tuzak": `@IsIn` esbuild altında
    // sessizce atlanır) — bkz. `domain/care/validation.ts` `parseFeedType`.
    // Aynı gerekçe `dto.count` için de geçerlidir.
    const result = await this.buyFeedUseCase.execute(id, type, dto.count);
    return { success: true, data: result };
  }

  // Atın durumu — `CareController.feed` ile AYNI sahiplik kontrolü
  // (`HorseOwnerGuardByParam`), çünkü bu görünüm atın SAHİBİNİN stoğunu da
  // taşır; korumasız bırakılsaydı başka bir oyuncunun envanteri sızardı.
  @UseGuards(HorseOwnerGuardByParam)
  @Get('horses/:id/feed-status')
  async getStatus(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<FeedStatusView>> {
    const status = await this.getHorseFeedStatusUseCase.execute(id);
    return { success: true, data: status };
  }
}
