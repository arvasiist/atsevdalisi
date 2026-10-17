import { Module } from '@nestjs/common';
import { FarmModule } from '../farm/farm.module';
import { HorseModule } from '../horse/horse.module';
import {
  BREEDING_OFFER_REPOSITORY,
  BREEDING_RANDOM,
  BREEDING_REPOSITORY,
} from '../../application/ports/breeding.repository';
import { BreedHorsesUseCase } from '../../application/use-cases/breed-horses.use-case';
import { BreedingCenterUseCase } from '../../application/use-cases/breeding-center.use-case';
import { ListStudsUseCase } from '../../application/use-cases/list-studs.use-case';
import { CryptoBreedingRandom } from '../../infrastructure/breeding/crypto-breeding-random';
import { PostgresBreedingOfferRepository } from '../../infrastructure/breeding/postgres-breeding-offer.repository';
import { PostgresBreedingRepository } from '../../infrastructure/breeding/postgres-breeding.repository';
import { BreedingScheduler } from '../../infrastructure/scheduler/breeding.scheduler';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { BreedingController } from './breeding.controller';

/**
 * Çiftleştirme + çiftleştirme merkezi + gebelik (brief §4–§5). `HorseModule`
 * at sahipliği guard'ı (`HORSE_REPOSITORY`) ve kariyer özeti için içe alınır.
 */
@Module({
  imports: [FarmModule, HorseModule],
  controllers: [BreedingController],
  providers: [
    BreedHorsesUseCase,
    ListStudsUseCase,
    BreedingCenterUseCase,
    BreedingScheduler,
    IdempotencyInterceptor,
    { provide: BREEDING_REPOSITORY, useClass: PostgresBreedingRepository },
    { provide: BREEDING_OFFER_REPOSITORY, useClass: PostgresBreedingOfferRepository },
    { provide: BREEDING_RANDOM, useClass: CryptoBreedingRandom },
  ],
})
export class BreedingModule {}
