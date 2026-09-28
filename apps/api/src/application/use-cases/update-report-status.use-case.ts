import { Inject, Injectable } from '@nestjs/common';
import type { ReportStatus, UpdateReportStatusResult } from '@at-sevdalisi/shared-types';
import { ReportNotFoundError } from '../../domain/admin/errors';
import {
  assertAdmin,
  assertReportTransitionAllowed,
  parseReportStatus,
} from '../../domain/admin/moderation-queue';
import { ADMIN_REPOSITORY, type AdminRepository } from '../ports/admin.repository';

/**
 * Şikâyet durumunu değiştirir. `PATCH /admin/reports/:reportId`
 * (brief §34, §42 PHASE 15-B).
 *
 * **AKIŞ — SIRA ÖNEMLİDİR:**
 *   1. `isAdmin` (DB) → `assertAdmin` (403 `ADMIN_REQUIRED`).
 *   2. `parseReportStatus` — SAF doğrulama (400 `INVALID_REPORT_STATUS`).
 *      Yetki kontrolünden SONRA: yetkisiz bir çağıranın gönderdiği gövdenin
 *      geçerli olup olmadığını öğrenmesi gerekmez.
 *   3. `updateReportStatusWithLock` — satır `FOR UPDATE` ile kilitlenir ve
 *      `assertReportTransitionAllowed` **KİLİDİN İÇİNDE** çalışır.
 *
 * **GEÇİŞ KURALI NEDEN USE-CASE'TE DEĞİL, KİLİDİN İÇİNDE:** mevcut durum
 * yalnızca kilit altında okunduğunda GÜVENİLİRDİR. Dışarıda okunan bir
 * `status` ile karar vermek, iki yönetici aynı anda farklı durumlar
 * yazdığında yarış koşuluna düşerdi (bkz. `AdminRepository` port doc
 * yorumu). Bu yüzden kural bir CALLBACK olarak repository'ye geçer —
 * domain fonksiyonu framework'süz kalır, çağrıldığı yer transaction'ın
 * içidir.
 *
 * **DENETİM KAYDI:** `report.status_changed` + `{ from, to }`, güncellemeyle
 * AYNI transaction'da repository tarafından yazılır. Use-case burada
 * loglamaz: ayrı bir yazma olsaydı geri alınmış bir güncellemenin kaydı
 * ortada kalırdı ve bu hiçbir yerde hata üretmezdi.
 *
 * **BU BİR PARA YOLU DEĞİLDİR:** `players` satırına dokunulmaz,
 * `economy_transactions` geçmez. Denetim günlüğü `economy_transactions`'a
 * YAZILMAZ — biri DEFTER (para hareketi), diğeri YETKİ KAYDIDIR (bkz.
 * migration 0041 notu).
 */
@Injectable()
export class UpdateReportStatusUseCase {
  constructor(@Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository) {}

  async execute(adminId: string, reportId: string, rawStatus: unknown): Promise<UpdateReportStatusResult> {
    assertAdmin(await this.adminRepository.isAdmin(adminId));

    const nextStatus: ReportStatus = parseReportStatus(rawStatus);

    const outcome = await this.adminRepository.updateReportStatusWithLock(
      reportId,
      adminId,
      (report) => {
        // Kural BURADA, kilit altında uygulanır. Fırlatırsa `withTransaction`
        // ROLLBACK eder: ne durum ne denetim kaydı yazılır.
        assertReportTransitionAllowed(report.status, nextStatus);
        // `result` kullanılmaz ama port sözleşmesi onu ZORUNLU kılar —
        // `PlayerRepository.updateWithLock` ile AYNI desen.
        return { status: nextStatus, result: undefined };
      },
    );

    if (outcome === null) {
      // Sıra bilinçli: bulunamayan bir şikâyet için 404, YETKİSİZ bir
      // çağıran için 403. Yetki kontrolü yukarıda olduğundan, var olmayan
      // bir kimliği deneyen yönetici olmayan biri 404 DEĞİL 403 görür —
      // yani kuyruktaki kimlikleri YOKLAYAMAZ (IDOR).
      throw new ReportNotFoundError(reportId);
    }

    const { report } = outcome;
    // Güncelleme az önce `reviewed_by`/`reviewed_at` YAZDI; bu üç alanın
    // herhangi biri boşsa bu bir programlama hatasıdır. Sessizce uydurma
    // bir değer dönmek (ör. `displayName: ''`), yarısı dolu bir
    // `AdminPlayerRef` üretir ve istemciyi "adsız yönetici" diye bir şey
    // olduğuna inandırırdı — yazılmamış bir güncellemeyi başarı gibi
    // göstermenin sessiz hâli.
    if (
      report.reviewedById === null ||
      report.reviewedAt === null ||
      report.reviewedByDisplayName === null
    ) {
      throw new Error(`Şikâyet güncellendi ama ele alan bilgisi okunamadı: ${reportId}`);
    }

    return {
      reportId: report.reportId,
      status: report.status,
      // `reviewedBy` burada `AdminPlayerRef`tir (`AdminReportView`teki
      // `| null` DEĞİL): bu uç nokta yalnızca AZ ÖNCE yazan yöneticiyi
      // döndürür ve o da çağıranın kendisidir. Görünen ad JOIN'den gelir.
      reviewedBy: { playerId: report.reviewedById, displayName: report.reviewedByDisplayName },
      reviewedAt: report.reviewedAt.toISOString(),
    };
  }
}
