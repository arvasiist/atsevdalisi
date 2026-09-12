import { Module } from '@nestjs/common';
import { HorseModule } from '../horse/horse.module';
import { PLAYER_REPOSITORY } from '../../application/ports/player.repository';
import { GetPlayerUseCase } from '../../application/use-cases/get-player.use-case';
import { RegisterPlayerUseCase } from '../../application/use-cases/register-player.use-case';
import { PostgresPlayerRepository } from '../../infrastructure/player/postgres-player.repository';
import { PlayerController } from './player.controller';

/**
 * FAZ 1 wiring — brief §7 Player. `DatabaseModule` `@Global()` olduğundan
 * `PG_POOL`'u burada ayrıca import etmeye gerek yoktur (bkz.
 * `infrastructure/database/database.module.ts`).
 *
 * `HorseModule` import edilir çünkü `RegisterPlayerUseCase` artık yeni
 * oyuncuya bir başlangıç atı da veriyor (bkz. `HORSE_REPOSITORY`,
 * `domain/horse/horse.ts` — FAZ 1 wiring, ikinci dilim).
 */
@Module({
  imports: [HorseModule],
  controllers: [PlayerController],
  providers: [
    RegisterPlayerUseCase,
    GetPlayerUseCase,
    { provide: PLAYER_REPOSITORY, useClass: PostgresPlayerRepository },
  ],
})
export class PlayerModule {}
