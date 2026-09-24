import { Module } from '@nestjs/common';
import { HORSE_REPOSITORY } from '../../application/ports/horse.repository';
import { HORSE_STATS_REPOSITORY } from '../../application/ports/horse-stats.repository';
import { HORSE_SURFACE_STATS_REPOSITORY } from '../../application/ports/horse-surface-stats.repository';
import { HORSE_DISTANCE_STATS_REPOSITORY } from '../../application/ports/horse-distance-stats.repository';
import { GetHorseUseCase } from '../../application/use-cases/get-horse.use-case';
import { ListHorsesByOwnerUseCase } from '../../application/use-cases/list-horses-by-owner.use-case';
import { PostgresHorseRepository } from '../../infrastructure/horse/postgres-horse.repository';
import { PostgresHorseStatsRepository } from '../../infrastructure/horse/postgres-horse-stats.repository';
import { PostgresHorseSurfaceStatsRepository } from '../../infrastructure/horse/postgres-horse-surface-stats.repository';
import { PostgresHorseDistanceStatsRepository } from '../../infrastructure/horse/postgres-horse-distance-stats.repository';
import { HorseController } from './horse.controller';

/**
 * R3 — Track Fit (bu turda EKLENDİ) — `HORSE_SURFACE_STATS_REPOSITORY`/
 * `HORSE_DISTANCE_STATS_REPOSITORY`, `HORSE_STATS_REPOSITORY` ile AYNI
 * gerekçeyle burada sağlanır ve export edilir: `RaceModule`/
 * `MatchmakingModule` bu modülü ZATEN import ediyor (bkz. o modüllerin
 * doc yorumu), bu yüzden yeni bir import EKLENMEDEN kullanılabilirler.
 */
@Module({
  controllers: [HorseController],
  providers: [
    GetHorseUseCase,
    ListHorsesByOwnerUseCase,
    { provide: HORSE_REPOSITORY, useClass: PostgresHorseRepository },
    { provide: HORSE_STATS_REPOSITORY, useClass: PostgresHorseStatsRepository },
    { provide: HORSE_SURFACE_STATS_REPOSITORY, useClass: PostgresHorseSurfaceStatsRepository },
    { provide: HORSE_DISTANCE_STATS_REPOSITORY, useClass: PostgresHorseDistanceStatsRepository },
  ],
  exports: [HORSE_REPOSITORY, HORSE_STATS_REPOSITORY, HORSE_SURFACE_STATS_REPOSITORY, HORSE_DISTANCE_STATS_REPOSITORY],
})
export class HorseModule {}