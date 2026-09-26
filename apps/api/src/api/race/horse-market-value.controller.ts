import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import type { ApiSuccess, HorseMarketValueView } from '@at-sevdalisi/shared-types';
import { GetHorseMarketValueUseCase } from '../../application/use-cases/get-horse-market-value.use-case';
import { Public } from '../auth/public.decorator';

/**
 * `docs/AUDIT_REPORT.md`'nin "§25 Stable görsel yönetim ekranı" bulgusunun
 * "piyasa değeri tahmini ... ayrı dilim" notunu kapatır (bu turda
 * EKLENDİ). `RecentRacesController` ile AYNI desen: `/horses` prefix'i
 * `HorseController`'la (o `HorseModule`'de yaşıyor) ÇAKIŞMAZ, bu
 * controller `RaceModule` içinde yaşar çünkü `GetHorseMarketValueUseCase`
 * hem `HORSE_REPOSITORY` hem `RACE_REPOSITORY`'ye ihtiyaç duyar — bkz. o
 * use-case'in dosya başı doc yorumu (döngüsel modül bağımlılığından
 * kaçınma gerekçesi TAM olarak orada açıklanır).
 *
 * `@Public()`: `HorseController.getById` ile AYNI gerekçe — bu, TÜRETİLMİŞ
 * tek bir sayıdır (gizli `potential`/ham `quality` SIZDIRILMAZ, bkz.
 * `HorseMarketValueView`'in doc yorumu), At Pazarı'nda başka bir
 * oyuncunun atının değerini görebilmek zaten meşru bir kullanım örneğidir.
 */
@Controller('horses')
export class HorseMarketValueController {
  constructor(
    @Inject(GetHorseMarketValueUseCase) private readonly getHorseMarketValueUseCase: GetHorseMarketValueUseCase,
  ) {}

  @Public()
  @Get(':id/market-value')
  async getMarketValue(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<HorseMarketValueView>> {
    const marketValue = await this.getHorseMarketValueUseCase.execute(id);
    return { success: true, data: marketValue };
  }
}
