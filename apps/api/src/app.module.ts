import { Module } from '@nestjs/common';
import { CareModule } from './api/care/care.module';
import { EconomyModule } from './api/economy/economy.module';
import { HealthModule } from './api/health/health.module';
import { HorseModule } from './api/horse/horse.module';
import { PlayerModule } from './api/player/player.module';
import { RaceModule } from './api/race/race.module';
import { StableModule } from './api/stable/stable.module';
import { TrainingModule } from './api/training/training.module';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';

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
 * wiring — Yedinci dilim"); sekizinci dilimde `RaceModule` eklendi (brief
 * §6 Race Engine — `POST /horses/{id}/practice-race`, `simulateRace`'in
 * İLK gerçek orkestrasyonu, bkz. "FAZ 1 wiring — Sekizinci dilim");
 * dokuzuncu dilimde `RedisModule` BAĞLANDI (`@Global()` olduğundan bir
 * kez buraya eklenmesi yeterli — bkz. `infrastructure/redis/redis.module.ts`)
 * ve Pratik Yarış'a giriş ücreti + ödül eklendi (Economy'nin `debit`+
 * `credit`'i TEK bir `updateWithLock` altında, brief §54'ün Idempotency-Key
 * altyapısının İLK gerçek kullanıcısı — bkz. "FAZ 1 wiring — Dokuzuncu
 * dilim"). Economy'nin `transfer` akışı ve gerçek çok oyunculu yarış
 * eşleştirmesi geriye kalan iki büyük madde. Ahır Yükseltme'nin KENDİ
 * endpoint'i hâlâ Idempotency-Key KORUMASI OLMADAN çalışıyor — bilinçli
 * olarak dokuzuncu dilimin kapsamı dışında bırakıldı, ayrı bir
 * sertleştirme dilimini hak ediyor (Günlük Ödül KENDİ cooldown
 * kontrolüyle finansal olarak zaten korumalıdır, bkz.
 * `claim-daily-reward.use-case.ts` üstündeki KAPSAM notu).
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    HealthModule,
    PlayerModule,
    HorseModule,
    StableModule,
    TrainingModule,
    CareModule,
    EconomyModule,
    RaceModule,
  ],
})
export class AppModule {}
