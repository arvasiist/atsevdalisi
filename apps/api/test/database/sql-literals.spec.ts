import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SQL kimlik literalleri denetimi.
 *
 * NEDEN VAR (27.09.2026): `database/seeds/001_dev_seed.sql` içindeki TÜM
 * kimlik literalleri geçersizdi (`...0000t1`, `...000h01`, `...000j01` —
 * `t`/`h`/`j` bir onaltılık basamak DEĞİLDİR). Postgres bu satırları
 * `invalid input syntax for type uuid` ile reddeder, yani `npm run seed`
 * (bkz. `tools/seed.ts`) HER ZAMAN patlıyordu.
 *
 * Hatanın bu kadar uzun süre görünmemesinin sebebi yapısal: `npm run test`
 * (CI'da çalışan komut) SQL dosyalarını HİÇ ÇALIŞTIRMAZ, yalnızca
 * `npm run migrate` çalıştırır — ve o da yalnızca `database/migrations/`
 * klasörünü okur, `seeds/` klasörünü DEĞİL. Yani bozuk bir seed dosyası
 * CI'da YEŞİL verebilir. Bu test o boşluğu kapatır: seed dosyalarını
 * GERÇEKTEN okur ve kimlik literallerini şekil + geçerlilik olarak
 * denetler. `apps/api`'nin altında olmasının sebebi, `seed` script'inin
 * bizzat `apps/api/package.json` içinde tanımlı olmasıdır.
 *
 * KAPSAM BİLİNÇLİ OLARAK DAR: burada SQL'in ANLAMINI denetlemiyorum
 * (sütun adları, FK sırası, NOT NULL'lar — bunlar gerçek bir Postgres
 * gerektirir ve e2e testlerin işidir). Yalnızca, Postgres'e hiç
 * ULAŞMADAN kanıtlanabilen tek şey denetlenir: literalin onaltılık
 * olarak geçerli olup olmadığı.
 */

/**
 * Yukarı yürüme üst sınırı. Amaç: bir gün `database/` klasörü hiç
 * bulunamazsa (ör. yanlış bir kökten çalıştırılırsa) döngünün sonsuza
 * kadar yukarı çıkmasını ENGELLEMEK. Depo köküne en fazla 3-4 seviyede
 * ulaşılır; 10 rahat bir üst sınırdır, gerçek bir mesafe DEĞİLDİR.
 */
const MAX_PARENT_WALK_DEPTH = 10;

/**
 * Test dosyasının konumuna GÜVENMEZ; `process.cwd()`'den yukarı yürüyerek
 * `database/` klasörünü arar. Sebep: bu test hem `apps/api` içinden
 * (`npm run test --workspace=apps/api`, cwd = `apps/api`) hem de depo
 * kökünden (`npx vitest run --root apps/api`) çalıştırılabilir; sabit bir
 * `../../..` sayısı bu iki durumdan birinde kırılırdı. `__dirname`/
 * `import.meta.url` de bilinçli olarak KULLANILMADI — bu depodaki hiçbir
 * mevcut test onlara dayanmıyor ve Vitest'in modül moduna göre biri
 * diğerinde tanımsız kalabilirdi.
 */
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

/** UUID ŞEKLİ (8-4-4-4-12, tireli) — onaltılık GEÇERLİLİĞİNDEN bağımsız olarak yakalar. Bu kritik: amaç zaten geçersiz olanı YAKALAMAK. */
const UUID_SHAPE_IN_QUOTES = /'([0-9a-zA-Z]{8}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{12})'/g;

/** Geçerli bir UUID: her grup YALNIZCA 0-9 ve a-f içerir. */
const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const repoRoot = findRepoRoot(process.cwd());

const SQL_DIRS = [
  { label: 'seed', dir: join(repoRoot, 'database', 'seeds') },
  { label: 'migration', dir: join(repoRoot, 'database', 'migrations') },
];

function readSqlFiles(dir: string): { file: string; sql: string }[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ file: name, sql: readFileSync(join(dir, name), 'utf-8') }));
}

describe.each(SQL_DIRS)('SQL kimlik literalleri — $label ($dir)', ({ dir }) => {
  const files = readSqlFiles(dir);

  it('taranacak en az bir .sql dosyası bulunmalıdır (boş küme sessizce geçmemeli)', () => {
    // Bu iddia olmadan, klasör yolu bir gün yanlış olursa test HİÇBİR dosya
    // okumaz ve "hiç geçersiz literat yok" diyerek YEŞİL verirdi — yani
    // koruma sessizce kaybolurdu.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('$file içindeki tüm UUID literalleri geçerli onaltılık olmalı', ({ file, sql }) => {
    const invalid: string[] = [];
    for (const match of sql.matchAll(UUID_SHAPE_IN_QUOTES)) {
      const literal = match[1]!;
      if (!VALID_UUID.test(literal)) {
        invalid.push(literal);
      }
    }

    // Hata mesajı KASITLI olarak eyleme dönüktür: hangi literalin neden
    // geçersiz olduğunu (ilk onaltılık olmayan karakteri) doğrudan söyler,
    // çünkü bu hatanın ilk seferde bulunması zor olan kısmı "hangi karakter
    // yanlış" sorusuydu.
    const details = invalid.map((literal) => {
      const badChar = [...literal].find((ch) => !/[0-9a-f-]/i.test(ch));
      return `  '${literal}' — geçersiz karakter: '${badChar ?? '?'}'`;
    });

    expect(
      invalid,
      invalid.length === 0
        ? ''
        : `${file} içinde ${invalid.length} geçersiz UUID literali var ` +
            `(Postgres bunları "invalid input syntax for type uuid" ile reddeder):\n${details.join('\n')}`,
    ).toEqual([]);
  });
});
