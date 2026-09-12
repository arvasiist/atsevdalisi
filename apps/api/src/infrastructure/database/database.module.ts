import { Global, Module } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { AppConfigService } from '../config/config.service';

export const PG_POOL = Symbol('PG_POOL');

/**
 * Birden fazla ifadeyi tek bir atomik işlemde çalıştırır (BEGIN/COMMIT,
 * hata durumunda ROLLBACK). FAZ 1 wiring, dördüncü dilim (bu oturum) —
 * ilk kullanım: `PostgresHorseRepository.save()` (bir at ve ona ait
 * `horse_stats` satırının BİRLİKTE var olması gerekir, bkz.
 * docs/ROADMAP.md "Dördüncü dilim: Antrenman"). `pool.query(...)` yerine
 * AYNI bağlantı (`PoolClient`) üzerinden çalışır — aksi halde her `query()`
 * çağrısı havuzdan farklı bir bağlantı alabileceğinden `BEGIN`/`COMMIT`
 * ayrı bağlantılara gidebilir ve transaction hiçbir şeyi kapsamaz.
 */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * PostgreSQL connection pool. Domain katmanı bu modülü asla doğrudan
 * import etmez (bkz. docs/ARCHITECTURE.md §4); sadece Infrastructure
 * katmanındaki repository implementasyonları kullanır.
 *
 * Kritik işlemler (para, mülkiyet) için transaction/row-locking kuralları
 * docs/SECURITY.md §5'te tanımlıdır.
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
