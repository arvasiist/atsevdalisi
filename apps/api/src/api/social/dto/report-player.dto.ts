import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import type { ReportCategory } from '@at-sevdalisi/shared-types';
import { REPORT_CATEGORIES } from '../../../domain/social/moderation';

/**
 * `POST /players/:id/reports` gövdesi (brief §33, PHASE 15).
 *
 * **`@IsIn` LİSTEYİ TEKRARLAMAZ, `domain`DEN OKUR:** kategori kümesinin
 * TEK kaynağı `domain/social/moderation.ts` → `REPORT_CATEGORIES`dir
 * (`player_reports.category` DB CHECK'iyle birebir). Buraya elle yazılan
 * ikinci bir kopya, listeye kategori eklendiğinde sessizce ayrışırdı.
 * Katman yönü buna izin verir: `API → Domain` TEK YÖNLÜ akışın İLERİ
 * yönüdür (CLAUDE.md kural 4).
 *
 * **BU DEKORATÖR OTORİTE DEĞİLDİR:** gerçek doğrulama
 * `parseReportCategory`dedir (`InvalidReportCategoryError` → 400), çünkü
 * esbuild altında DTO dekoratörleri ATLANIR (CLAUDE.md "Kardeş tuzak").
 * Buradaki dekoratör yalnızca üretimde (derlenmiş Nest) erken/ucuz bir
 * kapıdır — `respond-friend-request.dto.ts` ile AYNI desen.
 *
 * **`@MaxLength` YOKTUR (bilinçli):** azami uzunluk
 * `config/social.config.json` → `reportReasonMaxLength`dir ve dekoratör
 * argümanı DERLEME ZAMANI sabiti olmak zorundadır; config'i buraya gömmek
 * "SİHİRLİ SAYI YOK" kuralını çiğnerdi (`send-message.dto.ts`in aynı notu).
 * Gerçek kontrol `normalizeReportReason`dadır.
 *
 * `reason` tipi `string` DEĞİL `unknown` KABUL EDİLİR (bkz.
 * `ReportPlayerUseCase.execute` imzası): istemci sayı/dizi gönderirse domain
 * `NOT_A_STRING` ile 400 döner, çökme olmaz. İSTEĞE BAĞLIDIR — boş/eksik
 * gerekçe geçerlidir ve `null`a indirgenir.
 */
export class ReportPlayerDto {
  @IsUUID()
  reportedId!: string;

  @IsIn(REPORT_CATEGORIES)
  category!: ReportCategory;

  @IsOptional()
  @IsString()
  reason?: string;
}
