import { Module } from '@nestjs/common';
import { ADMIN_REPOSITORY } from '../../application/ports/admin.repository';
import { CancelAdminRaceUseCase } from '../../application/use-cases/cancel-admin-race.use-case';
import { ListAdminAuditLogUseCase } from '../../application/use-cases/list-admin-audit-log.use-case';
import { ListAdminPlayersUseCase } from '../../application/use-cases/list-admin-players.use-case';
import { ListAdminRacesUseCase } from '../../application/use-cases/list-admin-races.use-case';
import { ListAdminReportsUseCase } from '../../application/use-cases/list-admin-reports.use-case';
import { ListAdminTransactionsUseCase } from '../../application/use-cases/list-admin-transactions.use-case';
import { UpdateReportStatusUseCase } from '../../application/use-cases/update-report-status.use-case';
import { PostgresAdminRepository } from '../../infrastructure/admin/postgres-admin.repository';
import { AdminController } from './admin.controller';

/**
 * Yönetim (admin) modülü — brief §34, §42 PHASE 15-B.
 *
 * `SocialModule` ile AYNI desen: kendi repository'si `ADMIN_REPOSITORY`
 * token'ına bağlanır. `DatabaseModule` `@Global()` olduğundan `PG_POOL`
 * ayrıca import EDİLMEZ.
 *
 * **`PlayerModule` IMPORT EDİLMEZ** — sosyal modülün aksine buradaki
 * use-case'lerin hiçbiri "oyuncu var mı" sorusunu SORMAZ: yönetici kimliği
 * `AuthGuard`'dan gelir, hedefler ise şikâyet/yarış/defter satırlarıdır.
 * `GET /admin/players` bile `PLAYER_REPOSITORY`i DEĞİL, kendi portunu
 * kullanır: liste yönetim okumasıdır ve `AdminRepository`nin yetki
 * kapısıyla AYNI sınıfta durur. Bu yüzden `PLAYER_REPOSITORY`e ihtiyaç
 * yoktur; import etmek kullanılmayan bir bağımlılık doğururdu.
 *
 * **`SOCIAL_REPOSITORY` DE İMPORT EDİLMEZ:** şikâyet OKUMA/YAZMA yolu
 * (`player_reports`) bu modülde `PostgresAdminRepository` üzerinden
 * yürür — o tabloyu `PostgresSocialRepository` de yazar (`saveReport`), ama
 * iki yol AYNI transaction'a girmek zorunda DEĞİLDİR (şikâyet oluşturmak
 * ile onu kapatmak birbirinden bağımsız iki olaydır).
 *
 * **`IdempotencyInterceptor` HÂLÂ YOKTUR — `POST races/:raceId/cancel`
 * DAHİL.** Bu karar 28.09.2026'da gözden geçirildi: iptal ucu PARA
 * TAŞIR, yani "interceptor'ın çözdüğü sorun burada mevcut değildir"
 * cümlesi artık yanlış olurdu. Ama interceptor hâlâ YANLIŞ ÇÖZÜMDÜR,
 * çünkü çift iadeyi engelleyen şey zaten vardır ve DAHA GÜÇLÜDÜR:
 * `scheduled → cancelled` durum geçişi. İkinci istek, `FOR UPDATE`
 * altında yeni durumu görür ve `RaceNotCancelableError` (409) alır —
 * `SettleRaceUseCase`in `Idempotency-Key` yerine durum geçişine
 * güvenmesiyle AYNI gerekçe. Bir anahtar altyapısı eklemek, yapısal
 * olarak imkânsız bir şeyi ikinci kez engellemek olurdu.
 * `PATCH`in koruması da aynı sınıftır: `resolved` → `resolved` 400'dür.
 *
 * **`RateLimitGuard` için burada bir provider GEREKMEZ:** o guard global
 * `APP_GUARD` olarak kayıtlıdır ve `@RateLimit(...)` meta verisini
 * controller üzerinden okur (`social.module.ts` ile AYNI durum).
 *
 * **`ADMIN_REPOSITORY` EXPORT EDİLMEZ:** bu portu tüketen ikinci bir modül
 * yoktur ve olmamalıdır — yönetim okumaları başka bir ERİŞİM SINIFIDIR
 * (bkz. port doc yorumu). Export etmek, ileride bir oyuncu yolunun bu
 * portu yanlışlıkla enjekte etmesine kapı açardı.
 */
@Module({
  controllers: [AdminController],
  providers: [
    ListAdminReportsUseCase,
    UpdateReportStatusUseCase,
    ListAdminAuditLogUseCase,
    ListAdminPlayersUseCase,
    ListAdminRacesUseCase,
    ListAdminTransactionsUseCase,
    CancelAdminRaceUseCase,
    { provide: ADMIN_REPOSITORY, useClass: PostgresAdminRepository },
  ],
})
export class AdminModule {}
