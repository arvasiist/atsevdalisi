import { Module } from '@nestjs/common';
import { JOCKEY_REPOSITORY } from '../../application/ports/jockey.repository';
import { GetPlayerJockeyUseCase } from '../../application/use-cases/get-player-jockey.use-case';
import { HireJockeyUseCase } from '../../application/use-cases/hire-jockey.use-case';
import { ListAvailableJockeysUseCase } from '../../application/use-cases/list-available-jockeys.use-case';
import { ReleaseJockeyUseCase } from '../../application/use-cases/release-jockey.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PostgresJockeyRepository } from '../../infrastructure/jockey/postgres-jockey.repository';
import { JockeyController } from './jockey.controller';

/**
 * Jokey (brief §13, §42 PHASE 6.2).
 *
 * `EquipmentModule` ile AYNI desen. **`JOCKEY_REPOSITORY` burada `exports`
 * EDİLMEZ** — `RaceModule`'ün AYNI token'ı KENDİ `providers`'ında BAĞIMSIZ
 * olarak sağladığı desenle AYNI gerekçe: `EntrantSnapshotBuilder` (bkz.
 * `RaceModule`) jokeyi okurken bu modülü `imports`'a eklemek, iki modül
 * arasında gereksiz bir çapraz bağımlılık yaratırdı (bkz.
 * `equipment.module.ts` doc yorumu).
 *
 * **`AppConfigService` BURAYA EKLENMEZ** — `AppConfigModule` `@Global()`tir
 * (`DatabaseModule` ile AYNI desen), yani `GetPlayerJockeyUseCase`
 * config'i her modülden olduğu gibi buradan da çözer.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [JockeyController],
  providers: [
    ListAvailableJockeysUseCase,
    GetPlayerJockeyUseCase,
    HireJockeyUseCase,
    ReleaseJockeyUseCase,
    { provide: JOCKEY_REPOSITORY, useClass: PostgresJockeyRepository },
  ],
})
export class JockeyModule {}
