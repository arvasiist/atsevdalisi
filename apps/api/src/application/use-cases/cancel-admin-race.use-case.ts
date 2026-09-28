import { Inject, Injectable } from '@nestjs/common';
import type { AdminRaceCancelResult } from '@at-sevdalisi/shared-types';
import {
  ADMIN_REPOSITORY,
  type AdminRepository,
} from '../ports/admin.repository';
import { assertAdmin } from '../../domain/admin/moderation-queue';
import { checkRaceCancelable } from '../../domain/admin/race-cancel';
import { RaceNotCancelableError } from '../../domain/admin/errors';
import { RaceNotFoundError } from '../../domain/race/errors';

/**
 * `POST /admin/races/:raceId/cancel` — brief §34 "Race: ... Cancel ...
 * kontrollü şekilde yapılabilmeli." (28.09.2026)
 *
 * **BU BİR PARA YOLUDUR VE PROJEDEKİ İLK "YÖNETİCİ ELİYLE PARA" YOLUDUR.**
 * `LeaveRaceUseCase` oyuncunun KENDİ katılımını iade eder; bu use-case
 * BAŞKALARININ parasını iade eder. Bu yüzden iki kapı birlikte çalışır:
 *
 *  1. **YETKİ KAPISI** — `assertAdmin`, use-case'in İLK satırıdır ve
 *     `players.is_admin`i HER İSTEKTE okur (token'a gömülü rol yoktur).
 *     Yetkisi alınmış bir yönetici elindeki eski token'la iade YAPAMAZ.
 *  2. **DURUM KAPISI** — `checkRaceCancelable`, repository'nin kilit
 *     ALTI geri çağrısı içinde çalışır. Buraya değil oraya konmasının
 *     sebebi TOCTOU'dur: kural burada, use-case'in okuduğu kopyaya
 *     uygulansaydı, "iptal edilebilir" cevabı ile UPDATE arasında yarış
 *     koşabilir ve KOŞMUŞ bir yarıştan para iade edilirdi.
 *
 * **403 ÖNCE, 404 SONRA:** yetki kapısı geçilmeden yarış sorgulanmaz.
 * Aksi hâlde yönetici olmayan biri 403 ile 404'ü karşılaştırarak hangi
 * yarış kimliklerinin var olduğunu yoklayabilirdi (`ReportNotFoundError`
 * ile AYNI kural).
 *
 * **`Pause` VE `Finish` BU DİLİMDE YOKTUR — uydurulmamıştır.**
 *  - `Pause` bugün İMKÂNSIZDIR: `races.status` CHECK'inde (migration 0006)
 *    `paused` diye bir değer YOKTUR ve `in_progress` hiçbir kod
 *    tarafından yazılmaz. Duraklatılacak bir durum yoktur.
 *  - `Finish` ZATEN VARDIR ama yöneticiye özel değildir:
 *    `POST /races/:id/settle` yarışı koşturur, ödülleri dağıtır ve
 *    `finished` yazar (§13.14). Oraya ikinci bir yönetim ucu eklemek,
 *    aynı para yolunu iki farklı yetki kapısıyla iki kez açmak olurdu.
 */
@Injectable()
export class CancelAdminRaceUseCase {
  constructor(
    // `@Inject()` AÇIK — CLAUDE.md kural 5.
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
  ) {}

  async execute(adminId: string, raceId: string): Promise<AdminRaceCancelResult> {
    assertAdmin(await this.adminRepository.isAdmin(adminId));

    // `now` ÇAĞIRAN tarafından üretilir ve repository'ye geçirilir —
    // `LeaveRaceUseCase`/`SettleRaceUseCase` ile AYNI ilke: karşılaştırma
    // ve damga tek bir andan gelmelidir.
    const now = new Date();

    const outcome = await this.adminRepository.cancelRaceWithLock(
      { raceId, adminId, now },
      (race) => {
        const refusal = checkRaceCancelable(race.status);
        if (refusal !== null) {
          throw new RaceNotCancelableError(refusal, race.raceId);
        }
      },
    );

    if (outcome === null) {
      // `RaceNotFoundError` — `domain/race/errors.ts`teki SINIF yeniden
      // kullanılır: "yarış yok" tek bir durumdur ve tek bir hata kodu
      // (`RACE_NOT_FOUND`) üretmelidir. Yeni bir sınıf yazmak, aynı duruma
      // iki kod verirdi.
      throw new RaceNotFoundError(raceId);
    }

    return {
      raceId: outcome.record.raceId,
      name: outcome.record.name,
      refundedPlayers: outcome.record.refundedPlayers,
      refundedTotal: outcome.record.refundedTotal,
      cancelledAt: outcome.record.cancelledAt.toISOString(),
    };
  }
}
