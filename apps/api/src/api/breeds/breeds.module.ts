import { Module } from '@nestjs/common';
import { BREED_SHOP_REPOSITORY } from '../../application/ports/breed-shop.repository';
import { BreedShopUseCase } from '../../application/use-cases/breed-shop.use-case';
import { PostgresBreedShopRepository } from '../../infrastructure/horse/postgres-breed-shop.repository';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { BreedsController } from './breeds.controller';

/** At ırkları — ırk mağazası (07.10.2026, migration 0069). */
@Module({
  controllers: [BreedsController],
  providers: [
    BreedShopUseCase,
    IdempotencyInterceptor,
    { provide: BREED_SHOP_REPOSITORY, useClass: PostgresBreedShopRepository },
  ],
})
export class BreedsModule {}
