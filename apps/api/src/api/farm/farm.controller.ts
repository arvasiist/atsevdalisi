import { Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, UseInterceptors } from '@nestjs/common';
import type { ApiSuccess, FacilityUpgradeResult, FarmSummaryView } from '@at-sevdalisi/shared-types';
import { GetFarmSummaryUseCase } from '../../application/use-cases/get-farm-summary.use-case';
import { UpgradeFacilityUseCase } from '../../application/use-cases/upgrade-facility.use-case';
import { parseFacilityType } from '../../domain/farm/validation';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';

/**
 * brief §32 "Çiftlik" — `GET /players/:id/farm` ve
 * `POST /players/:id/farm/facilities/:type/upgrade`. Bu turda EKLENDİ.
 *
 * İş kuralı İÇERMEZ — yalnızca Application katmanını çağırır ve sonucu
 * docs/API.md §1.1 zarfına sarar (`StableController` ile AYNI desen).
 *
 * `/players` altında yaşar çünkü çiftlik kavramsal olarak bir OYUNCUYA
 * aittir; `StableController` ile AYNI prefix'i paylaşır ama path şekilleri
 * farklı olduğundan (`:id/farm` vs `:id/stable-summary`) çakışma OLMAZ.
 * Çiftlik tesisleri ahırı KAPSAMAZ — ahırın kendi yükseltmesi
 * `POST /players/:id/stable/upgrade`'tedir (bkz. `domain/farm/farm.ts`
 * dosya başı doc yorumu).
 */
@Controller('players')
export class FarmController {
  constructor(
    @Inject(GetFarmSummaryUseCase) private readonly getFarmSummaryUseCase: GetFarmSummaryUseCase,
    @Inject(UpgradeFacilityUseCase) private readonly upgradeFacilityUseCase: UpgradeFacilityUseCase,
  ) {}

  // AUDIT_REPORT.md Bulgu S4 hardening ile AYNI gerekçe — `assertSelf`:
  // çiftlik özeti yalnızca oyuncunun KENDİSİNE gösterilir (para/envanter
  // düzeyinde bilgi taşır).
  @Get(':id/farm')
  async getFarm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<FarmSummaryView>> {
    assertSelf(currentPlayer.id, id);
    const summary = await this.getFarmSummaryUseCase.execute(id);
    return { success: true, data: summary };
  }

  // Yeni bir KAYNAK yaratmaz (bir sonraki seviyeye geçer) —
  // `StableController.upgradeStable`/`TrainingController.train` ile AYNI
  // gerekçeyle 200 OK döner (201 Created DEĞİL). İlk inşa da aynı uçtan
  // geçer; ayrı bir "inşa et" rotası BİLİNÇLİ olarak yoktur (bkz.
  // `UpgradeFacilityUseCase` doc yorumu).
  //
  // brief §54: bu uç nokta PARA harcadığı için `Idempotency-Key` header'ı
  // ZORUNLUDUR. Rota `/players/:id/...` olduğundan `IdempotencyInterceptor`
  // kapsam kimliği olarak `req.params.id`'yi (yani `playerId`) kullanır —
  // docs/SECURITY.md §4'ün `idempotency:{playerId}:{key}` biçimiyle BİREBİR
  // örtüşür; ayrı bir `@IdempotencyScope` gerekmez.
  @Post(':id/farm/facilities/:type/upgrade')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async upgradeFacility(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type') type: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<FacilityUpgradeResult>> {
    assertSelf(currentPlayer.id, id);
    // `:type` yol parametresi serbest metindir; doğrulama DTO'ya değil
    // DOMAIN'e aittir (CLAUDE.md "Kardeş tuzak": `@IsIn` esbuild altında
    // sessizce atlanır) — bkz. `domain/farm/validation.ts`.
    const result = await this.upgradeFacilityUseCase.execute(id, parseFacilityType(type));
    return { success: true, data: result };
  }
}
