import { Module } from '@nestjs/common';
import { RACE_REPOSITORY } from '../../application/ports/race.repository';
import { GetRaceTimelineUseCase } from '../../application/use-cases/get-race-timeline.use-case';
import { GetRecentRaceResultsUseCase } from '../../application/use-cases/get-recent-race-results.use-case';
import { RunPracticeRaceUseCase } from '../../application/use-cases/run-practice-race.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PostgresRaceRepository } from '../../infrastructure/race/postgres-race.repository';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { HorseModule } from '../horse/horse.module';
import { MarketModule } from '../market/market.module';
import { PlayerModule } from '../player/player.module';
import { RaceController } from './race.controller';
import { RaceTimelineController } from './race-timeline.controller';
import { RecentRacesController } from './recent-races.controller';

@Module({
  imports: [DatabaseModule, HorseModule, PlayerModule, MarketModule],
  controllers: [RaceController, RecentRacesController, RaceTimelineController],
  providers: [
    RunPracticeRaceUseCase,
    GetRecentRaceResultsUseCase,
    // AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — bkz. `get-race-timeline.use-case.ts` doc yorumu.
    GetRaceTimelineUseCase,
    { provide: RACE_REPOSITORY, useClass: PostgresRaceRepository },
    // AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — bkz. `horse-owner.guard.ts` doc yorumu.
    HorseOwnerGuardByParam,
  ],
  exports: [RunPracticeRaceUseCase, RACE_REPOSITORY],
})
export class RaceModule {}