import { assertStaffPermission } from '../../domain/admin/staff';
import { MODERATION_REPOSITORY, type ModerationRepository } from '../ports/moderation.repository';
import { Inject, Injectable } from '@nestjs/common';
import type { AdminReportListResult, AdminReportView } from '@at-sevdalisi/shared-types';
import { REPORT_STATUS_TRANSITIONS } from '../../domain/admin/moderation-queue';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { ADMIN_REPOSITORY, type AdminRepository } from '../ports/admin.repository';

/**
 * Moderasyon kuyruğu. `GET /admin/reports` (brief §34, §42 PHASE 15-B).
 *
 * **AKIŞ — SIRA ÖNEMLİDİR:**
 *   1. `isAdmin` VERİTABANINDAN okunur (önbellek YOK — yetki iptali anında
 *      etki etmelidir; bkz. `AdminRepository.isAdmin` doc yorumu).
 *   2. `assertAdmin` — değilse `AdminRequiredError` (403 `ADMIN_REQUIRED`).
 *      Bu kapı `listReports`'tan ÖNCEdir: aksi hâlde yetkisiz bir çağıran
 *      kuyruğun VARLIĞINI (boş mu dolu mu) gözlemleyebilirdi.
 *   3. `listReports` — limit CONFIG'ten gelir (CLAUDE.md "SİHİRLİ SAYI YOK").
 *
 * **BU BİR PARA YOLU DEĞİLDİR:** hiçbir şey yazılmaz, `economy_transactions`
 * geçmez. Bu yüzden burada `withTransaction` YOKTUR; transaction yalnızca
 * durum değiştiren yolda gerekir (`UpdateReportStatusUseCase`).
 */
@Injectable()
export class ListAdminReportsUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
    @Inject(MODERATION_REPOSITORY) private readonly moderationRepository: ModerationRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(adminId: string): Promise<AdminReportListResult> {
    // 02.10.2026 (Faz 10) — moderatör de yetkili; rol her çağrıda DB'den.
    assertStaffPermission(await this.moderationRepository.findRole(adminId), 'reports.manage');

    const records = await this.adminRepository.listReports(this.config.admin.reportQueueLimit);

    return {
      reports: records.map(
        (record): AdminReportView => ({
          reportId: record.reportId,
          reporter: { playerId: record.reporterId, displayName: record.reporterDisplayName },
          reported: { playerId: record.reportedId, displayName: record.reportedDisplayName },
          category: record.category,
          reason: record.reason,
          status: record.status,
          // Geçiş çizgesi İSTEMCİYE AÇILIR, orada TEKRARLANMAZ — gerekçe
          // `AdminReportView.allowedTransitions` doc yorumunda. Kopya
          // değil, aynı sabitten ÜRETİM: `assertReportTransitionAllowed`in
          // okuduğu satır ile burada dönen liste aynı nesnedir.
          allowedTransitions: [...REPORT_STATUS_TRANSITIONS[record.status]],
          createdAt: record.createdAt.toISOString(),
          // `reviewedById` dolu ama JOIN'de görünen ad YOKSA (oyuncu
          // silinmişse) `null` döneriz: yarısı dolu bir `AdminPlayerRef`
          // üretmek (`playerId` var, `displayName` boş) istemciyi
          // "adsız oyuncu" diye bir şey olduğuna inandırırdı.
          reviewedBy:
            record.reviewedById !== null && record.reviewedByDisplayName !== null
              ? { playerId: record.reviewedById, displayName: record.reviewedByDisplayName }
              : null,
          reviewedAt: record.reviewedAt === null ? null : record.reviewedAt.toISOString(),
        }),
      ),
    };
  }
}
