import { Module } from '@nestjs/common';
import { FEED_INVENTORY_REPOSITORY } from '../../application/ports/feed-inventory.repository';
import { HORSE_HEALTH_REPOSITORY } from '../../application/ports/horse-health.repository';
import { BuyFeedUseCase } from '../../application/use-cases/buy-feed.use-case';
import { GetFeedInventoryUseCase } from '../../application/use-cases/get-feed-inventory.use-case';
import { GetHorseFeedStatusUseCase } from '../../application/use-cases/get-horse-feed-status.use-case';
import { PostgresFeedInventoryRepository } from '../../infrastructure/feed/postgres-feed-inventory.repository';
import { PostgresHorseHealthRepository } from '../../infrastructure/horse/postgres-horse-health.repository';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { HorseModule } from '../horse/horse.module';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { FeedController } from './feed.controller';

/**
 * brief §12 Beslenme / yem dükkânı — bu turda EKLENDİ.
 * `CareModule`/`FarmModule` ile AYNI desen: `HorseModule`'ü import eder
 * (`HORSE_REPOSITORY` için), kendi repository'lerini
 * (`FEED_INVENTORY_REPOSITORY`, `HORSE_HEALTH_REPOSITORY`) sağlar.
 *
 * `HORSE_HEALTH_REPOSITORY` burada YENİDEN sağlanır (`CareModule`'de de
 * var): sağlayıcılar modül kapsamlıdır, aynı token'ın iki modülde
 * listelenmesi AYNI sınıfın iki örneğini üretir — ikisi de durumsuz
 * (yalnızca `PG_POOL` tutar) olduğundan bu bilinçlidir; ortak bir
 * `HorseHealthModule` çıkarmak bu dilimin kapsamı dışındadır.
 *
 * `IdempotencyInterceptor` burada bir provider olarak listelenir
 * (`StableModule`/`FarmModule` ile AYNI gerekçe: `REDIS_CLIENT`'ı enjekte
 * edebilmesi için; `RedisModule` `@Global()` olduğundan ayrıca `imports`'a
 * eklenmesine GEREK YOKTUR).
 */
@Module({
  imports: [HorseModule],
  controllers: [FeedController],
  providers: [
    GetFeedInventoryUseCase,
    GetHorseFeedStatusUseCase,
    BuyFeedUseCase,
    { provide: FEED_INVENTORY_REPOSITORY, useClass: PostgresFeedInventoryRepository },
    { provide: HORSE_HEALTH_REPOSITORY, useClass: PostgresHorseHealthRepository },
    // `CareModule` ile AYNI gerekçe — bkz. `horse-owner.guard.ts` doc yorumu.
    HorseOwnerGuardByParam,
    IdempotencyInterceptor,
  ],
})
export class FeedModule {}
