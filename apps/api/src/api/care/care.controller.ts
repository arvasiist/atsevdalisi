import { Body, Controller, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ApiSuccess, FeedHorseResult, PerformCareActionResult } from '@at-sevdalisi/shared-types';
import { FeedHorseUseCase } from '../../application/use-cases/feed-horse.use-case';
import { PerformCareActionUseCase } from '../../application/use-cases/perform-care-action.use-case';
import { FeedHorseDto } from './dto/feed-horse.dto';
import { PerformCareActionDto } from './dto/perform-care-action.dto';

/**
 * docs/API.md §4 Horses (Ahır) — `POST /horses/:id/care` ve `POST
 * /horses/:id/feed` (brief §11-12). `@Controller('horses')`
 * `HorseController`/`TrainingController` ile AYNI prefix'i paylaşır —
 * tam rota yolları çakışmadığı için güvenlidir (bkz. `StableController`/
 * `TrainingController`'daki AYNI desen).
 *
 * KARAR (docs/ROADMAP.md "Beşinci dilim: Bakım"): docs/API.md'nin önceki
 * taslağındaki AYRI `vet`/`farrier`/`rest` uç noktaları burada TEK
 * `/care` uç noktasına (`actionType` alanıyla) birleştirildi —
 * `TrainingController`'ın "tek endpoint + type alanı" kararıyla AYNI
 * gerekçe (domain katmanında zaten TEK bir `applyCareAction` fonksiyonu
 * var).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6/7: her bağımlılık açık
 * `@Inject()` ile enjekte edilir.
 */
@Controller('horses')
export class CareController {
  constructor(
    @Inject(PerformCareActionUseCase) private readonly performCareActionUseCase: PerformCareActionUseCase,
    @Inject(FeedHorseUseCase) private readonly feedHorseUseCase: FeedHorseUseCase,
  ) {}

  // Bakım/besleme, yeni bir KAYNAK yaratmaz — `TrainingController.train`
  // ile AYNI gerekçeyle 200 OK döner (201 Created DEĞİL).
  @Post(':id/care')
  @HttpCode(HttpStatus.OK)
  async care(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PerformCareActionDto,
  ): Promise<ApiSuccess<PerformCareActionResult>> {
    const result = await this.performCareActionUseCase.execute(id, dto.actionType);
    return { success: true, data: result };
  }

  @Post(':id/feed')
  @HttpCode(HttpStatus.OK)
  async feed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FeedHorseDto,
  ): Promise<ApiSuccess<FeedHorseResult>> {
    const result = await this.feedHorseUseCase.execute(id, dto.feedType);
    return { success: true, data: result };
  }
}
