import { Module } from '@nestjs/common';
import { RunPracticeRaceUseCase } from '../../application/use-cases/run-practice-race.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { HorseModule } from '../horse/horse.module';
import { MarketModule } from '../market/market.module';
import { PlayerModule } from '../player/player.module';
import { RaceController } from './race.controller';

@Module({
  imports: [DatabaseModule, HorseModule, PlayerModule, MarketModule],
  controllers: [RaceController],
  providers: [RunPracticeRaceUseCase],
  exports: [RunPracticeRaceUseCase],
})
export class RaceModule {}