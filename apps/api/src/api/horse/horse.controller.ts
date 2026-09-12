import { BadRequestException, Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ApiSuccess, Horse } from '@at-sevdalisi/shared-types';
import { GetHorseUseCase } from '../../application/use-cases/get-horse.use-case';
import { ListHorsesByOwnerUseCase } from '../../application/use-cases/list-horses-by-owner.use-case';

/**
 * docs/API.md §4 Horses (Ahır). İş kuralı İÇERMEZ — sadece Application
 * katmanını çağırır ve sonucu docs/API.md §1.1 zarfına sarar (bkz.
 * `player.controller.ts` ile AYNI desen).
 *
 * NOT — bu dilimde yalnızca OKUMA uç noktaları (liste/detay) bağlandı.
 * `train`/`feed`/`care`/`vet`/`farrier`/`rest` (docs/API.md §4) bu
 * teslimatın KAPSAMI DIŞINDADIR — Antrenman/Bakım wiring'i sırasında
 * eklenecektir (bkz. docs/ROADMAP.md).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6'nın dersi burada BAŞTAN
 * uygulanmıştır: her bağımlılık, sınıfın kendisi token olsa bile açık
 * `@Inject()` ile enjekte edilir (Vitest/esbuild, `emitDecoratorMetadata`
 * gerektiren örtük tip tabanlı enjeksiyonu desteklemez).
 */
@Controller('horses')
export class HorseController {
  constructor(
    @Inject(GetHorseUseCase) private readonly getHorseUseCase: GetHorseUseCase,
    @Inject(ListHorsesByOwnerUseCase) private readonly listHorsesByOwnerUseCase: ListHorsesByOwnerUseCase,
  ) {}

  @Get()
  async listByOwner(@Query('ownerId') ownerId: string | undefined): Promise<ApiSuccess<Horse[]>> {
    // NOT — `ParseUUIDPipe` yerine burada elle kontrol edilir: sorgu
    // parametresi hiç GÖNDERİLMEDİĞİNDE (undefined) pipe'ın davranışı
    // belgelenmemiş bir kenar durumdur (bkz. docs/ARCHITECTURE.md §9.1
    // Hata 6 — bu projede NestJS/pg gerektiren kod yalnızca CI'da
    // doğrulanabildiğinden, belirsiz kenar durumlarından kaçınmak
    // bilinçli bir tercih). `!ownerId` kontrolü ayrıca burada TypeScript'in
    // akış analizinin (control flow analysis) `ownerId`'yi bu satırdan
    // sonra `string` olarak daraltmasını sağlar (strict null checks).
    if (!ownerId || !isUUID(ownerId)) {
      throw new BadRequestException('ownerId geçerli bir UUID olmalıdır.');
    }
    const horses = await this.listHorsesByOwnerUseCase.execute(ownerId);
    return { success: true, data: horses };
  }

  @Get(':id')
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<Horse>> {
    const horse = await this.getHorseUseCase.execute(id);
    return { success: true, data: horse };
  }
}
