import { Module } from '@nestjs/common';
import { HealthModule } from './api/health/health.module';
import { HorseModule } from './api/horse/horse.module';
import { PlayerModule } from './api/player/player.module';
import { StableModule } from './api/stable/stable.module';
import { TrainingModule } from './api/training/training.module';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';

/**
 * Kök modül. FAZ 1 wiring (bu oturum) `PlayerModule` + `DatabaseModule`'ü
 * ekledi (bkz. docs/ROADMAP.md "FAZ 1 wiring — İlk uçtan uca dilim");
 * ikinci dilimde `HorseModule` eklendi (yalnızca okuma uç noktaları +
 * kayıtta başlangıç atı verme); üçüncü dilimde `StableModule` eklendi
 * (Ahır Özeti); dördüncü dilimde `TrainingModule` eklendi (brief §10
 * Antrenman — `POST /horses/{id}/train`, bkz. "FAZ 1 wiring — Dördüncü
 * dilim"). `RaceModule` vb. bir sonraki adımlarda aynı desenle
 * eklenecektir (bkz. docs/ARCHITECTURE.md §6). `RedisModule` henüz
 * BAĞLANMADI — cache/idempotency gerektiren bir use-case eklendiğinde
 * bağlanacaktır (brief §54).
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, HealthModule, PlayerModule, HorseModule, StableModule, TrainingModule],
})
export class AppModule {}
