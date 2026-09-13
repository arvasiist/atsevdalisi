import { Module } from '@nestjs/common';
import { HorseModule } from '../horse/horse.module';
import { PlayerModule } from '../player/player.module';
import { GetStableSummaryUseCase } from '../../application/use-cases/get-stable-summary.use-case';
import { UpgradeStableUseCase } from '../../application/use-cases/upgrade-stable.use-case';
import { StableController } from './stable.controller';

/**
 * FAZ 1 wiring, üçüncü dilim — brief §32/§38/§39 Ahır. Bu modülün kendi
 * repository'si YOKTUR — `PlayerModule` (`PLAYER_REPOSITORY`) ve
 * `HorseModule`'ü (`HORSE_REPOSITORY`) import edip ikisini de
 * `GetStableSummaryUseCase` içinde birleştirir (bkz. `HorseModule`'ün
 * `HORSE_REPOSITORY`'yi zaten `exports` ettiği desenin AYNISI,
 * `PlayerModule`'e de uygulanmıştır).
 *
 * FAZ 1 wiring, altıncı dilim — `UpgradeStableUseCase` de burada sağlanır;
 * yeni bir repository/modül import'u GEREKMEZ, zaten import edilen
 * `PlayerModule`'ün `PLAYER_REPOSITORY`'sini kullanır.
 */
@Module({
  imports: [PlayerModule, HorseModule],
  controllers: [StableController],
  providers: [GetStableSummaryUseCase, UpgradeStableUseCase],
})
export class StableModule {}
