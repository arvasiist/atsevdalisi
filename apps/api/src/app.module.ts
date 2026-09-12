import { Module } from '@nestjs/common';
import { HealthModule } from './api/health/health.module';
import { HorseModule } from './api/horse/horse.module';
import { PlayerModule } from './api/player/player.module';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';

/**
 * Kök modül. FAZ 1 wiring (bu oturum) `PlayerModule` + `DatabaseModule`'ü
 * ekledi (bkz. docs/ROADMAP.md "FAZ 1 wiring — İlk uçtan uca dilim");
 * ikinci dilimde `HorseModule` eklendi (yalnızca okuma uç noktaları +
 * kayıtta başlangıç atı verme, bkz. "FAZ 1 wiring — İkinci dilim").
 * `TrainingModule`, `RaceModule` vb. bir sonraki adımlarda aynı desenle
 * eklenecektir (bkz. docs/ARCHITECTURE.md §6). `RedisModule` henüz
 * BAĞLANMADI — cache/idempotency gerektiren bir use-case eklendiğinde
 * bağlanacaktır (brief §54).
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, HealthModule, PlayerModule, HorseModule],
})
export class AppModule {}
