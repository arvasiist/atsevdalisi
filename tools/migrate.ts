#!/usr/bin/env tsx
/**
 * Basit, bağımlılığı minimum bir SQL migration runner.
 *
 * Neden özel bir script: brief §55 "database migration altyapısını
 * kuracak" gereksinimini, ORM'e bağlı kalmadan (ileride Prisma/Knex'e
 * kolayca taşınabilecek şekilde) saf SQL ile karşılar.
 *
 * Kullanım:
 *   tsx tools/migrate.ts up      # uygulanmamış tüm migration'ları uygular
 *   tsx tools/migrate.ts down    # son uygulanan migration'ı geri alır
 *
 * Gereksinim: DATABASE_URL ortam değişkeni (bkz. apps/api/.env.example).
 *
 * NOT: Bu script bu geliştirme ortamında ÇALIŞTIRILAMAMIŞTIR çünkü (a) `pg`
 * paketi npm registry kısıtı nedeniyle kurulu değildir, (b) erişilebilir bir
 * PostgreSQL sunucusu yoktur. Mantığı elden geçirilmiş ve gözden
 * geçirilmiştir; ilk gerçek çalıştırmada ortaya çıkabilecek küçük
 * sorunlar bir sonraki oturumda hızlıca giderilecektir (bkz.
 * docs/ARCHITECTURE.md §9).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = join(__dirname, '..', 'database', 'migrations');

interface MigrationFile {
  id: string; // örn. "0001_create_extensions_and_players"
  upPath: string;
  downPath: string;
}

function listMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR);
  const upFiles = files.filter((f) => f.endsWith('.up.sql')).sort();

  return upFiles.map((upFile) => {
    const id = upFile.replace(/\.up\.sql$/, '');
    return {
      id,
      upPath: join(MIGRATIONS_DIR, upFile),
      downPath: join(MIGRATIONS_DIR, `${id}.down.sql`),
    };
  });
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrationIds(client: Client): Promise<Set<string>> {
  const result = await client.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
  return new Set(result.rows.map((row) => row.id));
}

async function up(client: Client): Promise<void> {
  await ensureMigrationsTable(client);
  const applied = await getAppliedMigrationIds(client);
  const migrations = listMigrations();

  const pending = migrations.filter((m) => !applied.has(m.id));
  if (pending.length === 0) {
    console.log('Uygulanacak yeni migration yok.');
    return;
  }

  for (const migration of pending) {
    const sql = readFileSync(migration.upPath, 'utf-8');
    console.log(`→ Uygulanıyor: ${migration.id}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
      await client.query('COMMIT');
      console.log(`✔ Tamamlandı: ${migration.id}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✘ Hata: ${migration.id}`, error);
      throw error;
    }
  }
}

async function down(client: Client): Promise<void> {
  await ensureMigrationsTable(client);
  const applied = await getAppliedMigrationIds(client);
  if (applied.size === 0) {
    console.log('Geri alınacak migration yok.');
    return;
  }

  const lastAppliedId = [...applied].sort().at(-1)!;
  const migrations = listMigrations();
  const migration = migrations.find((m) => m.id === lastAppliedId);
  if (!migration) {
    throw new Error(`Migration dosyası bulunamadı: ${lastAppliedId}`);
  }

  const sql = readFileSync(migration.downPath, 'utf-8');
  console.log(`→ Geri alınıyor: ${migration.id}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('DELETE FROM schema_migrations WHERE id = $1', [migration.id]);
    await client.query('COMMIT');
    console.log(`✔ Geri alındı: ${migration.id}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✘ Hata: ${migration.id}`, error);
    throw error;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'up' && command !== 'down') {
    console.error('Kullanım: tsx tools/migrate.ts <up|down>');
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
    if (command === 'up') {
      await up(client);
    } else {
      await down(client);
    }
  } finally {
    await client.end();
  }
}

void main();
