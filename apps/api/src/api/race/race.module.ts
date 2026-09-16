import { Module } from '@nestjs/common';
import { RACE_REPOSITORY } from '../../application/ports/race.repository';
import { RunPracticeRaceUseCase } from '../../application/use-cases/run-practice-race.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PostgresRaceRepository } from '../../infrastructure/race/postgres-race.repository';
import { HorseModule } from '../horse/horse.module';
import { MarketModule } from '../market/market.module';
import { PlayerModule } from '../player/player.module';
import { RaceController } from './race.controller';

@Module({
  imports: [DatabaseModule, HorseModule, PlayerModule, MarketModule],
  controllers: [RaceController],
  providers: [
    RunPracticeRaceUseCase,
    { provide: RACE_REPOSITORY, useClass: PostgresRaceRepository },
  ],
  exports: [RunPracticeRaceUseCase, RACE_REPOSITORY],
})
export class RaceModule {}