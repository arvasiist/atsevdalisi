import { Module } from '@nestjs/common';
import { CareModule } from './api/care/care.module';
import { EconomyModule } from './api/economy/economy.module';
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
 * Antrenman); beşinci dilimde `CareModule` eklendi (brief §11-12
 * Bakım/Besleme — `POST /horses/{id}/care`+`/feed`); altıncı dilimde
 * `StableModule`'e `POST /players/{id}/stable/upgrade` eklendi (Economy'nin
 * `debit`'i + satır kilitleme, bkz. docs/ARCHITECTURE.md §9.3); yedinci
 * dilimde `EconomyModule` eklendi (brief §37 Günlük Ödül —
 * `POST /players/{id}/daily-reward`, Economy'nin `credit`'i, bkz. "FAZ 1
 * wiring — Yedinci dilim"). `RaceModule` vb. bir sonraki adımlarda aynı
 * desenle eklenecektir (bkz. docs/ARCHITECTURE.md §6). `RedisModule`
 * henüz BAĞLANMADI — brief §54'ün tam Idempotency-Key altyapısı
 * gerektiren bir use-case eklendiğinde bağlanacaktır (Günlük Ödül
 * KENDİ cooldown kontrolüyle finansal olarak zaten korumalıdır, bkz.
 * `claim-daily-reward.use-case.ts` üstündeki KAPSAM notu).
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    HealthModule,
    PlayerModule,
    HorseModule,
    StableModule,
    TrainingModule,
    CareModule,
    EconomyModule,
  ],
})
export class AppModule {}
