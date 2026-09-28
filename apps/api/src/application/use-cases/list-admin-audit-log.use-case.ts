import { Inject, Injectable } from '@nestjs/common';
import type { AdminAuditLogResult, AdminAuditLogView } from '@at-sevdalisi/shared-types';
import { assertAdmin } from '../../domain/admin/moderation-queue';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { ADMIN_REPOSITORY, type AdminRepository } from '../ports/admin.repository';

/**
 * Denetim günlüğü. `GET /admin/audit-log` (brief §34 "Finansal işlemler
 * audit log'a yazılmalı", §42 PHASE 15-B).
 *
 * **AKIŞ `ListAdminReportsUseCase` İLE AYNIDIR:** `isAdmin` (DB, önbelleksiz)
 * → `assertAdmin` (403 `ADMIN_REQUIRED`) → `listAuditLog(limit)`.
 *
 * **BU DİLİMDE GÜNLÜĞE YAZILAN TEK EYLEM** `report.status_changed`dır
 * (`UpdateReportStatusUseCase`). brief §34'ün saydığı diğer yönetim
 * işlemleri (race Cancel/Pause/Finish, kullanıcı/cüzdan/hediye ekranları)
 * HENÜZ YOKTUR — günlük okuma ayağı onlardan önce hazır edilmiştir ki
 * ilk yazma yolu eklendiğinde ayrı bir "günlüğü okuyacak uç" işi
 * doğmasın.
 *
 * **BU BİR PARA YOLU DEĞİLDİR:** günlük OKUNUR, hiçbir şey yazılmaz.
 */
@Injectable()
export class ListAdminAuditLogUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(adminId: string): Promise<AdminAuditLogResult> {
    assertAdmin(await this.adminRepository.isAdmin(adminId));

    const records = await this.adminRepository.listAuditLog(this.config.admin.auditLogLimit);

    return {
      entries: records.map(
        (record): AdminAuditLogView => ({
          id: record.id,
          admin: { playerId: record.adminId, displayName: record.adminDisplayName },
          action: record.action,
          targetType: record.targetType,
          targetId: record.targetId,
          details: record.details,
          createdAt: record.createdAt.toISOString(),
        }),
      ),
    };
  }
}
