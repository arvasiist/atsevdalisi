import { Module } from '@nestjs/common';
import { TRAINING_SESSION_REPOSITORY } from '../../application/ports/training-session.repository';
import { TrainHorseUseCase } from '../../application/use-cases/train-horse.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PostgresTrainingSessionRepository } from '../../infrastructure/training/postgres-training-session.repository';
import { HorseModule } from '../horse/horse.module';
import { MarketModule } from '../market/market.module';
import { TrainingController } from './training.controller';

@Module({
  imports: [DatabaseModule, HorseModule, MarketModule],
  controllers: [TrainingController],
  providers: [
    TrainHorseUseCase,
    {
      provide: TRAINING_SESSION_REPOSITORY,
      useClass: PostgresTrainingSessionRepository,
    },
  ],
  exports: [TrainHorseUseCase],
})
export class TrainingModule {}