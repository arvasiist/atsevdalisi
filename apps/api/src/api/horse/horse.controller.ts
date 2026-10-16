import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ApiSuccess, HorseCareerView, HorsePedigreeView, PublicHorse } from '@at-sevdalisi/shared-types';
import { GetHorseCareerUseCase } from '../../application/use-cases/get-horse-career.use-case';
import { GetHorsePedigreeUseCase } from '../../application/use-cases/get-horse-pedigree.use-case';
import { GetHorseUseCase } from '../../application/use-cases/get-horse.use-case';
import { ListHorsesByOwnerUseCase } from '../../application/use-cases/list-horses-by-owner.use-case';
import { RetireHorseUseCase } from '../../application/use-cases/retire-horse.use-case';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { Public } from '../auth/public.decorator';
import { toPublicHorse } from '../dto/horse.mapper';

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
 *
 * AUDIT_AND_HARDENING Öncelik 5 (bu oturum) — bu iki uç nokta daha önce
 * Application katmanından dönen ham `Horse`'u (gerçek `potential` DAHİL)
 * DOĞRUDAN JSON'a serialize ediyordu; docs/SECURITY.md §9'un gizlilik
 * kuralı FİİLEN uygulanmıyordu. Şimdi `toPublicHorse` (bkz.
 * `apps/api/src/api/dto/horse.mapper.ts`) ile dönüştürülür — bu, bir
 * Application/Domain değişikliği DEĞİL, salt SUNUM katmanı düzeltmesidir.
 *
 * AUDIT_REPORT.md Bulgu S4 hardening (bu oturum) — `listByOwner` artık
 * yalnızca KENDİ atlarını isteyen oyuncuya (`assertSelf`) 200 döner.
 * `getById` ise BİLEREK `@Public()` kalır: At Pazarı tarama akışı (`GET
 * /market/listings` → her ilanın `horseId`'si) başka bir oyuncunun atının
 * (zaten `toPublicHorse` ile gizli statlardan arındırılmış) PUBLIC
 * profiline bakabilmeyi GEREKTİRİR — bu S4'ün belirttiği "geniş okuma"
 * sorunuyla AYNI KATEGORİDE DEĞİLDİR (tek bir at, tek bir sahibi ifşa
 * etmez; `ownerId` zaten `PublicHorse`'ta bulunur ve pazarda satılan bir
 * atın kim tarafından satıldığını bilmek meşru bir kullanım örneğidir).
 */
@Controller('horses')
export class HorseController {
  constructor(
    @Inject(GetHorseUseCase) private readonly getHorseUseCase: GetHorseUseCase,
    @Inject(ListHorsesByOwnerUseCase) private readonly listHorsesByOwnerUseCase: ListHorsesByOwnerUseCase,
    @Inject(GetHorsePedigreeUseCase) private readonly getHorsePedigreeUseCase: GetHorsePedigreeUseCase,
    @Inject(RetireHorseUseCase) private readonly retireHorseUseCase: RetireHorseUseCase,
    @Inject(GetHorseCareerUseCase) private readonly getHorseCareerUseCase: GetHorseCareerUseCase,
  ) {}

  @Get()
  async listByOwner(
    @Query('ownerId') ownerId: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PublicHorse[]>> {
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
    assertSelf(currentPlayer.id, ownerId);
    const horses = await this.listHorsesByOwnerUseCase.execute(ownerId);
    // Kişilik etiketi, sınıf gücü ve hazır olma zamanı YALNIZCA burada
    // (sahibine) eklenir; `GET :id` herkese açıktır ve bunları taşımaz.
    return {
      success: true,
      data: horses.map(({ horse, personality, racingPower, raceReadyAt, ageMonths, lifeStage, stats }) => ({
        ...toPublicHorse(horse),
        ageMonths,
        lifeStage,
        ...(stats ? { stats } : {}),
        ...(personality ? { personality } : {}),
        ...(racingPower !== null ? { racingPower } : {}),
        ...(raceReadyAt !== null ? { raceReadyAt } : {}),
      })),
    };
  }

  /**
   * 15.10.2026 — S5: atı yarıştan emekli eder (GERİ ALINMAZ). Damızlık için
   * şarttır. Sahiplik guard'la + depoda kilit altında yeniden denetlenir; ilan,
   * açık yarış ve "son yarış atı" engelleri 409 döner. Para hareketi yok;
   * tekrar koruması durumun kendisidir (ikinci istek `HORSE_ALREADY_RETIRED`).
   */
  @RateLimit({ name: 'horse-retire', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @UseGuards(HorseOwnerGuardByParam)
  @Post(':id/retire')
  @HttpCode(200)
  async retire(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PublicHorse>> {
    const horse = await this.retireHorseUseCase.execute(currentPlayer.id, id);
    return { success: true, data: toPublicHorse(horse) };
  }

  @Public()
  @Get(':id')
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<PublicHorse>> {
    const horse = await this.getHorseUseCase.execute(id);
    return { success: true, data: toPublicHorse(horse) };
  }

  /**
   * Soy ağacı — `PedigreeTree.tsx`'in veri kaynağı (bu dilimde EKLENDİ).
   *
   * `@Public()` — `getById` ile AYNI gerekçe (yukarıdaki sınıf doc yorumu):
   * soy bilgisi zaten halka açık bir yarış atı bilgisidir ve Pazar'dan
   * başka bir oyuncunun atına bakılırken de gereklidir. `PublicHorse`'dan
   * farklı olarak burada GİZLİ STAT YOKTUR (soy ağacı performans verisi
   * değildir), bu yüzden ayrı bir mapper'a gerek duyulmaz.
   *
   * Rota çakışması YOKTUR: `GET :id` ve `GET :id/pedigree` Express'te
   * farklı segment sayılarıdır, biri diğerini gölgelemez.
   */
  /**
   * 16.10.2026 — atın yarış geçmişi + kazancı + tay sayısı (brief §3).
   * `@Public()`: sonuçlar tekrar/sıralama yüzeylerinde zaten açıktır; pazarda
   * başka oyuncunun atının geçmişini görmek meşrudur. Bakiye ya da gizli stat
   * YOKTUR.
   */
  @Public()
  @Get(':id/career')
  async getCareer(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<HorseCareerView>> {
    return { success: true, data: await this.getHorseCareerUseCase.execute(id) };
  }

  @Public()
  @Get(':id/pedigree')
  async getPedigree(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<HorsePedigreeView>> {
    const view = await this.getHorsePedigreeUseCase.execute(id);
    return { success: true, data: view };
  }
}
