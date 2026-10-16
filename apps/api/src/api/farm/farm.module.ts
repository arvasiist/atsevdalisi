import { Module } from '@nestjs/common';
import { FACILITY_REPOSITORY } from '../../application/ports/facility.repository';
import { FarmEffectsService } from '../../application/use-cases/farm-effects.service';
import { GetFarmSummaryUseCase } from '../../application/use-cases/get-farm-summary.use-case';
import { UpgradeFacilityUseCase } from '../../application/use-cases/upgrade-facility.use-case';
import { PostgresFacilityRepository } from '../../infrastructure/farm/postgres-facility.repository';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { PlayerModule } from '../player/player.module';
import { FarmController } from './farm.controller';

/**
 * brief §32 "Çiftlik" — bu turda EKLENDİ. `facilities` tablosu
 * (`database/migrations/0013_create_facilities.up.sql`) ve
 * `domain/farm/farm.ts` FAZ 2'den beri VARDI ama ikisini birbirine bağlayan
 * hiçbir katman yoktu (tablo ölü şemaydı, domain yalnızca birim testinden
 * çağrılıyordu) — bu modül o zinciri kapatır.
 *
 * `PlayerModule` import edilir çünkü çiftlik özeti oyuncunun var olduğunu
 * doğrular ve tesis yükseltmesi `players` satırını (parayı) kilitler —
 * `PLAYER_REPOSITORY` `StableModule`'ün kullandığıyla AYNI token'dır.
 *
 * `IdempotencyInterceptor` burada bir provider olarak listelenir
 * (`StableModule`/`RaceModule` ile AYNI gerekçe: `REDIS_CLIENT`'ı enjekte
 * edebilmesi için; `RedisModule` `@Global()` olduğundan ayrıca `imports`'a
 * eklenmesine GEREK YOKTUR).
 */
@Module({
  imports: [PlayerModule],
  controllers: [FarmController],
  providers: [
    GetFarmSummaryUseCase,
    UpgradeFacilityUseCase,
    { provide: FACILITY_REPOSITORY, useClass: PostgresFacilityRepository },
    IdempotencyInterceptor,
    FarmEffectsService,
  ],
  exports: [FarmEffectsService],
})
export class FarmModule {}
