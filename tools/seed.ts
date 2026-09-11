#!/usr/bin/env tsx
/**
 * Geliştirme ortamı seed script'i. SADECE development ortamında
 * çalıştırılmalıdır (bkz. database/seeds/001_dev_seed.sql üzerindeki uyarı).
 *
 * Kullanım: tsx tools/seed.ts
 * Gereksinim: DATABASE_URL ortam değişkeni.
 *
 * NOT: Bu script de tools/migrate.ts ile aynı ortam kısıtı nedeniyle bu
 * oturumda çalıştırılıp doğrulanamamıştır (bkz. docs/ARCHITECTURE.md §9).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const SEEDS_DIR = join(__dirname, '..', 'database', 'seeds');

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed script production ortamında çalıştırılamaz.');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL ortam değişkeni tanımlı değil.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const seedFiles = readdirSync(SEEDS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of seedFiles) {
      const sql = readFileSync(join(SEEDS_DIR, file), 'utf-8');
      console.log(`→ Seed uygulanıyor: ${file}`);
      await client.query(sql);
      console.log(`✔ Tamamlandı: ${file}`);
    }
  } finally {
    await client.end();
  }
}

void main();
