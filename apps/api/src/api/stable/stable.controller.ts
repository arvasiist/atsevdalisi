import { Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, UseInterceptors } from '@nestjs/common';
import type { ApiSuccess, StableSummaryView, StableUpgradeResult } from '@at-sevdalisi/shared-types';
import { GetStableSummaryUseCase } from '../../application/use-cases/get-stable-summary.use-case';
import { UpgradeStableUseCase } from '../../application/use-cases/upgrade-stable.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';

/**
 * docs/API.md §4 "Ahır Özeti". İş kuralı İÇERMEZ — sadece Application
 * katmanını çağırır ve sonucu docs/API.md §1.1 zarfına sarar (bkz.
 * `player.controller.ts`/`horse.controller.ts` ile AYNI desen).
 *
 * `/players` altında yaşar (Ahır özeti kavramsal olarak bir OYUNCUYA
 * aittir, `PlayerController`'ın `/players/:id` rotasıyla AYNI prefix'i
 * paylaşır ama farklı bir path şekli olduğundan — `/players/:id` TEK
 * segment, bu ise İKİ segment — çakışma OLMAZ).
 */
@Controller('players')
export class StableController {
  constructor(
    @Inject(GetStableSummaryUseCase) private readonly getStableSummaryUseCase: GetStableSummaryUseCase,
    @Inject(UpgradeStableUseCase) private readonly upgradeStableUseCase: UpgradeStableUseCase,
  ) {}

  // AUDIT_REPORT.md Bulgu S4 hardening (bu oturum) — `assertSelf` (bkz. o
  // dosyanın doc yorumu): ahır özeti yalnızca oyuncunun KENDİSİNE
  // gösterilir.
  @Get(':id/stable-summary')
  async getStableSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<StableSummaryView>> {
    assertSelf(currentPlayer.id, id);
    const summary = await this.getStableSummaryUseCase.execute(id);
    return { success: true, data: summary };
  }

  // Yeni bir KAYNAK yaratmaz (bir sonraki seviyeye geçer) —
  // `TrainingController.train`/`CareController.care` ile AYNI gerekçeyle
  // 200 OK döner (201 Created DEĞİL).
  //
  // FAZ 1 wiring, onuncu dilim — brief §54: bu, PARA değiştiren
  // (bakiyeden düşen) bir endpoint olduğu için `Idempotency-Key` header'ı
  // artık ZORUNLUDUR (bkz. `IdempotencyInterceptor` doc yorumu). Bu, dokuzuncu
  // dilimde bilinçli olarak KAPSAM DIŞI bırakılan, projenin PARA değiştiren
  // İLK endpoint'inin geriye dönük sertleştirilmesidir — rota `/players/:id/...`
  // olduğundan `req.params.id` ZATEN `playerId`'nin kendisidir, yani
  // docs/SECURITY.md §4'ün tam olarak belirttiği `idempotency:{playerId}:{key}`
  // anahtar biçimiyle BİREBİR örtüşür (Pratik Yarış'taki `horseId` tabanlı
  // genellemeye bile gerek yok).
  @Post(':id/stable/upgrade')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async upgradeStable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<StableUpgradeResult>> {
    assertSelf(currentPlayer.id, id);
    const result = await this.upgradeStableUseCase.execute(id);
    return { success: true, data: result };
  }
}
