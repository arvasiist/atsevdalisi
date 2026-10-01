import { Module } from '@nestjs/common';
import { SEASON_REPOSITORY } from '../../application/ports/season.repository';
import { SeasonUseCase } from '../../application/use-cases/season.use-case';
import { SeasonScheduler } from '../../infrastructure/scheduler/season.scheduler';
import { PostgresSeasonRepository } from '../../infrastructure/season/postgres-season.repository';
import { SeasonController } from './season.controller';

/** Sezon (brief §69, migration 0050) — 01.10.2026'da bağlandı. */
@Module({
  controllers: [SeasonController],
  providers: [
    SeasonUseCase,
    SeasonScheduler,
    { provide: SEASON_REPOSITORY, useClass: PostgresSeasonRepository },
  ],
})
export class SeasonModule {}
