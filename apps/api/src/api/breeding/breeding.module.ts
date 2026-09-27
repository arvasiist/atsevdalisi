import { Module } from '@nestjs/common';
import { BREEDING_REPOSITORY } from '../../application/ports/breeding.repository';
import { BreedHorsesUseCase } from '../../application/use-cases/breed-horses.use-case';
import { PostgresBreedingRepository } from '../../infrastructure/breeding/postgres-breeding.repository';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { BreedingController } from './breeding.controller';

/**
 * Çiftleştirme modülü — soy ağacı veri zincirinin ÜÇÜNCÜ (yazma) parçası.
 *
 * **HİÇBİR modül İMPORT ETMEZ.** `HorseModule`'ün `PEDIGREE_REPOSITORY`'si
 * (soy ağacı OKUMA yolu) burada KULLANILMAZ: `PostgresBreedingRepository`
 * ebeveynlerin soy kaydını kendi transaction'ının İÇİNDE, kilitli
 * satırlarla okumak ZORUNDADIR; `PedigreeRepository` ise havuzdan kendi
 * bağlantısını alır (`this.pool.query`). Onu buraya enjekte etmek "aynı
 * transaction" garantisini SESSİZCE kırardı — `GiftModule`'ün
 * `SOCIAL_REPOSITORY`'yi repository'ye enjekte etmeme gerekçesiyle AYNI.
 * Aynı sebeple `HORSE_REPOSITORY`/`PLAYER_REPOSITORY` de enjekte EDİLMEZ:
 * repository ihtiyaç duyduğu `horses`/`players` satırlarını kendi SQL'iyle,
 * kendi kilidi altında okur.
 *
 * `PG_POOL` ve `AppConfigService` GLOBAL modüllerden gelir
 * (`DatabaseModule`/`AppConfigModule` — `GiftModule` ile AYNI durum), bu
 * yüzden burada ayrıca import EDİLMEZ.
 *
 * `IdempotencyInterceptor` `GiftModule`/`MarketModule` ile AYNI gerekçeyle
 * burada `providers`'a eklenir: interceptor'ın kendi bağımlılıkları
 * (`REDIS_CLIENT` vb.) global modüllerden çözülür, ama DI konteynerinde
 * ÇÖZÜLEBİLMESİ için bir modülde kayıtlı olması gerekir.
 */
@Module({
  controllers: [BreedingController],
  providers: [
    BreedHorsesUseCase,
    IdempotencyInterceptor,
    { provide: BREEDING_REPOSITORY, useClass: PostgresBreedingRepository },
  ],
})
export class BreedingModule {}
