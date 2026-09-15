import { Module } from '@nestjs/common';
import { TrainHorseUseCase } from '../../application/use-cases/train-horse.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { HorseModule } from '../horse/horse.module';
import { MarketModule } from '../market/market.module';
import { TrainingController } from './training.controller';

@Module({
  imports: [DatabaseModule, HorseModule, MarketModule],
  controllers: [TrainingController],
  providers: [TrainHorseUseCase],
  exports: [TrainHorseUseCase],
})
export class TrainingModule {}