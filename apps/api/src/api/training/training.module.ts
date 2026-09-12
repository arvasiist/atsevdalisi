import { Module } from '@nestjs/common';
import { HORSE_STATS_REPOSITORY } from '../../application/ports/horse-stats.repository';
import { TRAINING_SESSION_REPOSITORY } from '../../application/ports/training-session.repository';
import { TrainHorseUseCase } from '../../application/use-cases/train-horse.use-case';
import { PostgresHorseStatsRepository } from '../../infrastructure/horse/postgres-horse-stats.repository';
import { PostgresTrainingSessionRepository } from '../../infrastructure/training/postgres-training-session.repository';
import { HorseModule } from '../horse/horse.module';
import { TrainingController } from './training.controller';

/**
 * FAZ 1 wiring, dördüncü dilim — brief §10 Antrenman. `HorseModule`'ü
 * import eder çünkü `TrainHorseUseCase` `HORSE_REPOSITORY`'ye ihtiyaç
 * duyar (`HorseModule` bunu zaten `exports` ediyor — `StableModule`
 * ile AYNI desen, bkz. docs/ROADMAP.md "Üçüncü dilim"). Kendi
 * repository'lerini (`HORSE_STATS_REPOSITORY`, `TRAINING_SESSION_REPOSITORY`)
 * sağlar/kendine saklar — başka bir modülün bunlara ihtiyacı olmadığından
 * `exports` edilmezler.
 */
@Module({
  imports: [HorseModule],
  controllers: [TrainingController],
  providers: [
    TrainHorseUseCase,
    { provide: HORSE_STATS_REPOSITORY, useClass: PostgresHorseStatsRepository },
    { provide: TRAINING_SESSION_REPOSITORY, useClass: PostgresTrainingSessionRepository },
  ],
})
export class TrainingModule {}
