import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Defter değişmezliği (immutability) — brief §20 "Her para hareketi
 * immutable transaction olarak kaydedilmeli", §22 "ECONOMY SECURITY".
 *
 * ## Neden STATİK bir test (Postgres'e hiç dokunmadan)
 *
 * Bu dosya, migration 0038'in ŞEKLİNİ denetler: trigger var mı, HANGİ
 * olaylarda ateşleniyor, fonksiyon gerçekten hata fırlatıyor mu, geri
 * alma (down) yolu trigger'ı düşürüyor mu. Bunlar SQL metninden
 * kanıtlanabilen şeylerdir ve Postgres gerektirmez — `sql-literals.spec.ts`
 * ile `economy-currency.spec.ts`'in AYNI deseni ve AYNI gerekçesi.
 *
 * **DAVRANIŞ ayrıca kanıtlanır:** "UPDATE gerçekten reddediliyor mu?"
 * sorusunun cevabı bir SQL metnini okumak DEĞİL, denemektir — o kanıt
 * `test/api/wallet.e2e-spec.ts` içindedir (gerçek `UPDATE`/`DELETE`
 * denemesi, `restrict_violation` beklentisiyle). İki dosya birlikte
 * "kural yazılı" + "kural işliyor" iddialarını kapatır.
 *
 * NEDEN BU KADAR ÖNEMLİ: defter şu an YALNIZCA ekleme yapıyor çünkü
 * hiçbir use-case `UPDATE` yazmıyor — bu bir GELENEK, kural değil.
 * Gelenek sessizce bozulur (bir düzeltme scripti, bir "hızlı tamir"
 * sorgusu); kural bozulmaz.
 */

/** `sql-literals.spec.ts`/`economy-currency.spec.ts` ile AYNI yardımcı (bilinçli tekrar — test dosyaları birbirine bağımlı olmasın). */
const MAX_PARENT_WALK_DEPTH = 10;

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

const MIGRATIONS_DIR = join(findRepoRoot(process.cwd()), 'database', 'migrations');

function readMigration(fileName: string): string {
  return readFileSync(join(MIGRATIONS_DIR, fileName), 'utf-8');
}

const IMMUTABILITY_MIGRATION = '0038_enforce_economy_ledger_immutability';

/**
 * SQL yorumlarını (`--` satır sonuna kadar) SOYAR.
 *
 * NEDEN GEREKLİ: migration'ların yorumları bu projede yoğundur ve
 * açıklama metni içinde `UPDATE economy_transactions` ya da
 * `pg_trigger_depth() > 1` geçmesi NORMALDİR. Yorumları soymadan
 * yapılan bir `toContain` araması, kuralı SİLİNSE bile yorumda geçtiği
 * için yeşil kalırdı — yani test hiçbir şeyi kanıtlamazdı.
 */
function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const commentAt = line.indexOf('--');
      return commentAt === -1 ? line : line.slice(0, commentAt);
    })
    .join('\n');
}

const upSql = stripSqlComments(readMigration(`${IMMUTABILITY_MIGRATION}.up.sql`));
const downSql = stripSqlComments(readMigration(`${IMMUTABILITY_MIGRATION}.down.sql`));

describe('economy_transactions değişmezliği — migration 0038 (brief §20/§22)', () => {
  it('migration dosyaları okunabilmeli (yol değişirse sessizce geçmemeli)', () => {
    expect(upSql.length).toBeGreaterThan(0);
    expect(downSql.length).toBeGreaterThan(0);
  });

  it('defter üzerinde bir trigger tanımlanmalı', () => {
    expect(
      /CREATE\s+TRIGGER\s+\w+\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+economy_transactions/i.test(upSql),
      'economy_transactions üzerinde BEFORE UPDATE OR DELETE trigger bulunamadı — ' +
        'brief §20 değişmezlik güvencesi kaldırılmış olabilir.',
    ).toBe(true);
  });

  it('trigger satır bazında olmalı (FOR EACH ROW)', () => {
    expect(/FOR\s+EACH\s+ROW/i.test(upSql)).toBe(true);
  });

  it('trigger fonksiyonu REDDETMELİ (RAISE EXCEPTION)', () => {
    expect(
      /RAISE\s+EXCEPTION/i.test(upSql),
      'Trigger fonksiyonunda RAISE EXCEPTION yok — trigger sessizce geçer ve defter değiştirilebilir kalır.',
    ).toBe(true);
  });

  it('reddin hata kodu tanımlı olmalı (uygulama 500 yerine anlamlı hata görebilsin)', () => {
    expect(/ERRCODE\s*=/i.test(upSql)).toBe(true);
  });

  it('UPDATE ve DELETE AYRI AYRI reddedilmeli — ikisi de tek bir koşulda birleşmemeli', () => {
    // `TG_OP` kontrolü olmadan yazılmış bir trigger, CASCADE silmeyi de
    // engeller ve oyuncu silmeyi kırar (bkz. aşağıdaki test).
    expect(/TG_OP/.test(upSql)).toBe(true);
  });

  it('CASCADE silme için AÇIK ve DAR bir istisna bulunmalı (pg_trigger_depth)', () => {
    // `economy_transactions.player_id` üzerindeki `ON DELETE CASCADE`
    // (migration 0019) yüzünden bu istisna ZORUNLUDUR; kaldırılırsa
    // oyuncu silme `restrict_violation` ile patlar.
    expect(
      /pg_trigger_depth\(\)\s*>\s*1/i.test(upSql),
      'CASCADE istisnası (pg_trigger_depth() > 1) bulunamadı — koşulsuz DELETE yasağı ' +
        'oyuncu silmeyi de kırar.',
    ).toBe(true);
  });

  it('istisna YALNIZCA DELETE dalında olmalı — UPDATE hiçbir koşulda muaf tutulmamalı', () => {
    // UPDATE'in istisnasız reddedilmesi kritiktir: tutar tahrifatı
    // (ör. `SET amount = 999999`) muhasebeyi çökertir ve CASCADE'in
    // UPDATE ile bir ilgisi YOKTUR. Bu yüzden `pg_trigger_depth()`
    // kontrolü geçen TEK `IF` ifadesi, aynı zamanda `TG_OP = 'DELETE'`
    // de kontrol ediyor olmalıdır.
    const branchesWithDepth = [...upSql.matchAll(/IF\b[\s\S]{0,300}?THEN/gi)].filter((match) =>
      /pg_trigger_depth/i.test(match[0]),
    );

    expect(
      branchesWithDepth.length,
      'pg_trigger_depth() kontrolü içeren bir IF dalı bulunamadı.',
    ).toBeGreaterThan(0);

    for (const branch of branchesWithDepth) {
      expect(
        /TG_OP\s*=\s*'DELETE'/i.test(branch[0]),
        'Değişmezlik istisnası DELETE dışında bir işleme de uygulanmış — UPDATE muaf tutulmuş olabilir.',
      ).toBe(true);
    }
  });

  it('geri alma (down) yolu trigger’ı ve fonksiyonu düşürmeli', () => {
    expect(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+\w+\s+ON\s+economy_transactions/i.test(downSql)).toBe(true);
    expect(/DROP\s+FUNCTION\s+IF\s+EXISTS/i.test(downSql)).toBe(true);
  });

  it('down dosyası tabloyu DÜŞÜRMEMELİ (yalnızca kuralı kaldırır, veriyi değil)', () => {
    expect(/DROP\s+TABLE/i.test(downSql)).toBe(false);
    expect(/DELETE\s+FROM/i.test(downSql)).toBe(false);
  });

  it('trigger adı up ve down dosyalarında AYNI olmalı (kopyala-yapıştır kayması)', () => {
    const upName = upSql.match(/CREATE\s+TRIGGER\s+(\w+)/i)?.[1];
    const downName = downSql.match(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+(\w+)/i)?.[1];
    expect(upName).toBeDefined();
    expect(downName).toBe(upName);
  });

  it('fonksiyon adı up ve down dosyalarında AYNI olmalı', () => {
    const upName = upSql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(\w+)/i)?.[1];
    const downName = downSql.match(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+(\w+)/i)?.[1];
    expect(upName).toBeDefined();
    expect(downName).toBe(upName);
  });

  it('yorum soyma gerçekten çalışıyor (testin kendi güvencesi)', () => {
    // Bu iddia olmadan `stripSqlComments` bir gün bozulsa (ör. blok yorum
    // desteği eklenirken), yukarıdaki testler yorum metinlerini "kural"
    // sanıp yeşil kalabilirdi.
    expect(stripSqlComments('-- RAISE EXCEPTION\nSELECT 1;')).not.toContain('RAISE');
    expect(stripSqlComments('SELECT 1; -- RAISE EXCEPTION')).toContain('SELECT 1;');
  });
});
