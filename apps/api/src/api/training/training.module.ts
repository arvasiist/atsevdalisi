import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { TRAINING_SESSION_REPOSITORY } from '../../application/ports/training-session.repository';
import { GetTrainingHistoryUseCase } from '../../application/use-cases/get-training-history.use-case';
import { TrainHorseUseCase } from '../../application/use-cases/train-horse.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PostgresTrainingSessionRepository } from '../../infrastructure/training/postgres-training-session.repository';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { HorseModule } from '../horse/horse.module';
import { MarketModule } from '../market/market.module';
import { PlayerModule } from '../player/player.module';
import { TrainingController } from './training.controller';

@Module({
  // PlayerModule: antrenman oyuncuya da XP verir (01.10.2026).
  imports: [DatabaseModule, HorseModule, MarketModule, PlayerModule, StaffModule],
  controllers: [TrainingController],
  providers: [
    TrainHorseUseCase,
    // Antrenman geçmişi (bu turda EKLENDİ) — bkz. `get-training-history.use-case.ts` doc yorumu.
    GetTrainingHistoryUseCase,
    {
      provide: TRAINING_SESSION_REPOSITORY,
      useClass: PostgresTrainingSessionRepository,
    },
    // AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — bkz. `horse-owner.guard.ts` doc yorumu.
    HorseOwnerGuardByParam,
  ],
  exports: [TrainHorseUseCase],
})
export class TrainingModule {}