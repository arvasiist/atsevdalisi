import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfigService } from '../config/config.service';

export const PG_POOL = Symbol('PG_POOL');

/**
 * PostgreSQL connection pool. Domain katmanı bu modülü asla doğrudan
 * import etmez (bkz. docs/ARCHITECTURE.md §4); sadece Infrastructure
 * katmanındaki repository implementasyonları kullanır.
 *
 * Kritik işlemler (para, mülkiyet) için transaction/row-locking kuralları
 * docs/SECURITY.md §5'te tanımlıdır; `withTransaction()` yardımcı fonksiyonu
 * FAZ 1'de buraya eklenecektir.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Pool({
          connectionString: config.env.databaseUrl,
        }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
