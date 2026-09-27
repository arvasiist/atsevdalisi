import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ApiSuccess, BreedingResultView } from '@at-sevdalisi/shared-types';
import { BreedHorsesUseCase } from '../../application/use-cases/breed-horses.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { BreedHorsesDto } from './dto/breed-horses.dto';

/**
 * Çiftleştirme — soy ağacı veri zincirinin ÜÇÜNCÜ (yazma) parçası.
 * **BU BİR PARA YOLUDUR** (aygır başkasının ise damızlık ücreti transfer edilir).
 *
 * `@Controller()` (boş prefix) + TAM yol — `GiftController`/`FeedController`
 * ile AYNI gerekçe: uç nokta `players/:id/...` eksenindedir.
 *
 * **`assertSelf` İLE KORUNUR** — `:id` her zaman İŞLEMİ YAPAN oyuncudur
 * (kısrağın sahibi = ücreti ödeyen), hiçbir zaman "hedef" değildir. Bu,
 * IDOR'a karşı ilk kapıdır: bu satır olmadan bir oyuncu BAŞKASININ
 * bakiyesinden damızlık ücreti ödeyip tayı BAŞKASININ ahırına doğurtabilirdi.
 *
 * İş kuralı İÇERMEZ — yalnızca Application katmanını çağırır ve sonucu
 * docs/API.md §1.1 zarfına sarar.
 */
@Controller()
export class BreedingController {
  constructor(@Inject(BreedHorsesUseCase) private readonly breedHorsesUseCase: BreedHorsesUseCase) {}

  /**
   * Çiftleştirir ve tayı ANINDA doğurur (bu projede gebelik süresi
   * modellenmez — bkz. `BreedingResultView` doc yorumu). Yeni kaynaklar
   * (`horses`/`breeding_pairs`/`pedigrees` satırları) yarattığı için
   * varsayılan 201 Created döner.
   *
   * **`@RateLimit` + `IdempotencyInterceptor` BİRLİKTE, ÇÜNKÜ İKİ FARKLI
   * SORUNU ÇÖZERLER** (`GiftController.sendGift` ile AYNI gerekçe):
   *   - `IdempotencyInterceptor` (zorunlu `Idempotency-Key` başlığı):
   *     **"aynı istek İKİ KEZ yürütülmesin"**. Çiftleştirme çift
   *     yürütülürse İKİ tay doğar ve damızlık ücreti İKİ KEZ ödenir —
   *     istemci zaman aşımından sonra tekrar denediğinde kullanıcı farkında
   *     olmadan iki tay sahibi olurdu. `@IdempotencyScope('player')` →
   *     kilit anahtarı `request.player.id`'dir, yani anahtar başka bir
   *     oyuncuya GEÇİRİLEMEZ.
   *   - `@RateLimit`: "ne kadar SIK" — idempotency anahtarı her istekte
   *     YENİ olduğundan hızlı ardışık istekleri DURDURMAZ. Kısrak
   *     cooldown'ı (`breedingCooldownDays`, 409 `NOT_ELIGIBLE_FOR_BREEDING`)
   *     üçüncü ve farklı bir zaman ölçeğidir.
   */
  @RateLimit({ name: 'breeding', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post('players/:id/breeding')
  @UseInterceptors(IdempotencyInterceptor)
  async breed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BreedHorsesDto,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BreedingResultView>> {
    assertSelf(currentPlayer.id, id);

    // İKİNCİ SAVUNMA HATTI — `@IsUUID()` dekoratörlerine TEK BAŞINA
    // güvenilmez. Kök neden `MatchmakingController.join`'in doc yorumunda
    // ayrıntılı yazılıdır (docs/ARCHITECTURE.md §9.1 Hata 7): Vitest/esbuild
    // `design:paramtypes` üretmediği için `ValidationPipe` gövde
    // doğrulamasını SESSİZCE atlar. Bu kontrol olmadan geçersiz bir
    // `mareId` repository'ye ulaşır, `WHERE h.id = $1` ham bir Postgres
    // tip hatası (`22P02 invalid input syntax for type uuid`) atar ve
    // istemci 400 yerine **500** görür. Bu, `breeding.e2e-spec.ts`'in
    // "UUID olmayan id 400 döner" testinin CI'da YAKALADIĞI gerçek
    // hatadır — `horse.controller.ts`/`market.controller.ts`/
    // `matchmaking.controller.ts` ile AYNI elle `isUUID()` deseni.
    if (!dto.mareId || !isUUID(dto.mareId)) {
      throw new BadRequestException('mareId geçerli bir UUID olmalıdır.');
    }
    if (!dto.stallionId || !isUUID(dto.stallionId)) {
      throw new BadRequestException('stallionId geçerli bir UUID olmalıdır.');
    }

    // `dto.foalName` HAM geçirilir (`unknown` bekleyen bir imzaya):
    // doğrulama domain'dedir ve burada tip daraltmak, CLAUDE.md'nin
    // uyardığı "DTO dekoratörüne güven" tuzağını büyütürdü
    // (`GiftController.sendGift` ile AYNI desen).
    const result = await this.breedHorsesUseCase.execute(
      id,
      dto.mareId,
      dto.stallionId,
      dto.foalName,
      idempotencyKey ?? null,
    );
    return { success: true, data: result };
  }
}
