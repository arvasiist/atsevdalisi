import { Module } from '@nestjs/common';
import { HealthModule } from './api/health/health.module';
import { PlayerModule } from './api/player/player.module';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';

/**
 * Kök modül. FAZ 1 wiring (bu oturum) `PlayerModule` + `DatabaseModule`'ü
 * ekledi (bkz. docs/ROADMAP.md "FAZ 1 wiring — İlk uçtan uca dilim").
 * `HorseModule`, `TrainingModule`, `RaceModule` vb. bir sonraki adımlarda
 * aynı desenle eklenecektir (bkz. docs/ARCHITECTURE.md §6). `RedisModule`
 * henüz BAĞLANMADI — bu ilk dilimde (basit oyuncu kaydı) cache/idempotency
 * gerekmiyor; para/ödül transferi içeren bir use-case eklendiğinde
 * bağlanacaktır (brief §54).
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, HealthModule, PlayerModule],
})
export class AppModule {}
