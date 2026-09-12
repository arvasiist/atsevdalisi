import { Module } from '@nestjs/common';
import { HORSE_REPOSITORY } from '../../application/ports/horse.repository';
import { GetHorseUseCase } from '../../application/use-cases/get-horse.use-case';
import { ListHorsesByOwnerUseCase } from '../../application/use-cases/list-horses-by-owner.use-case';
import { PostgresHorseRepository } from '../../infrastructure/horse/postgres-horse.repository';
import { HorseController } from './horse.controller';

/**
 * FAZ 1 wiring — brief §7 Horse. `HORSE_REPOSITORY` burada `exports`
 * edilir çünkü `PlayerModule` (yeni oyuncuya başlangıç atı vermek için,
 * bkz. `RegisterPlayerUseCase`) bu modülü import edip AYNI repository
 * sağlayıcısını kullanır — `PLAYER_REPOSITORY`'nin `PlayerModule`'e özel
 * kalmasından FARKLI olarak, bu modüller arası bir bağımlılıktır.
 */
@Module({
  controllers: [HorseController],
  providers: [
    GetHorseUseCase,
    ListHorsesByOwnerUseCase,
    { provide: HORSE_REPOSITORY, useClass: PostgresHorseRepository },
  ],
  exports: [HORSE_REPOSITORY],
})
export class HorseModule {}
