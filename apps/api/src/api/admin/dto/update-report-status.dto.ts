import { IsIn } from 'class-validator';
import type { ReportStatus } from '@at-sevdalisi/shared-types';
import { REPORT_STATUSES } from '../../../domain/admin/moderation-queue';

/**
 * `PATCH /admin/reports/:reportId` gövdesi (brief §34, §42 PHASE 15-B).
 *
 * **`@IsIn` LİSTEYİ TEKRARLAMAZ, `domain`DEN OKUR** — `ReportPlayerDto` ile
 * AYNI desen ve AYNI gerekçe: durum kümesinin TEK kaynağı
 * `domain/admin/moderation-queue.ts` → `REPORT_STATUSES`dir
 * (`player_reports.status` DB CHECK'iyle birebir). Buraya elle yazılan
 * ikinci bir kopya, listeye durum eklendiğinde sessizce ayrışırdı. Katman
 * yönü buna izin verir: `API → Domain` TEK YÖNLÜ akışın İLERİ yönüdür.
 *
 * **BU DEKORATÖR OTORİTE DEĞİLDİR:** gerçek doğrulama `parseReportStatus`tadır
 * (`InvalidReportStatusError` → 400), çünkü esbuild altında DTO
 * dekoratörleri ATLANIR (CLAUDE.md "Kardeş tuzak"). Ayrıca dekoratör
 * yalnızca "bilinen bir durum mu" sorusunu yanıtlar; "bu duruma GEÇİLEBİLİR
 * mi" sorusu geçiş çizgesindedir ve o ancak MEVCUT durum kilit altında
 * okunduktan sonra yanıtlanabilir.
 */
export class UpdateReportStatusDto {
  @IsIn(REPORT_STATUSES)
  status!: ReportStatus;
}
