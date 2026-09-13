import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { ClaimDailyRewardUseCase } from '../../application/use-cases/claim-daily-reward.use-case';
import { EconomyController } from './economy.controller';

/**
 * FAZ 1 wiring, yedinci dilim — brief §37 Günlük Ödül. `StableModule` ile
 * AYNI desen: kendi repository'si YOKTUR, `PlayerModule`'ü import edip
 * `PLAYER_REPOSITORY`'sini kullanır.
 */
@Module({
  imports: [PlayerModule],
  controllers: [EconomyController],
  providers: [ClaimDailyRewardUseCase],
})
export class EconomyModule {}
