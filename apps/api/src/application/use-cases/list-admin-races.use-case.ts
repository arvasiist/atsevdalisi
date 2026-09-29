import { Inject, Injectable } from '@nestjs/common';
import type { AdminRaceListResult, AdminRaceView } from '@at-sevdalisi/shared-types';
import { assertAdmin } from '../../domain/admin/moderation-queue';
import { checkRaceCancelable } from '../../domain/admin/race-cancel';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { ADMIN_REPOSITORY, type AdminRepository } from '../ports/admin.repository';

/**
 * Yarış listesi. `GET /admin/races` (brief §34 "Admin: ... Races ... ",
 * §42 PHASE 15-B).
 *
 * **AKIŞ `ListAdminReportsUseCase` İLE AYNIDIR:** yetki kapısı ÖNCE,
 * liste SONRA; limit config'ten.
 *
 * **BU DİLİMDE YARIŞ ÜZERİNDE YAZMA YOKTUR.** brief §34 "Race: Create
 * Cancel Pause Finish işlemleri kontrollü şekilde yapılabilmeli" der; bu
 * uç yalnızca GÖRÜNTÜLEME ayağıdır. Yazma ayağı AYRI bir dilimdir ve
 * "Cancel" bir PARA YOLUDUR (katılım ücretlerinin iadesi + defter kaydı
 * + denetim günlüğü). Burada bir `PATCH` açmamak bilinçlidir: iade
 * mantığı olmadan durum değiştirmek, ödenmiş parayı havuzda bırakırdı.
 *
 * **"Pause" İÇİN HAZIR BİR DURUM YOKTUR.** `races.status` CHECK'i
 * `scheduled | in_progress | finished | cancelled`tır (migration 0006) ve
 * `in_progress`u YAZAN HİÇBİR KOD YOKTUR — yarış `scheduled`dan doğrudan
 * `finished`a geçer (`SettleRaceUseCase`). Yani bugün "duraklatılacak
 * koşan bir yarış" kavramı sunucuda MEVCUT DEĞİLDİR; `paused` eklemek
 * yeni bir durum makinesi kurmak demektir, bir panel düğmesi değil.
 */
@Injectable()
export class ListAdminRacesUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(adminId: string): Promise<AdminRaceListResult> {
    assertAdmin(await this.adminRepository.isAdmin(adminId));

    const records = await this.adminRepository.listRaces(this.config.admin.raceListLimit);

    return {
      races: records.map(
        (record): AdminRaceView => ({
          raceId: record.raceId,
          name: record.name,
          status: record.status,
          raceType: record.raceType,
          surface: record.surface,
          distanceM: record.distanceM,
          entryFee: record.entryFee,
          prizePool: record.prizePool,
          tribuneFee: record.tribuneFee,
          participantLimit: record.participantLimit,
          maxPlayers: record.maxPlayers,
          joinedPlayers: record.joinedPlayers,
          // İptal edilebilirlik İSTEMCİYE AÇILIR, orada TEKRARLANMAZ —
          // gerekçe `AdminRaceView.cancelRefusal` doc yorumunda. Kuralın
          // kendisi `checkRaceCancelable`tır ve `CancelAdminRaceUseCase`
          // aynı fonksiyonu kilidin İÇİNDE yeniden çağırır: buradaki değer
          // yalnızca "düğmeyi çizeyim mi" sorusunu yanıtlar, iptali
          // ONAYLAMAZ.
          cancelRefusal: checkRaceCancelable(record.status),
          startTime: record.startTime.toISOString(),
          createdAt: record.createdAt.toISOString(),
          // `AdminReportView.reviewedBy` ile AYNI kural: kimlik dolu ama
          // görünen ad JOIN'de YOKSA `null` döneriz — yarısı dolu bir
          // `AdminPlayerRef` üretmek istemciyi "adsız oyuncu" diye bir şey
          // olduğuna inandırırdı.
          createdBy:
            record.createdById !== null && record.createdByDisplayName !== null
              ? { playerId: record.createdById, displayName: record.createdByDisplayName }
              : null,
        }),
      ),
    };
  }
}
