import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type {
  AdminAuditLogResult,
  AdminPlayerListResult,
  AdminRaceCancelResult,
  AdminRaceListResult,
  AdminReportListResult,
  AdminTransactionListResult,
  ApiSuccess,
  UpdateReportStatusResult,
} from '@at-sevdalisi/shared-types';
import { CancelAdminRaceUseCase } from '../../application/use-cases/cancel-admin-race.use-case';
import { ListAdminAuditLogUseCase } from '../../application/use-cases/list-admin-audit-log.use-case';
import { ListAdminPlayersUseCase } from '../../application/use-cases/list-admin-players.use-case';
import { ListAdminRacesUseCase } from '../../application/use-cases/list-admin-races.use-case';
import { ListAdminReportsUseCase } from '../../application/use-cases/list-admin-reports.use-case';
import { ListAdminTransactionsUseCase } from '../../application/use-cases/list-admin-transactions.use-case';
import { UpdateReportStatusUseCase } from '../../application/use-cases/update-report-status.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';

/**
 * Yönetim (admin) uçları — brief §34 "ADMIN PANEL", §42 PHASE 15-B.
 *
 * **YEDİ UÇ NOKTANIN HİÇBİRİ `@Public()` DEĞİLDİR ve OLMAYACAKTIR.**
 * Bunlar `GET /players/profile/:username` gibi herkese açık okumalar
 * DEĞİLDİR: kuyruk, şikâyet eden/edilen oyuncuların kimliğini ve serbest
 * metin gerekçeyi taşır; günlük "kim, ne zaman, hangi kaydı değiştirdi"
 * bilgisidir; **oyuncu listesi herkesin BAKİYESİNİ, defter listesi ise
 * tüm para hareketlerini taşır.** Hepsi yalnızca yöneticiye açıktır.
 *
 * **`:id` YOKTUR — `assertSelf` DE YOKTUR, OLMAMALIDIR.** Diğer
 * controller'ların aksine burada yol parametresi "işlemi yapan oyuncu"
 * değildir; işlemi yapan kimliği `@CurrentPlayer()` verir. Yetki kapısı
 * `players.is_admin` kolonundan HER İSTEKTE okunur (use-case'lerin ilk
 * satırı) — **token'a gömülü bir rol YOKTUR**, böylece yetki iptali
 * ANINDA etki eder (bkz. migration 0041 notu). Bu yüzden `assertSelf`i
 * buraya eklemek yanlış olurdu: karşılaştırılacak bir hedef id yoktur ve
 * eklemek "yönetici yalnızca kendi kaydını görebilir" gibi sahte bir
 * kısıt doğururdu.
 *
 * **`@RateLimit` YALNIZCA YAZMA UÇLARINDA** — `PATCH reports/:reportId`
 * ve `POST races/:raceId/cancel`. Okuma uçları bir yöneticinin paneli
 * açtığında saniyede birkaç kez çağrılır ve limit koymak, gerçek bir
 * yöneticiyi meşru işinden alıkoyardı; asıl savunma yetki kapısının
 * kendisidir. Yazma uçları ise kalıcı durum değiştirir ve denetim
 * günlüğüne satır yazar — orada limit, günlüğü (ve iptal ucunda DEFTERİ)
 * gürültüye boğacak bir döngüye karşı ikinci hattır
 * (`SocialController.blockPlayer` ile AYNI sınıf gerekçe).
 *
 * İş kuralı İÇERMEZ — yalnızca Application katmanını çağırır ve sonucu
 * docs/API.md §1.1 zarfına sarar.
 */
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(ListAdminReportsUseCase)
    private readonly listAdminReportsUseCase: ListAdminReportsUseCase,
    @Inject(UpdateReportStatusUseCase)
    private readonly updateReportStatusUseCase: UpdateReportStatusUseCase,
    @Inject(ListAdminAuditLogUseCase)
    private readonly listAdminAuditLogUseCase: ListAdminAuditLogUseCase,
    @Inject(ListAdminPlayersUseCase)
    private readonly listAdminPlayersUseCase: ListAdminPlayersUseCase,
    @Inject(ListAdminRacesUseCase)
    private readonly listAdminRacesUseCase: ListAdminRacesUseCase,
    @Inject(ListAdminTransactionsUseCase)
    private readonly listAdminTransactionsUseCase: ListAdminTransactionsUseCase,
    @Inject(CancelAdminRaceUseCase)
    private readonly cancelAdminRaceUseCase: CancelAdminRaceUseCase,
  ) {}

  /**
   * Moderasyon kuyruğu — TÜM şikâyetler (yalnızca `open` olanlar değil),
   * en yeniden eskiye. Süzgeç istemcinin işidir; sunucuda `status` süzgeci
   * "tekrarlayan şikâyet" tespitini imkânsız kılardı (bkz. port doc yorumu).
   *
   * `@Query()` YOKTUR — bu dilimde `status`/`category` parametresi
   * ALINMAZ. Alınsaydı, doğrulanmamış bir sorgu parametresi doğrudan SQL
   * `WHERE`ine girmek zorunda kalırdı; liste zaten `reportQueueLimit` ile
   * sınırlıdır.
   */
  @Get('reports')
  async listReports(
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminReportListResult>> {
    const result = await this.listAdminReportsUseCase.execute(currentPlayer.id);
    return { success: true, data: result };
  }

  /**
   * Şikâyet durumunu değiştirir (brief §34 "kontrollü şekilde").
   *
   * **200 OK (201 DEĞİL):** yeni kaynak yaratmaz, mevcut satırın durumunu
   * değiştirir (`SocialController.respondToFriendRequest` ile AYNI gerekçe).
   *
   * `:reportId` YOL PARAMETRESİDİR ve `ParseUUIDPipe` ile doğrulanır:
   * geçersiz bir uuid veritabanına hiç gitmez (`22P02` yerine anında 400).
   * Gövdedeki `status` HAM geçirilir (`unknown` bekleyen bir imzaya):
   * doğrulama domain'dedir (`parseReportStatus`) ve burada tip daraltmak,
   * CLAUDE.md'nin uyardığı "DTO dekoratörüne güven" tuzağını büyütürdü.
   *
   * `@RateLimit` — `keyBy: 'player'` (IP değil): limitin amacı paylaşılan
   * bir ağı cezalandırmak değil, tek bir yönetici hesabının döngüye girip
   * denetim günlüğünü doldurmasını durdurmaktır.
   */
  @RateLimit({ name: 'admin-report-status', limit: 60, windowSeconds: 60, keyBy: 'player' })
  @Patch('reports/:reportId')
  @HttpCode(HttpStatus.OK)
  async updateReportStatus(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: UpdateReportStatusDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<UpdateReportStatusResult>> {
    const result = await this.updateReportStatusUseCase.execute(
      currentPlayer.id,
      reportId,
      dto.status,
    );
    return { success: true, data: result };
  }

  /**
   * Denetim günlüğü — en yeniden eskiye (brief §34 "Finansal işlemler
   * audit log'a yazılmalı.").
   *
   * **BU DİLİMDE GÜNLÜĞE YAZILAN TEK EYLEM** `report.status_changed`dır.
   * brief §34'ün saydığı diğer yönetim işlemleri (race Cancel/Pause/Finish,
   * kullanıcı/cüzdan/hediye ekranları) HENÜZ YOKTUR; okuma ayağı
   * onlardan önce hazır edilmiştir.
   */
  @Get('audit-log')
  async listAuditLog(
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminAuditLogResult>> {
    const result = await this.listAdminAuditLogUseCase.execute(currentPlayer.id);
    return { success: true, data: result };
  }

  /**
   * Oyuncu listesi — brief §34 "Users" VE "Wallet" ekranlarının ORTAK
   * karşılığı (cüzdan ayrı bir varlık değil, `players` kolonudur).
   *
   * **BU YANIT BAKİYE TAŞIR VE TAŞIMAK ZORUNDADIR** — ama yalnızca
   * yöneticiye. `@Public()` DEĞİLDİR ve olmayacaktır: `GET
   * /players/profile/:username`in bakiye sızdırmama kuralı (AUDIT Bulgu
   * S4) burada GEÇERSİZ DEĞİL, TERSİNE uygulanır — o uç herkese açık
   * olduğu için bakiyeyi gizler, bu uç ise yetki kapısı arkasında olduğu
   * için gösterir. Kapı use-case'in İLK satırındadır.
   */
  @Get('players')
  async listPlayers(
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminPlayerListResult>> {
    const result = await this.listAdminPlayersUseCase.execute(currentPlayer.id);
    return { success: true, data: result };
  }

  /**
   * Yarış listesi — brief §34 "Races". YALNIZCA OKUMADIR; yazma ayağı
   * `POST /admin/races/:raceId/cancel`tir (aşağıda).
   *
   * brief'in "Cancel Pause Finish" üçlüsünün durumu (28.09.2026):
   * `Cancel` YAPILDI · `Finish` zaten vardır ama yöneticiye özel değildir
   * (`POST /races/:id/settle`, §13.14) · **`Pause` İMKÂNSIZDIR** —
   * `races.status` CHECK'inde `paused` yoktur ve `in_progress` hiçbir
   * kod tarafından yazılmaz, yani duraklatılacak bir durum yoktur.
   */
  @Get('races')
  async listRaces(
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminRaceListResult>> {
    const result = await this.listAdminRacesUseCase.execute(currentPlayer.id);
    return { success: true, data: result };
  }

  /**
   * Ekonomi defteri — brief §34 "Transactions" VE "Gifts" ekranlarının
   * ORTAK karşılığı (hediye ayrı bir defter değil, bir `type`dır).
   *
   * **`@Query()` YOKTUR** — `GET /admin/reports` ile AYNI gerekçe:
   * doğrulanmamış bir sorgu parametresi doğrudan SQL `WHERE`ine girmek
   * zorunda kalırdı. Süzgeç istemcinin işidir.
   *
   * **BU UÇ DEFTERİ OKUR, YAZMAZ.** `economy_transactions` yalnızca para
   * yolu tarafından, kendi transaction'ı içinde yazılır.
   */
  @Get('transactions')
  async listTransactions(
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminTransactionListResult>> {
    const result = await this.listAdminTransactionsUseCase.execute(currentPlayer.id);
    return { success: true, data: result };
  }

  /**
   * Yarışı İPTAL EDER ve ödenmiş giriş ücretlerini İADE eder — brief §34
   * "Race: ... Cancel ... kontrollü şekilde yapılabilmeli."
   *
   * **BU BİR PARA YOLUDUR** (`PATCH /admin/reports/:reportId` de yazmadır
   * ama para taşımaz). `@RateLimit` bu yüzden burada da vardır:
   * `keyBy: 'player'` — limitin amacı paylaşılan bir ağı cezalandırmak
   * değil, tek bir yönetici hesabının döngüye girip defteri ve denetim
   * günlüğünü doldurmasını durdurmaktır.
   *
   * **`POST`, `PATCH` DEĞİL:** kaynak yaratmaz ama işlemin kendisi bir
   * OLAYDIR ("bu yarışı iptal et"), satırın bir alanını düzenlemek
   * değildir — gövdesi de yoktur. `POST /races/:id/settle` (yine bir
   * olay) ile AYNI biçim.
   *
   * **`@HttpCode(200)`:** 201 "yeni kaynak yaratıldı" demektir; burada
   * yaratılan bir kaynak yoktur.
   *
   * **GÖVDE YOKTUR, dolayısıyla doğrulanacak alan da yoktur:** tek
   * parametre yoldan gelen `raceId`dir ve `ParseUUIDPipe`'dan geçer
   * (pipe'lar esbuild altında da çalışır — CLAUDE.md kural 5).
   * `adminId` GÖVDEDEN DEĞİL `@CurrentPlayer()`DAN gelir; gövdeden kabul
   * etmek, bir yöneticinin başka bir yöneticinin adına iade yapmasını
   * (denetim kaydını yanlış kişiye yazdırmasını) mümkün kılardı.
   */
  @RateLimit({ name: 'admin-race-cancel', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @Post('races/:raceId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelRace(
    @Param('raceId', ParseUUIDPipe) raceId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminRaceCancelResult>> {
    const result = await this.cancelAdminRaceUseCase.execute(currentPlayer.id, raceId);
    return { success: true, data: result };
  }
}
