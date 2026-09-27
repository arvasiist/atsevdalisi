import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import type { ApiSuccess, RaceLobbyView } from '@at-sevdalisi/shared-types';
import { CreateRaceUseCase } from '../../application/use-cases/create-race.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { CreateRaceDto } from './dto/create-race.dto';

/**
 * Yarış lobisi — oyuncunun KENDİ yarışını açması (brief §1-§7, §42 PHASE 1).
 *
 * `@Controller('races')` prefix'i `RaceTimelineController` ile PAYLAŞILIR ve
 * bu güvenlidir çünkü tam rota yolları çakışmaz: burada `POST /races`,
 * orada `GET /races/:id/timeline` (bkz. `StableController`/`PlayerController`
 * ile `RaceController`/`HorseController`'ın AYNI prefix'i paylaştığı desen).
 *
 * **İŞ KURALI İÇERMEZ** — yalnızca Application katmanını çağırır ve sonucu
 * docs/API.md §1.1 zarfına sarar. Doğrulamanın TAMAMI
 * `domain/race/lobby.ts`'tedir; buradaki DTO dekoratörleri yalnızca gerçek
 * bir HTTP sunucusunda çalışan ön kontroldür (bkz. `CreateRaceDto` doc
 * yorumu ve CLAUDE.md kural 5).
 */
@Controller('races')
export class RaceLobbyController {
  constructor(@Inject(CreateRaceUseCase) private readonly createRaceUseCase: CreateRaceUseCase) {}

  /**
   * Yeni bir yarış tanımı açar. Varsayılan **201 Created** döner — bu,
   * projedeki diğer "yeni kaynak yarat" uçlarıyla (`POST /players`,
   * `POST /horses/:id/equipment`, `POST /players/:id/breeding`) AYNI
   * sınıflandırmadır. `POST /horses/:id/practice-race`'in 200 OK
   * dönmesinden AYRIŞMASI bilinçlidir: o uç "atın gerçekleştirdiği bir
   * EYLEM" olarak modellenmiştir ve kalıcı bir kaynak adresi doğurmaz;
   * burada ise istemcinin sonradan `GET /races/:id/timeline` ve
   * (PHASE 1b) `POST /races/:id/join` ile başvurusu gereken GERÇEK bir
   * kaynak doğar, dolayısıyla 201 + gövdede `id` doğru cevaptır.
   *
   * **`@RateLimit` VAR, `IdempotencyInterceptor` YOK** — ve bu ayrım
   * bilinçlidir (tam gerekçe `CreateRaceUseCase` doc yorumunda): bu uç
   * hiçbir bakiye/ödül/envanter DEĞİŞTİRMEZ (giriş ücreti yarışa
   * KATILIRKEN alınır, PHASE 1b), bu yüzden brief §54'ün zorunlu kıldığı
   * `Idempotency-Key` kapsamına girmez. Buna karşılık "ne kadar SIK"
   * sorusu burada da geçerlidir: her istek kalıcı bir `races` satırı
   * yazar, yani sınırsız bırakmak disk ve "keşif listesini çöple
   * doldurma" (brief §26) vektörüdür. `maxOpenRacesPerPlayer` tavanı
   * (config) üçüncü ve farklı bir zaman ölçeğidir — o AÇIK yarış sayısını
   * sınırlar, bu ise istek HIZINI.
   */
  @RateLimit({ name: 'race-create', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateRaceDto,
    // Yarışı açan oyuncu **TOKEN'DAN** gelir, gövdeden ASLA — bkz.
    // `CreateRaceUseCase.execute` doc yorumu (CLAUDE.md "SUNUCU OTORİTESİ").
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceLobbyView>> {
    // `dto` HAM geçirilir (alanları `unknown` olan bir imzaya) —
    // `breeding.controller.ts`'teki `dto.foalName` ile AYNI desen: burada
    // tip daraltmak, CLAUDE.md'nin uyardığı "DTO dekoratörüne güven"
    // tuzağını büyütürdü. Daraltmayı `validateRaceCreation` yapar.
    const race = await this.createRaceUseCase.execute(currentPlayer.id, dto);
    return { success: true, data: race };
  }
}
