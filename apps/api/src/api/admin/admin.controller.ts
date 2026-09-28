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
  AdminReportListResult,
  ApiSuccess,
  UpdateReportStatusResult,
} from '@at-sevdalisi/shared-types';
import { ListAdminAuditLogUseCase } from '../../application/use-cases/list-admin-audit-log.use-case';
import { ListAdminReportsUseCase } from '../../application/use-cases/list-admin-reports.use-case';
import { UpdateReportStatusUseCase } from '../../application/use-cases/update-report-status.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';

/**
 * Yönetim (admin) uçları — brief §34 "ADMIN PANEL", §42 PHASE 15-B.
 *
 * **ÜÇ UÇ NOKTA `@Public()` DEĞİLDİR ve OLMAYACAKTIR.** Bunlar
 * `GET /players/profile/:username` gibi herkese açık okumalar DEĞİLDİR:
 * kuyruk, şikâyet eden/edilen oyuncuların kimliğini ve serbest metin
 * gerekçeyi taşır; günlük ise "kim, ne zaman, hangi kaydı değiştirdi"
 * bilgisidir. İkisi de yalnızca yöneticiye açıktır.
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
}
