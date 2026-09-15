import { Module } from '@nestjs/common';
import { HORSE_REPOSITORY } from '../../application/ports/horse.repository';
import { HORSE_STATS_REPOSITORY } from '../../application/ports/horse-stats.repository';
import { CreateHorseUseCase } from '../../application/use-cases/create-horse.use-case';
import { GetHorseUseCase } from '../../application/use-cases/get-horse.use-case';
import { ListHorsesByOwnerUseCase } from '../../application/use-cases/list-horses-by-owner.use-case';
import { PostgresHorseRepository } from '../../infrastructure/horse/postgres-horse.repository';
import { PostgresHorseStatsRepository } from '../../infrastructure/horse/postgres-horse-stats.repository';
import { HorseController } from './horse.controller';

@Module({
  controllers: [HorseController],
  providers: [
    CreateHorseUseCase,
    GetHorseUseCase,
    ListHorsesByOwnerUseCase,
    { provide: HORSE_REPOSITORY, useClass: PostgresHorseRepository },
    { provide: HORSE_STATS_REPOSITORY, useClass: PostgresHorseStatsRepository },
  ],
  exports: [HORSE_REPOSITORY, HORSE_STATS_REPOSITORY],
})
export class HorseModule {}