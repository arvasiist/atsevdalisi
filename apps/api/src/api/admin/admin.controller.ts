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
} from '@nestjs/common';
import type {
  AdminAuditLogResult,
  AdminPlayerListResult,
  AdminRaceListResult,
  AdminReportListResult,
  AdminTransactionListResult,
  ApiSuccess,
  UpdateReportStatusResult,
} from '@at-sevdalisi/shared-types';
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
 * **ALTI UÇ NOKTANIN HİÇBİRİ `@Public()` DEĞİLDİR ve OLMAYACAKTIR.**
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
 * **`@RateLimit` YALNIZCA YAZMA UCUNDA.** Okuma uçları bir yöneticinin
 * paneli açtığında saniyede birkaç kez çağrılır ve limit koymak, gerçek
 * bir yöneticiyi meşru işinden alıkoyardı; asıl savunma yetki kapısının
 * kendisidir. `PATCH` ise kalıcı bir durum değiştirir ve denetim günlüğüne
 * satır yazar — burada limit, günlüğü gürültüye boğacak bir döngüye karşı
 * ikinci hattır (`SocialController.blockPlayer` ile AYNI sınıf gerekçe).
 * Bu denge, ALTI okuma ucundan sonra da değişmedi: yeni uçların hiçbiri
 * yazmaz, dolayısıyla hiçbiri limit gerektirmez.
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
   * Yarış listesi — brief §34 "Races". YALNIZCA OKUMADIR.
   *
   * brief'in "Cancel Pause Finish işlemleri kontrollü şekilde
   * yapılabilmeli" kısmı bu dilimde YOKTUR ve bilinçli olarak bu
   * controller'a eklenmemiştir: "Cancel" bir PARA YOLUDUR (katılım
   * ücretlerinin iadesi + aynı transaction'da defter kaydı + denetim
   * günlüğü) ve iade mantığı yazılmadan durum değiştirmek ödenmiş parayı
   * havuzda bırakırdı.
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
}
