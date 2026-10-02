#!/usr/bin/env node
/**
 * VERİTABANI PARMAK İZİ (02.10.2026, Faz 13-C) — yedek/geri yükleme
 * provasında kaynak ile geri yüklenen veritabanının AYNI olduğunu kanıtlar.
 * Gizli veri yazdırmaz: yalnızca sayılar ve özetler.
 *
 *  - her tablonun satır sayısı (public şeması),
 *  - uygulanmış migration listesi,
 *  - defter: satır sayısı + tutar toplamı + (id, tutar, bakiye_sonra)
 *    sıralı özetinin SHA-256'sı (değiştirilemez defter birebir dönmeli),
 *  - oyuncu bakiyeleri toplamı.
 *
 * Kullanım: node tools/ops/db-fingerprint.mjs <DATABASE_URL>
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { Client } = require('pg');

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Kullanım: db-fingerprint.mjs <DATABASE_URL>');
  process.exit(2);
}
const client = new Client({ connectionString: url });
await client.connect();
try {
  const tables = (
    await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    )
  ).rows.map((row) => row.tablename);
  const rowCounts = {};
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*)::bigint AS n FROM "${table}"`);
    rowCounts[table] = Number(result.rows[0].n);
  }
  const migrations = tables.includes('schema_migrations')
    ? (await client.query('SELECT id FROM schema_migrations ORDER BY id')).rows.map((row) => row.id)
    : [];
  const ledgerRows = tables.includes('economy_transactions')
    ? (await client.query('SELECT id, amount, balance_after FROM economy_transactions ORDER BY id')).rows
    : [];
  const ledgerHash = createHash('sha256');
  let ledgerSum = 0n;
  for (const row of ledgerRows) {
    ledgerHash.update(`${row.id}|${row.amount}|${row.balance_after}\n`);
    ledgerSum += BigInt(row.amount);
  }
  const balances = tables.includes('players')
    ? (await client.query('SELECT COALESCE(SUM(money), 0)::text AS money, COALESCE(SUM(gems), 0)::text AS gems FROM players')).rows[0]
    : { money: '0', gems: '0' };
  console.log(
    JSON.stringify(
      {
        tables: tables.length,
        rowCounts,
        migrations,
        ledger: { rows: ledgerRows.length, sum: ledgerSum.toString(), sha256: ledgerHash.digest('hex') },
        balances,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
