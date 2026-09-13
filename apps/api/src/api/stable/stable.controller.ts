import { Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ApiSuccess, StableSummaryView, StableUpgradeResult } from '@at-sevdalisi/shared-types';
import { GetStableSummaryUseCase } from '../../application/use-cases/get-stable-summary.use-case';
import { UpgradeStableUseCase } from '../../application/use-cases/upgrade-stable.use-case';

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

  @Get(':id/stable-summary')
  async getStableSummary(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<StableSummaryView>> {
    const summary = await this.getStableSummaryUseCase.execute(id);
    return { success: true, data: summary };
  }

  // Yeni bir KAYNAK yaratmaz (bir sonraki seviyeye geçer) —
  // `TrainingController.train`/`CareController.care` ile AYNI gerekçeyle
  // 200 OK döner (201 Created DEĞİL).
  @Post(':id/stable/upgrade')
  @HttpCode(HttpStatus.OK)
  async upgradeStable(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<StableUpgradeResult>> {
    const result = await this.upgradeStableUseCase.execute(id);
    return { success: true, data: result };
  }
}
