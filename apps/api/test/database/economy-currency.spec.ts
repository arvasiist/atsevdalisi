import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENCIES } from '@at-sevdalisi/shared-types';
import { describe, expect, it } from 'vitest';

/**
 * Para birimi ↔ şema uyum denetimi (brief §1 "ANA PARA BİRİMİ", §14
 * "MULTIPLE CURRENCY").
 *
 * NEDEN VAR: para birimi kimlikleri kodda (`CURRENCIES`) ve şemada
 * (`economy_transactions.currency` üzerindeki `CHECK (currency IN (...))`,
 * `players` kolonları) AYRI AYRI yaşar. İkisi arasındaki kayma sessizdir:
 * koda yeni bir birim eklenip migration yazılmazsa istekler `23514`
 * (check_violation) ile 500 döner — ve bu yalnızca o yolu ÇAĞIRAN bir
 * e2e testi varsa görülür. Tersi de aynı: şemaya eklenip koda eklenmezse
 * `Record<Currency, ...>` eşlemeleri derleme hatası verir (iyi), ama
 * migration'daki fazladan değer fark edilmez (kötü).
 *
 * `sql-literals.spec.ts` ile AYNI desen ve AYNI gerekçe: SQL'i ÇALIŞTIRMADAN
 * (Postgres'e hiç ulaşmadan) kanıtlanabilen tek şey denetlenir. Bu dosyanın
 * `apps/api` altında olmasının sebebi, `CURRENCIES`'in bu paketin bağımlı
 * olduğu `@at-sevdalisi/shared-types`'ta yaşamasıdır.
 *
 * İKİNCİ BÖLÜM (`reference_id` tipi) ayrı bir gerekçeyle var: 27.09.2026'da
 * bulunan CRITICAL hatanın (bkz. migration 0031) bir daha SESSİZCE geri
 * gelmemesi için. O hatanın bu kadar uzun süre görünmemesinin sebebi,
 * `reference_id`'nin UUID tanımlanıp UUID OLMAYAN bir değerle ('arpa')
 * yazılmasıydı — hiçbir test şemadaki NİHAİ tipi denetlemiyordu.
 */

/**
 * Yukarı yürüme üst sınırı — `sql-literals.spec.ts` ile AYNI gerekçe:
 * `database/` bir gün bulunamazsa döngünün sonsuza gitmesini engeller.
 */
const MAX_PARENT_WALK_DEPTH = 10;

/** `sql-literals.spec.ts` ile AYNI yardımcı (bilinçli tekrar — iki test dosyası birbirine bağımlı olmasın). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < MAX_PARENT_WALK_DEPTH; depth += 1) {
    try {
      readdirSync(join(dir, 'database'));
      return dir;
    } catch {
      const parent = join(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error(`Depo kökü bulunamadı (database/ klasörü yok): ${startDir}`);
}

const repoRoot = findRepoRoot(process.cwd());
const MIGRATIONS_DIR = join(repoRoot, 'database', 'migrations');

/** Yalnızca İLERİ migration'lar okunur — `down.sql` geri alma yoludur, nihai şemayı temsil ETMEZ. */
function readUpMigrations(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.up.sql'))
    .sort()
    .map((name) => ({ file: name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf-8') }));
}

const migrations = readUpMigrations();

/** `CHECK (currency IN ('money', 'gems'))` kalıbındaki tırnaklı değerleri çıkarır. */
const CURRENCY_CHECK = /CHECK\s*\(\s*currency\s+IN\s*\(([^)]*)\)\s*\)/gi;
const QUOTED = /'([^']+)'/g;

describe('Para birimi modeli ↔ şema', () => {
  it('taranacak en az bir .up.sql migration bulunmalıdır (boş küme sessizce geçmemeli)', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it('CURRENCIES boş olmamalı ve tekrar içermemelidir', () => {
    expect(CURRENCIES.length).toBeGreaterThan(0);
    expect(new Set(CURRENCIES).size).toBe(CURRENCIES.length);
  });

  it('economy_transactions.currency CHECK listesi CURRENCIES ile BİREBİR aynı olmalı', () => {
    const declared = new Set<string>();
    for (const { sql } of migrations) {
      for (const match of sql.matchAll(CURRENCY_CHECK)) {
        for (const value of match[1]!.matchAll(QUOTED)) {
          declared.add(value[1]!);
        }
      }
    }

    // Boş küme "hiç kısıt yok" demektir — bu bir uyum DEĞİL, korumanın
    // kaybolmasıdır (CHECK kaldırılmış olabilir). Ayrı ve açık bir iddia.
    expect(
      declared.size,
      'Hiçbir migration\'da `CHECK (currency IN (...))` bulunamadı — kısıt kaldırılmış olabilir.',
    ).toBeGreaterThan(0);

    expect(
      [...declared].sort(),
      `Şemadaki para birimleri ile kod (CURRENCIES) uyuşmuyor.\n` +
        `  şema: ${[...declared].sort().join(', ')}\n` +
        `  kod : ${[...CURRENCIES].sort().join(', ')}`,
    ).toEqual([...CURRENCIES].sort());
  });

  it.each(CURRENCIES)("her para birimi için players tablosunda bir kolon olmalı ('%s')", (currency) => {
    // Kolon kalıbı: satır başında birim adı, ardından BIGINT (players'ın
    // bakiye kolonları — bkz. migration 0001). Başka hiçbir tabloda
    // `money`/`gems` adlı BIGINT kolon yoktur.
    const pattern = new RegExp(`^\\s*${currency}\\s+BIGINT\\b`, 'm');
    const found = migrations.filter(({ sql }) => pattern.test(sql));

    expect(
      found.length,
      `'${currency}' için players tablosunda BIGINT kolon bulunamadı. ` +
        `Yeni bir para birimi CURRENCIES'e eklendiyse migration'ı da yazılmalıdır.`,
    ).toBeGreaterThan(0);
  });
});

describe('economy_transactions.reference_id nihai tipi', () => {
  /**
   * Bir kolonun NİHAİ tipini, migration'ları sırayla uygulayarak bulur:
   * CREATE TABLE içindeki bildirim, sonraki ALTER COLUMN ... TYPE
   * ifadeleriyle ezilir. Yalnızca metin araması yeterli DEĞİLDİR — 0019'da
   * `reference_id UUID` yazısı HÂLÂ duruyor (tarihsel kayıt), 0031 onu
   * TEXT'e çeviriyor; doğru cevap "son ne olduğu"dur.
   */
  function resolveReferenceIdType(): string | null {
    let type: string | null = null;
    for (const { sql } of migrations) {
      const create = sql.match(/CREATE\s+TABLE\s+economy_transactions\s*\(([\s\S]*?)\n\s*\);/i);
      if (create) {
        const column = create[1]!.match(/^\s*reference_id\s+([A-Z]+)/im);
        if (column) type = column[1]!;
      }
      const alter = sql.match(
        /ALTER\s+TABLE\s+economy_transactions\s+ALTER\s+COLUMN\s+reference_id\s+TYPE\s+([A-Z]+)/i,
      );
      if (alter) type = alter[1]!;
    }
    return type;
  }

  it('nihai tip TEXT olmalıdır (migration 0031 — yem kalemi slug\'ları UUID değildir)', () => {
    expect(
      resolveReferenceIdType(),
      'reference_id yeniden UUID yapılmış. `buy-feed.use-case.ts` buraya ' +
        "`feedType` ('arpa', 'mama', ...) yazar; UUID tipi bu satırı 22P02 ile " +
        'reddedip TÜM satın alma transaction\'ını geri alır (bkz. migration 0031).',
    ).toBe('TEXT');
  });
});
