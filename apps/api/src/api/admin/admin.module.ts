import { Module } from '@nestjs/common';
import { ADMIN_REPOSITORY } from '../../application/ports/admin.repository';
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
 * **`IdempotencyInterceptor` YOKTUR** — bu modüldeki hiçbir rota para/
 * mülkiyet değiştirmez (bkz. `AdminController` doc yorumu); interceptor'ın
 * çözdüğü sorun ("zaman aşımından sonra tekrarlanan istek iki kez tahsil
 * etmesin") burada mevcut değildir. `PATCH`in kendi koruması geçiş
 * çizgesidir: `resolved` → `resolved` zaten 400'dür, yani tekrarlanan bir
 * istek ikinci bir denetim kaydı ÜRETEMEZ.
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
    { provide: ADMIN_REPOSITORY, useClass: PostgresAdminRepository },
  ],
})
export class AdminModule {}
