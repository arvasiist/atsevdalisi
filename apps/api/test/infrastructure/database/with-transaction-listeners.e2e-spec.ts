import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../../../src/infrastructure/database/database.module';

/**
 * 16.10.2026 — `withTransaction` her çağrıda havuz client'ına bir 'error'
 * dinleyicisi ekleyip hiç kaldırmıyordu; havuz aynı bağlantıyı yeniden
 * kullandığı için dinleyiciler birikiyordu (testlerde
 * `MaxListenersExceededWarning`, uzun süreçte bellek). Tek bağlantılı havuzla
 * 25 transaction sonra dinleyici sayısı SABİT kalmalı.
 */
describe('withTransaction — client dinleyicisi birikmez', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  afterAll(async () => {
    await pool.end();
  });

  it('25 transaction sonra aynı bağlantıdaki error dinleyicisi sayısı artmaz', async () => {
    const counts: number[] = [];
    for (let index = 0; index < 25; index += 1) {
      await withTransaction(pool, async (client) => {
        counts.push(client.listenerCount('error'));
        await client.query('SELECT 1');
      });
    }
    expect(new Set(counts).size).toBe(1);
  });
});
