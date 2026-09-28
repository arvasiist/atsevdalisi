import { Inject, Injectable } from '@nestjs/common';
import type { ReportCategory, ReportStatus } from '@at-sevdalisi/shared-types';
import type { Pool } from 'pg';
import {
  type AdminAuditLogRecord,
  type AdminReportRecord,
  type AdminRepository,
} from '../../application/ports/admin.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

/**
 * `AdminRepository`'nin PostgreSQL implementasyonu (brief §34,
 * §42 PHASE 15-B).
 *
 * **BU DOSYA `FOR UPDATE` KULLANAN İKİNCİ OKUMA-YAZMA YOLUDUR** —
 * birincisi `PostgresPlayerRepository.updateWithLock`tur (para yolu).
 * Buradaki kilit PARA İÇİN DEĞİL, GEÇİŞ KURALI içindir: iki yönetici
 * aynı şikâyeti aynı anda farklı durumlara çekerse, kilit olmadan
 * ikisi de `open` okur, ikisi de geçerli bir geçiş hesaplar ve son
 * yazan kazanır — arada bir geçiş KAYBOLUR, denetim günlüğü ise
 * gerçekleşmemiş bir sırayı anlatırdı.
 *
 * `ON DELETE RESTRICT` (migration 0041) bu dosyada bir ŞEY
 * GEREKTİRMEZ: yönetici silme diye bir yol yoktur; kısıt yalnızca
 * gelecekte biri denerse veritabanında durur.
 */

/** Kuyruk satırı — `player_reports` + İKİ `players` JOIN'i (snake_case). */
interface AdminReportDbRow {
  report_id: string;
  reporter_id: string;
  reporter_display_name: string;
  reported_id: string;
  reported_display_name: string;
  category: string;
  reason: string | null;
  status: string;
  created_at: Date;
  reviewed_by_id: string | null;
  reviewed_by_display_name: string | null;
  reviewed_at: Date | null;
}

/** Denetim günlüğü satırı — `admin_audit_log` + `players` JOIN'i. */
interface AdminAuditLogDbRow {
  id: string;
  admin_id: string;
  admin_display_name: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: Date;
}

/**
 * Kuyruk ve güncelleme sorgularının PAYLAŞTIĞI kolon listesi.
 *
 * **NEDEN TEK YERDE:** `updateReportStatusWithLock` satırı
 * `RETURNING` ile, `listReports` ise `SELECT` ile okur; iki sorgunun
 * kolon listesi ayrışırsa `AdminReportRecord` alanlarından biri
 * sessizce `undefined` olurdu. Tek sabit, bunu yapısal olarak
 * imkânsız kılar.
 */
const REPORT_COLUMNS = `
  r.id            AS report_id,
  r.reporter_id,
  reporter.display_name AS reporter_display_name,
  r.reported_id,
  reported.display_name AS reported_display_name,
  r.category,
  r.reason,
  r.status,
  r.created_at,
  r.reviewed_by   AS reviewed_by_id,
  reviewer.display_name AS reviewed_by_display_name,
  r.reviewed_at
`;

/**
 * `REPORT_COLUMNS`in gerektirdiği JOIN'ler.
 *
 * **ÜÇ AYRI JOIN, ÇÜNKÜ ÜÇ FARKLI OYUNCU:** şikâyet eden, şikâyet edilen
 * ve (varsa) ele alan yönetici. Bunları use-case içinde ayrı sorgularla
 * toplamak, kuyruk başına 2N+1 gidiş-dönüş üretirdi (N+1 —
 * `findBlockedPlayers` ile AYNI yasak). `reviewer` JOIN'i `LEFT`tir:
 * henüz ele alınmamış şikâyetler kuyruğun ÇOĞUNLUĞUDUR ve `INNER JOIN`
 * onların TAMAMINI listeden düşürürdü.
 */
const REPORT_JOINS = `
  FROM player_reports r
  JOIN players reporter ON reporter.id = r.reporter_id
  JOIN players reported ON reported.id = r.reported_id
  LEFT JOIN players reviewer ON reviewer.id = r.reviewed_by
`;

@Injectable()
export class PostgresAdminRepository implements AdminRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async isAdmin(playerId: string): Promise<boolean> {
    const result = await this.pool.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM players WHERE id = $1',
      [playerId],
    );
    // Oyuncu YOKSA `false` döner, hata DEĞİL: çağıran zaten
    // `AuthGuard`'dan geçmiş bir oyuncudur; buraya düşen `undefined`
    // (silinmiş bir hesabın token'ı) yalnızca "yönetici değil" demektir
    // ve doğru cevap 403'tür, 404 değil — kaynak oyuncunun kendisi
    // değildir.
    return result.rows[0]?.is_admin === true;
  }

  async listReports(limit: number): Promise<AdminReportRecord[]> {
    const result = await this.pool.query<AdminReportDbRow>(
      `SELECT ${REPORT_COLUMNS}
       ${REPORT_JOINS}
       ORDER BY r.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => this.rowToReport(row));
  }

  async updateReportStatusWithLock<T>(
    reportId: string,
    adminId: string,
    mutate: (report: AdminReportRecord) => { status: ReportStatus; result: T },
  ): Promise<{ report: AdminReportRecord; result: T } | null> {
    return withTransaction(this.pool, async (client) => {
      // `FOR UPDATE OF r` — yalnızca ŞİKÂYET satırı kilitlenir, JOIN'lenen
      // `players` satırları DEĞİL: onları kilitlemek, bir şikâyeti
      // kapatırken ilgisiz bir oyuncunun satırını da bloke ederdi
      // (satır kilitleri transaction boyunca tutulur).
      const current = await client.query<AdminReportDbRow>(
        `SELECT ${REPORT_COLUMNS}
         ${REPORT_JOINS}
         WHERE r.id = $1
         FOR UPDATE OF r`,
        [reportId],
      );
      const currentRow = current.rows[0];
      if (!currentRow) {
        return null;
      }

      const report = this.rowToReport(currentRow);
      // Domain kuralı (geçiş çizgesi) BURADA çalışır — fırlatırsa
      // `withTransaction` ROLLBACK eder: ne durum ne denetim kaydı
      // yazılır (bkz. port doc yorumu).
      const { status, result } = mutate(report);

      // `reviewed_by` = İŞLEMİ YAPAN yönetici (`adminId`), `report.reviewedById`
      // DEĞİL — o, bir ÖNCEKİ ele alanı taşır. İkisini karıştırmak,
      // "kim kapattı" sorusuna "onu ilk inceleyen kimdi" cevabını
      // verdirirdi; aradaki fark denetim günlüğünde görünmez olurdu.
      await client.query(
        `UPDATE player_reports
            SET status = $2, reviewed_by = $3, reviewed_at = now()
          WHERE id = $1`,
        [reportId, status, adminId],
      );

      const updated = await client.query<AdminReportDbRow>(
        `SELECT ${REPORT_COLUMNS}
         ${REPORT_JOINS}
         WHERE r.id = $1`,
        [reportId],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) {
        // Satır yukarıda `FOR UPDATE` ile okundu ve aynı transaction
        // içinde güncellendi; buraya düşmek bir PROGRAMLAMA hatasıdır.
        // Sessizce `null` dönmek, yazılmamış bir güncellemeyi başarı
        // gibi gösterirdi.
        throw new Error(`Şikâyet güncellendi ama yeniden okunamadı: ${reportId}`);
      }

      // DENETİM KAYDI — AYNI transaction (bkz. port doc yorumu: ikisi
      // ayrılsaydı geri alınmış bir güncellemenin kaydı ortada kalırdı ve
      // bu hiçbir yerde hata üretmezdi).
      await client.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          adminId,
          'report.status_changed',
          'player_report',
          reportId,
          JSON.stringify({ from: report.status, to: status }),
        ],
      );

      return { report: this.rowToReport(updatedRow), result };
    });
  }

  async listAuditLog(limit: number): Promise<AdminAuditLogRecord[]> {
    const result = await this.pool.query<AdminAuditLogDbRow>(
      `SELECT a.id, a.admin_id, admin.display_name AS admin_display_name,
              a.action, a.target_type, a.target_id, a.details, a.created_at
         FROM admin_audit_log a
         JOIN players admin ON admin.id = a.admin_id
        ORDER BY a.created_at DESC
        LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      adminDisplayName: row.admin_display_name,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      createdAt: row.created_at,
    }));
  }

  /** `AdminReportDbRow` → `AdminReportRecord` (snake_case → camelCase). */
  private rowToReport(row: AdminReportDbRow): AdminReportRecord {
    return {
      reportId: row.report_id,
      reporterId: row.reporter_id,
      reporterDisplayName: row.reporter_display_name,
      reportedId: row.reported_id,
      reportedDisplayName: row.reported_display_name,
      category: row.category as ReportCategory,
      reason: row.reason,
      status: row.status as ReportStatus,
      createdAt: row.created_at,
      reviewedById: row.reviewed_by_id,
      reviewedByDisplayName: row.reviewed_by_display_name,
      reviewedAt: row.reviewed_at,
    };
  }
}
