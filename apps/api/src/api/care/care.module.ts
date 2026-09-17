import { Module } from '@nestjs/common';
import { CARE_LOG_REPOSITORY } from '../../application/ports/care-log.repository';
import { HORSE_HEALTH_REPOSITORY } from '../../application/ports/horse-health.repository';
import { FeedHorseUseCase } from '../../application/use-cases/feed-horse.use-case';
import { PerformCareActionUseCase } from '../../application/use-cases/perform-care-action.use-case';
import { PostgresCareLogRepository } from '../../infrastructure/care/postgres-care-log.repository';
import { PostgresHorseHealthRepository } from '../../infrastructure/horse/postgres-horse-health.repository';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { HorseModule } from '../horse/horse.module';
import { CareController } from './care.controller';

/**
 * FAZ 1 wiring, beşinci dilim — brief §11-12 Bakım/Besleme.
 * `TrainingModule` ile AYNI desen: `HorseModule`'ü import eder (`HORSE_REPOSITORY`
 * için), kendi repository'lerini (`HORSE_HEALTH_REPOSITORY`,
 * `CARE_LOG_REPOSITORY`) sağlar/kendine saklar.
 */
@Module({
  imports: [HorseModule],
  controllers: [CareController],
  providers: [
    PerformCareActionUseCase,
    FeedHorseUseCase,
    { provide: HORSE_HEALTH_REPOSITORY, useClass: PostgresHorseHealthRepository },
    { provide: CARE_LOG_REPOSITORY, useClass: PostgresCareLogRepository },
    // AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — bkz. `horse-owner.guard.ts` doc yorumu.
    HorseOwnerGuardByParam,
  ],
})
export class CareModule {}
