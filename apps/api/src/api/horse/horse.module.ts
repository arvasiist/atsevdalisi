import { Module } from '@nestjs/common';
import { HORSE_REPOSITORY } from '../../application/ports/horse.repository';
import { HORSE_STATS_REPOSITORY } from '../../application/ports/horse-stats.repository';
import { HORSE_SURFACE_STATS_REPOSITORY } from '../../application/ports/horse-surface-stats.repository';
import { HORSE_DISTANCE_STATS_REPOSITORY } from '../../application/ports/horse-distance-stats.repository';
import { PEDIGREE_REPOSITORY } from '../../application/ports/pedigree.repository';
import { GetHorsePedigreeUseCase } from '../../application/use-cases/get-horse-pedigree.use-case';
import { GetHorseUseCase } from '../../application/use-cases/get-horse.use-case';
import { ListHorsesByOwnerUseCase } from '../../application/use-cases/list-horses-by-owner.use-case';
import { PostgresPedigreeRepository } from '../../infrastructure/breeding/postgres-pedigree.repository';
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
 *
 * `PEDIGREE_REPOSITORY` de AYNI gerekçeyle export edilir: soy ağacı OKUMA
 * yolunu bu modülün controller'ı kullanır, ama YAZMA yolu (çiftleştirme →
 * tay soy kaydı) ayrı bir modülde olacaktır ve oradan da bu porta ihtiyaç
 * duyulur.
 */
@Module({
  controllers: [HorseController],
  providers: [
    GetHorseUseCase,
    ListHorsesByOwnerUseCase,
    GetHorsePedigreeUseCase,
    { provide: HORSE_REPOSITORY, useClass: PostgresHorseRepository },
    { provide: HORSE_STATS_REPOSITORY, useClass: PostgresHorseStatsRepository },
    { provide: HORSE_SURFACE_STATS_REPOSITORY, useClass: PostgresHorseSurfaceStatsRepository },
    { provide: HORSE_DISTANCE_STATS_REPOSITORY, useClass: PostgresHorseDistanceStatsRepository },
    { provide: PEDIGREE_REPOSITORY, useClass: PostgresPedigreeRepository },
  ],
  exports: [
    HORSE_REPOSITORY,
    HORSE_STATS_REPOSITORY,
    HORSE_SURFACE_STATS_REPOSITORY,
    HORSE_DISTANCE_STATS_REPOSITORY,
    PEDIGREE_REPOSITORY,
  ],
})
export class HorseModule {}