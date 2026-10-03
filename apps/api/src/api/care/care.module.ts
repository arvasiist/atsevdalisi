import { Module } from '@nestjs/common';
import { FarmModule } from '../farm/farm.module';
import { StaffModule } from '../staff/staff.module';
import { CARE_LOG_REPOSITORY } from '../../application/ports/care-log.repository';
import { FEED_INVENTORY_REPOSITORY } from '../../application/ports/feed-inventory.repository';
import { HORSE_HEALTH_REPOSITORY } from '../../application/ports/horse-health.repository';
import { FeedHorseUseCase } from '../../application/use-cases/feed-horse.use-case';
import { PerformCareActionUseCase } from '../../application/use-cases/perform-care-action.use-case';
import { PostgresCareLogRepository } from '../../infrastructure/care/postgres-care-log.repository';
import { PostgresFeedInventoryRepository } from '../../infrastructure/feed/postgres-feed-inventory.repository';
import { PostgresHorseHealthRepository } from '../../infrastructure/horse/postgres-horse-health.repository';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { HorseModule } from '../horse/horse.module';
import { CareController } from './care.controller';

/**
 * FAZ 1 wiring, beşinci dilim — brief §11-12 Bakım/Besleme.
 * `TrainingModule` ile AYNI desen: `HorseModule`'ü import eder (`HORSE_REPOSITORY`
 * için), kendi repository'lerini (`HORSE_HEALTH_REPOSITORY`,
 * `CARE_LOG_REPOSITORY`) sağlar/kendine saklar.
 *
 * ## `FEED_INVENTORY_REPOSITORY` neden burada (düzeltme, 27.09.2026)
 *
 * Yem dilimi (`feed.module.ts`) `FeedHorseUseCase`'e YENİ bir bağımlılık
 * ekledi (`FEED_INVENTORY_REPOSITORY` — stoktan besleme), ama provider
 * kaydı burada, `CareModule`'de kaldı. `FeedModule` bu token'ı
 * SAĞLIYOR ama DIŞA AKTARMIYOR (`exports` yok), `CareModule` de onu
 * import etmiyor — sonuç: `POST /horses/:id/feed` ucunu sunan
 * `CareController`'ın ihtiyaç duyduğu `FeedHorseUseCase` Nest tarafından
 * HİÇ çözülemedi.
 *
 * Bu hata YALNIZCA e2e'de görünür, birim testlerde GÖRÜNMEZ: modül grafiği
 * yalnızca `Test.createTestingModule(...).compile()` sırasında kurulur.
 * Belirtisi de yanıltıcıydı — 10 e2e dosyasının hepsi `afterAll`'da
 * `TypeError: Cannot read properties of undefined (reading 'close')`
 * veriyordu (`app` hiç oluşmadığı için), yani hata "teardown" gibi
 * görünüyordu; gerçek neden `beforeAll`'daki DI çözümlemesiydi.
 *
 * Çözüm olarak token'ı burada YENİDEN sağlıyorum (`FeedModule`'ün
 * `HORSE_HEALTH_REPOSITORY` için yazdığı gerekçenin AYNISI: sağlayıcılar
 * modül kapsamlıdır, iki modülde listelenen aynı token aynı sınıfın İKİ
 * örneğini üretir — `PostgresFeedInventoryRepository` durumsuzdur,
 * yalnızca `PG_POOL` tutar, bu yüzden zararsızdır). `CareModule`'ü
 * `FeedModule`'e bağımlamak yerine bunun seçilmesinin nedeni: `FeedModule`
 * kendi controller'ını ve `HORSE_HEALTH_REPOSITORY`'sini de taşır, onu
 * import etmek care→feed yönünde gereksiz bir modül bağımlılığı doğururdu.
 * Ortak bir `FeedInventoryModule` çıkarmak ise bu düzeltmenin kapsamı
 * dışındadır (bkz. `feed.module.ts`teki AYNI not).
 */
@Module({
  imports: [HorseModule, StaffModule, FarmModule],
  controllers: [CareController],
  providers: [
    PerformCareActionUseCase,
    FeedHorseUseCase,
    { provide: HORSE_HEALTH_REPOSITORY, useClass: PostgresHorseHealthRepository },
    { provide: CARE_LOG_REPOSITORY, useClass: PostgresCareLogRepository },
    { provide: FEED_INVENTORY_REPOSITORY, useClass: PostgresFeedInventoryRepository },
    // AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — bkz. `horse-owner.guard.ts` doc yorumu.
    HorseOwnerGuardByParam,
  ],
})
export class CareModule {}
