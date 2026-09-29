import { Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type {
  ApiSuccess,
  HireJockeyResultView,
  Jockey,
  PlayerJockeyView,
  ReleaseJockeyResultView,
} from '@at-sevdalisi/shared-types';
import { GetPlayerJockeyUseCase } from '../../application/use-cases/get-player-jockey.use-case';
import { HireJockeyUseCase } from '../../application/use-cases/hire-jockey.use-case';
import { ListAvailableJockeysUseCase } from '../../application/use-cases/list-available-jockeys.use-case';
import { ReleaseJockeyUseCase } from '../../application/use-cases/release-jockey.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * Jokey (brief §13, §42 PHASE 6.2).
 *
 * **DÖRT UÇ, İKİ FARKLI EKSEN — bu yüzden `@Controller()` (boş prefix) +
 * TAM yollar** (`GiftController`/`SocialController` ile AYNI gerekçe):
 * vitrin `/jockeys` altında, oyuncunun kendi jokeyi ise `/players/:id/...`
 * altındadır.
 *
 * **KİMLİK, GÖVDEDEN/YOLDAN DEĞİL TOKEN'DAN GELİR.** `players/:id/jockey`
 * ucundaki `:id` işlemi YAPAN oyuncudur ve `assertSelf` ile korunur.
 * `hire` ucunda ise yol parametresi (`:jockeyId`) oyuncu DEĞİL, jokeydir —
 * bu yüzden orada `assertSelf` DEĞİL, daha güçlü olan şey vardır:
 * ödeyen taraf (`currentPlayer.id`) **hiçbir istemci girdisinden gelmez**.
 * Gövdeye/path'e bir `playerId` alanı eklenirse bu kapı kırılır ve bir
 * oyuncu BAŞKASININ bakiyesinden jokey kiralayabilir (AUDIT_REPORT.md
 * Bulgu S4 — `GiftController` ile AYNI sınıf hata).
 *
 * İş kuralı İÇERMEZ — yalnızca Application katmanını çağırır ve sonucu
 * docs/API.md §1.1 zarfına sarar.
 */
@Controller()
export class JockeyController {
  constructor(
    @Inject(ListAvailableJockeysUseCase) private readonly listAvailableJockeysUseCase: ListAvailableJockeysUseCase,
    @Inject(GetPlayerJockeyUseCase) private readonly getPlayerJockeyUseCase: GetPlayerJockeyUseCase,
    @Inject(HireJockeyUseCase) private readonly hireJockeyUseCase: HireJockeyUseCase,
    @Inject(ReleaseJockeyUseCase) private readonly releaseJockeyUseCase: ReleaseJockeyUseCase,
  ) {}

  /**
   * Kiralamaya açık jokeyler. Salt okuma — `@RateLimit` GEREKMEZ
   * (`ListMyGiftsUseCase`'in ucuyla AYNI durum).
   *
   * **KİMLİK DOĞRULAMASI İSTER** (`@CurrentPlayer` yok ama global auth
   * guard var): vitrin herkese açık olsa da bu uç, oturum açmamış bir
   * istemciye jokey listesi sunmanın bir anlamı olmadığı için korumalı
   * bırakılmıştır — mevcut tüm okuma uçlarıyla tutarlı.
   */
  @Get('jockeys')
  @HttpCode(HttpStatus.OK)
  async list(): Promise<ApiSuccess<Jockey[]>> {
    return { success: true, data: await this.listAvailableJockeysUseCase.execute() };
  }

  /**
   * Oyuncunun kiralı jokeyi — yoksa `null` (404 DEĞİL, bkz. use-case doc
   * yorumu). `:id` `assertSelf` ile korunur.
   */
  @Get('players/:id/jockey')
  @HttpCode(HttpStatus.OK)
  async getForPlayer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PlayerJockeyView | null>> {
    assertSelf(currentPlayer.id, id);
    return { success: true, data: await this.getPlayerJockeyUseCase.execute(id) };
  }

  /**
   * Jokey kiralar. **PARA YOLU** — yeni bir mülkiyet ilişkisi yarattığı
   * için varsayılan 201 Created döner.
   *
   * **`@RateLimit` VAR, `IdempotencyInterceptor` YOK — ve bu bilinçli.**
   * Çift kiralamayı engelleyen şey anahtar değil, DURUM GEÇİŞİDİR: ikinci
   * çağrı `jockeys.owner_id`yi dolu bulur ve 409 `JOCKEY_ALREADY_OWNED`
   * alır (`settleLobbyRace`in `scheduled → finished` geçişiyle AYNI desen).
   * `@RateLimit` ise FARKLI bir soruyu cevaplar — "ne kadar SIK" — ve
   * idempotency anahtarı olmadan hızlı ardışık istekleri durduracak başka
   * bir katman yoktur (PHASE 16 kuralı: işaretlenmeyen yazma rotası
   * sınırsızdır).
   *
   * **`Idempotency-Key` başlığı BİLEREK OKUNMAZ:** okunup yok sayılsaydı,
   * istemci anahtar gönderdiğinde "korunuyorum" sanırdı.
   */
  @RateLimit({ name: 'jockey-hire', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post('jockeys/:jockeyId/hire')
  async hire(
    @Param('jockeyId', ParseUUIDPipe) jockeyId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<HireJockeyResultView>> {
    const result = await this.hireJockeyUseCase.execute(jockeyId, currentPlayer.id);
    return { success: true, data: result };
  }

  /**
   * Jokeyi serbest bırakır (29.09.2026, FINAL_PROJECT_AUDIT #18).
   *
   * **200, 201 DEĞİL:** yeni bir kaynak yaratılmaz — var olan satırın
   * `owner_id`si `NULL`a çekilir. `hire` 201 döner çünkü yeni bir
   * MÜLKİYET ilişkisi doğar; burada ilişki SONA erer.
   *
   * **`@RateLimit` VAR, `IdempotencyInterceptor` YOK — `hire` ile AYNI
   * gerekçe:** çift bırakmayı engelleyen şey anahtar değil DURUM
   * GEÇİŞİDİR (ikinci çağrı `owner_id`ı `NULL` bulur ve 409
   * `JOCKEY_NOT_OWNED` alır). `@RateLimit` ise FARKLI bir soruyu
   * cevaplar — "ne kadar SIK". ⚠️ `name` `hire`dan AYRI olmak zorundadır:
   * aynı `name` tek bütçeyi bölerdi (PHASE 16 kuralı,
   * `phase16-hardening.spec.ts`).
   *
   * **PARA YOLU DEĞİL:** iade yoktur, defter satırı yazılmaz
   * (`JockeyRepository.release` doc yorumu).
   *
   * **KİMLİK TOKEN'DAN GELİR.** Yol parametresi jokeydir, oyuncu değil;
   * `currentPlayer.id` hiçbir istemci girdisinden gelmez — `hire`daki
   * aynı kapı (gövdeye/path'e `playerId` eklenirse bir oyuncu
   * BAŞKASININ jokeyini bırakabilir).
   */
  @RateLimit({ name: 'jockey-release', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post('jockeys/:jockeyId/release')
  @HttpCode(HttpStatus.OK)
  async release(
    @Param('jockeyId', ParseUUIDPipe) jockeyId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ReleaseJockeyResultView>> {
    const result = await this.releaseJockeyUseCase.execute(jockeyId, currentPlayer.id);
    return { success: true, data: result };
  }
}
