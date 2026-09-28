import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type { ApiSuccess, RaceLobbyView } from '@at-sevdalisi/shared-types';
import { CreateRaceUseCase } from '../../application/use-cases/create-race.use-case';
import { JoinRaceUseCase } from '../../application/use-cases/join-race.use-case';
import { LeaveRaceUseCase } from '../../application/use-cases/leave-race.use-case';
import { ListLobbyRacesUseCase } from '../../application/use-cases/list-lobby-races.use-case';
import { SetEntryReadyUseCase } from '../../application/use-cases/set-entry-ready.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { CreateRaceDto } from './dto/create-race.dto';
import { EntryReadyDto } from './dto/entry-ready.dto';
import { JoinRaceDto } from './dto/join-race.dto';

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
  constructor(
    @Inject(CreateRaceUseCase) private readonly createRaceUseCase: CreateRaceUseCase,
    @Inject(JoinRaceUseCase) private readonly joinRaceUseCase: JoinRaceUseCase,
    @Inject(ListLobbyRacesUseCase) private readonly listLobbyRacesUseCase: ListLobbyRacesUseCase,
    @Inject(SetEntryReadyUseCase) private readonly setEntryReadyUseCase: SetEntryReadyUseCase,
    @Inject(LeaveRaceUseCase) private readonly leaveRaceUseCase: LeaveRaceUseCase,
  ) {}

  /**
   * Lobi listesi — şu an katılabilecek yarışlar (brief §5, §42 PHASE 3).
   *
   * **`limit` DIŞINDA PARAMETRE YOKTUR** ve bu bilinçlidir: liste her zaman
   * `status = 'scheduled'` yarışları döner (lobi tanımı budur) ve sıralama
   * sabittir (en yakın başlayacak en üstte). İstemciye "hangi durumdaki
   * yarışlar" diye sormak, ona anlamsız bir seçim sunmak olurdu —
   * gerekçenin tamamı `ListLobbyRacesUseCase` doc yorumunda.
   *
   * **`@CurrentPlayer()` YOKTUR:** liste oyuncuya ÖZEL DEĞİLDİR — aynı
   * yarışlar herkese görünür. Buna rağmen uç KORUMALIDIR: `AuthGuard`
   * `app.module.ts`'te `APP_GUARD` olarak global kayıtlıdır ve `@Public()`
   * işareti olmayan her rota token ister. Lobi listesini token'sız açmak,
   * `maxOpenRacesPerPlayer` tavanının koruduğu "keşif listesini çöple
   * doldurma" yüzeyini (brief §26) anonim erişime açardı.
   *
   * **`@RateLimit` VAR, `IdempotencyInterceptor` YOK:** okuma yoludur,
   * hiçbir şey yazmaz — ama sınırsız bırakmak veritabanını tekrarlı
   * taramaya sokar. Tavan `join`'den YÜKSEK (60), çünkü lobi listesi bir
   * akışın parçasıdır: oyuncu listeyi yeniler, filtreler, geri döner.
   */
  @RateLimit({ name: 'race-list', limit: 60, windowSeconds: 60, keyBy: 'player' })
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@Query('limit') limit: string | undefined): Promise<ApiSuccess<RaceLobbyView[]>> {
    // `limit` HAM geçirilir (`unknown` alan bir imzaya) — `create`/`join`
    // ile AYNI desen: sorgu parametresi her zaman metindir ve `?limit=abc`
    // gerçekten gelebilir. Daraltma/kırpma `normalizeLobbyListLimit`'tedir.
    const races = await this.listLobbyRacesUseCase.execute(limit);
    return { success: true, data: races };
  }

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

  /**
   * Yarışa KATILMA — **PARA YOLU.** Brief §2 gereği giriş ücreti burada
   * tahsil edilir ve `races.prize_pool`'a eklenir.
   *
   * **`Idempotency-Key` ZORUNLUDUR** — `grandstand.controller.ts`'teki
   * `purchaseTicket` ile AYNI desen ve AYNI gerekçe: istemci zaman
   * aşımından sonra aynı isteği tekrarlarsa İKİNCİ kez ücret
   * alınmamalıdır. `@IdempotencyScope('player')` — kapsam `:id` DEĞİL,
   * kimliği doğrulanmış oyuncudur; `:id` burada yarışın id'sidir ve
   * anahtarın kapsamı OLMAMALIDIR (aksi hâlde aynı oyuncunun FARKLI
   * yarışlara aynı anahtarla yapacağı katılımlar yanlışlıkla "aynı istek"
   * sayılırdı).
   *
   * **200 OK, 201 DEĞİL** — `purchaseTicket` ile AYNI sınıflandırma:
   * yeni bir satır (`race_entries`) doğar ama yanıt gövdesi o satırın
   * kendisi değil, GÜNCELLENMİŞ lobi görünümüdür (`RaceLobbyView`) ve
   * katılımın kendi adresi yoktur (`GET /race-entries/:id` diye bir uç
   * yoktur). İstemcinin bir sonraki adımı zaten lobidir.
   *
   * `RateLimit` — `docs/SECURITY.md` §7'nin "kritik ekonomi
   * endpoint'leri" kategorisi; `keyBy: 'player'` (IP değil), çünkü limitin
   * amacı paylaşılan bir IP'yi cezalandırmak değil, tek bir hesabın
   * saniyeler içinde onlarca yarışa katılıp havuzları kirletmesini
   * durdurmaktır. Tavan `purchaseTicket`'ın 20'sinden YÜKSEK (30) çünkü
   * katılım gerçek bir yarış seçimi akışının parçasıdır: oyuncu birkaç
   * yarış arasında gidip gelip karar verebilir ve lobi listesi
   * yenilendikçe aynı yarışa dönmesi meşrudur.
   */
  @RateLimit({ name: 'race-join', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async join(
    // `raceId` YOLdan gelir ve `ParseUUIDPipe` ile elenir — gövde
    // alanlarının aksine pipe'lar esbuild altında da çalışır.
    @Param('id', ParseUUIDPipe) id: string,
    // `dto` HAM geçirilir (alanları `unknown` olan bir imzaya) — `create`
    // ile AYNI desen; daraltmayı `validateRaceJoin` yapar.
    @Body() dto: JoinRaceDto,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    // Katılan oyuncu **TOKEN'DAN** gelir, gövdeden ASLA (CLAUDE.md
    // "SUNUCU OTORİTESİ").
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceLobbyView>> {
    const race = await this.joinRaceUseCase.execute(id, currentPlayer.id, dto, idempotencyKey ?? null);
    return { success: true, data: race };
  }

  /**
   * READY düğmesi — oyuncunun KENDİ katılım durumunu bildirmesi
   * (brief §6, §42 PHASE 3).
   *
   * **`Idempotency-Key` YOKTUR — ve bu bilinçli bir AYRIMDIR:** bu uç
   * bakiye, ödül havuzu ve deftere DOKUNMAZ; `status` yalnızca "hazırım"
   * bildirimidir. Aynı değeri iki kez yazmak sonucu değiştirmediği için
   * (`checkEntryReadyable` mevcut duruma bakmaz) brief §54'ün zorunlu
   * kıldığı `Idempotency-Key` kapsamına GİRMEZ — `join` ile AYNI
   * sınıflandırma mantığı, ters yönden.
   *
   * **200 OK:** `purchaseTicket`/`join` ile AYNI sınıflandırma — yanıt
   * gövdesi GÜNCELLENMİŞ lobi görünümüdür, yeni bir kaynak adresi doğmaz.
   *
   * **403 DEĞİL 404:** oyuncunun bu yarışta katılımı yoksa
   * `RACE_ENTRY_NOT_FOUND` döner. Gerekçe `RaceEntryNotFoundError` doc
   * yorumunda: ortada işlem yapılacak bir KAYNAK yoktur ve 403 dönmek
   * "burada bir katılım var ama senin değil" bilgisini sızdırırdı.
   *
   * Tavan `join` ile AYNI (30): ikisi de bir yarış seçme akışının
   * parçasıdır ve oyuncu birkaç yarış arasında gidip gelirken READY
   * düğmesine art arda basabilir.
   */
  @RateLimit({ name: 'race-ready', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @Post(':id/ready')
  @HttpCode(HttpStatus.OK)
  async ready(
    @Param('id', ParseUUIDPipe) id: string,
    // `dto` HAM geçirilir — daraltmayı `validateEntryReady` yapar.
    @Body() dto: EntryReadyDto,
    // Oyuncu **TOKEN'DAN** gelir, gövdeden ASLA (CLAUDE.md "SUNUCU
    // OTORİTESİ"): başkasının katılım satırı bu uçtan değiştirilemez.
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceLobbyView>> {
    const race = await this.setEntryReadyUseCase.execute(id, currentPlayer.id, dto);
    return { success: true, data: race };
  }

  /**
   * Yarıştan AYRILMA — **PARA YOLU (ters yönden).** Brief §20 `REFUND`,
   * §42 PHASE 4c. Giriş ücreti iade edilir, `races.prize_pool` aynı tutar
   * kadar azaltılır ve katılım `cancelled` olur — hepsi TEK transaction.
   *
   * **`Idempotency-Key` ZORUNLUDUR** — `join` ile AYNI desen ve AYNI
   * gerekçe, ama yönü ters: istemci zaman aşımından sonra aynı isteği
   * tekrarlarsa İKİNCİ kez İADE alınmamalıdır. `@IdempotencyScope('player')`
   * — kapsam `:id` (yarışın id'si) DEĞİL, kimliği doğrulanmış oyuncudur.
   *
   * **200 OK, 204 DEĞİL** — `join`/`ready` ile AYNI sınıflandırma: yanıt
   * gövdesi GÜNCELLENMİŞ lobi görünümüdür (`RaceLobbyView`) ve istemcinin
   * bir sonraki adımı zaten lobidir. 204 seçilseydi istemci havuzun
   * KÜÇÜLDÜĞÜNÜ görmek için ikinci bir istek atmak zorunda kalırdı.
   *
   * **GÖVDE YOKTUR.** Ayrılma isteğinin tek parametresi yoldan gelen
   * `raceId`'dir; `@Body()` almak, esbuild altında doğrulanmayan bir yüzey
   * açardı (CLAUDE.md kural 5) ve karşılığında hiçbir şey vermezdi.
   *
   * Tavan `join` ile AYNI (30): ikisi de bir yarış seçme/terk etme
   * akışının parçasıdır.
   */
  @RateLimit({ name: 'race-leave', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async leave(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    // Ayrılan oyuncu **TOKEN'DAN** gelir, gövdeden ASLA (CLAUDE.md
    // "SUNUCU OTORİTESİ"): başkasının katılımı bu uçtan iptal edilemez.
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceLobbyView>> {
    const race = await this.leaveRaceUseCase.execute(id, currentPlayer.id, idempotencyKey ?? null);
    return { success: true, data: race };
  }
}
