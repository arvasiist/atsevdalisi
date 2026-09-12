import { Module } from '@nestjs/common';
import { PLAYER_REPOSITORY } from '../../application/ports/player.repository';
import { GetPlayerUseCase } from '../../application/use-cases/get-player.use-case';
import { RegisterPlayerUseCase } from '../../application/use-cases/register-player.use-case';
import { PostgresPlayerRepository } from '../../infrastructure/player/postgres-player.repository';
import { PlayerController } from './player.controller';

/**
 * FAZ 1 wiring — brief §7 Player. `DatabaseModule` `@Global()` olduğundan
 * `PG_POOL`'u burada ayrıca import etmeye gerek yoktur (bkz.
 * `infrastructure/database/database.module.ts`).
 */
@Module({
  controllers: [PlayerController],
  providers: [
    RegisterPlayerUseCase,
    GetPlayerUseCase,
    { provide: PLAYER_REPOSITORY, useClass: PostgresPlayerRepository },
  ],
})
export class PlayerModule {}
