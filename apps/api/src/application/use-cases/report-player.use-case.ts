import { Inject, Injectable } from '@nestjs/common';
import type { ReportPlayerResult } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import {
  assertNotSelfReport,
  normalizeReportReason,
  parseReportCategory,
} from '../../domain/social/moderation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * Oyuncu şikâyeti. `POST /players/:id/reports`.
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. `assertNotSelfReport` — kendini şikâyet (400). DB'ye gitmeden:
 *      `player_reports_not_self` CHECK'ine varmak 500 üretirdi.
 *   2. `parseReportCategory` — SAF doğrulama (400). Ucuz ve girdi hatası.
 *   3. `normalizeReportReason` — SAF doğrulama (400), `null` dönebilir.
 *   4. Hedef okunur; yoksa `PlayerNotFoundError` (404) — FK `23503` yerine
 *      anlamlı hata (`SendMessageUseCase`'in AYNI adımı).
 *   5. `saveReport` — `status` HER ZAMAN `'open'`: kuyruğa yeni düşen bir
 *      kayıttır, inceleme durumu yönetim panelinin işidir (brief §34).
 *
 * **`areFriends` ARANMAZ ve `assertNoBlock` ÇAĞRILMAZ — ikisi de
 * BİLİNÇLİDİR.** Şikâyet bir YAZMA yolu değil bir BİLDİRİM yoludur:
 *   - Arkadaşlık aransaydı, yalnızca arkadaşlar birbirini şikâyet
 *     edebilirdi — oysa asıl şikâyet edilmesi gereken kişiler çoğu zaman
 *     arkadaş olunmayanlardır (lobide rahatsız eden bir oyuncu).
 *   - `assertNoBlock` çağrılsaydı, engelleme şikâyeti de KAPATIRDI: oyuncu
 *     birini engellediği anda onu şikâyet etme hakkını da kaybederdi. Oysa
 *     sıralama tam tersidir — engelle, sonra şikâyet et.
 *
 * **İDEMPOTENT DEĞİLDİR (bilinçli):** aynı oyuncuyu iki kez şikâyet etmek
 * İKİ satır üretir. Tekrarlayan şikâyet moderasyon için başlı başına bir
 * sinyaldir; tekilleştirmek o sinyali yok ederdi (gerekçe:
 * `SocialRepository.saveReport` doc yorumu).
 *
 * **BU BİR PARA YOLU DEĞİLDİR:** `players` satırı güncellenmez,
 * `economy_transactions` geçmez.
 */
@Injectable()
export class ReportPlayerUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(
    reporterId: string,
    reportedId: string,
    rawCategory: unknown,
    rawReason: unknown,
  ): Promise<ReportPlayerResult> {
    assertNotSelfReport(reporterId, reportedId);

    const category = parseReportCategory(rawCategory);
    const reason = normalizeReportReason(rawReason, this.config.social.reportReasonMaxLength);

    const reported = await this.playerRepository.findById(reportedId);
    if (reported === null) {
      throw new PlayerNotFoundError(reportedId);
    }

    const row = await this.socialRepository.saveReport({
      reporterId,
      reportedId,
      category,
      reason,
      status: 'open',
      createdAt: new Date(),
    });

    return {
      reportId: row.reportId,
      reportedId: row.reportedId,
      category: row.category,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
