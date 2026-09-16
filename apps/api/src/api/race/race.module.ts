import { Module } from '@nestjs/common';
import { HORSE_STATS_REPOSITORY } from '../../application/ports/horse-stats.repository';
import { RACE_REPOSITORY } from '../../application/ports/race.repository';
import { RunPracticeRaceUseCase } from '../../application/use-cases/run-practice-race.use-case';
import { PostgresHorseStatsRepository } from '../../infrastructure/horse/postgres-horse-stats.repository';
import { PostgresRaceRepository } from '../../infrastructure/race/postgres-race.repository';
import { HorseModule } from '../horse/horse.module';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { PlayerModule } from '../player/player.module';
import { RaceController } from './race.controller';

/**
 * FAZ 1 wiring, sekizinci dilim — brief §6 Race Engine. `HorseModule`'ü
 * import eder çünkü `RunPracticeRaceUseCase` `HORSE_REPOSITORY`'ye
 * ihtiyaç duyar (`TrainingModule`/`StableModule` ile AYNI desen). Kendi
 * `HORSE_STATS_REPOSITORY` bağlamasını `TrainingModule` ile AYNI
 * gerekçeyle KENDİSİ sağlar (hiçbir modül bunu `exports` etmiyor).
 *
 * FAZ 1 wiring, dokuzuncu dilim — `PlayerModule` eklendi (`StableModule`
 * ile AYNI gerekçe: `RunPracticeRaceUseCase` artık `PLAYER_REPOSITORY`'ye
 * ihtiyaç duyuyor, giriş ücreti/ödül için). `IdempotencyInterceptor`
 * burada bir provider olarak listelenir — `REDIS_CLIENT`'ı enjekte
 * edebilmesi için (bkz. `RedisModule`'ün `@Global()` olduğu, bu yüzden
 * ayrıca `imports`'a eklenmesine GEREK OLMADIĞI `app.module.ts` doc
 * yorumu); `RaceController`'da `@UseInterceptors(IdempotencyInterceptor)`
 * ile sınıf referansı olarak kullanılır.
 */
@Module({
  imports: [HorseModule, PlayerModule],
  controllers: [RaceController],
  providers: [
    RunPracticeRaceUseCase,
    IdempotencyInterceptor,
    { provide: HORSE_STATS_REPOSITORY, useClass: PostgresHorseStatsRepository },
    { provide: RACE_REPOSITORY, useClass: PostgresRaceRepository },
  ],
})
export class RaceModule {}
