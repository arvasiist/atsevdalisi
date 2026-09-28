import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_CATEGORIES } from '../../../src/domain/social/moderation';
import {
  CannotBlockSelfError,
  CannotReportSelfError,
  InvalidReportCategoryError,
  InvalidReportReasonError,
  PlayerBlockedError,
} from '../../../src/domain/social/errors';
import {
  assertNoBlock,
  assertNotSelfBlock,
  assertNotSelfReport,
  normalizeReportReason,
  parseReportCategory,
} from '../../../src/domain/social/moderation';

/**
 * `domain/social/moderation.ts` — BLOCK / REPORT kuralları (brief §33,
 * §42 PHASE 15).
 *
 * NEDEN DOMAIN'DE TEST EDİLİYOR (DTO'da değil): CLAUDE.md "Kardeş tuzak" —
 * Vitest/esbuild altında DTO dekoratörleri (`@IsIn`, `@IsString`,
 * `@MaxLength`) sessizce ATLANIR; yani bu testler, CI'da gerçekten çalışan
 * TEK doğrulama katmanını doğrular (`validation.spec.ts` ile AYNI gerekçe).
 */

/** `social-config.spec.ts` ile AYNI "yukarı yürü" deseni. */
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

const repoRoot = findRepoRoot(process.cwd());

const MODERATION_MIGRATION = readdirSync(join(repoRoot, 'database', 'migrations')).find((name) =>
  name.endsWith('create_player_blocks_and_reports.up.sql'),
);

describe('REPORT_CATEGORIES ↔ player_reports.category CHECK uyumu', () => {
  it('ilgili migrasyon dosyası bulunmalıdır (bulunamazsa test sessizce geçmemeli)', () => {
    // Bu iddia olmadan, dosya bir gün yeniden adlandırılırsa aşağıdaki
    // karşılaştırma `undefined` üzerinde çalışır ve koruma KAYBOLURDU
    // (`social-config.spec.ts` ile AYNI gerekçe).
    expect(MODERATION_MIGRATION).toBeDefined();
  });

  it('domain listesi ile DB CHECK listesi BİREBİR aynıdır', () => {
    // ASIL DEĞER BURADADIR: liste domain'de genişleyip migration'da
    // genişlemezse INSERT `23514` ile patlar ve istemci 500 görürdü —
    // bu test o hatayı CI'da yakalar.
    const sql = readFileSync(
      join(repoRoot, 'database', 'migrations', MODERATION_MIGRATION as string),
      'utf-8',
    );
    const match = /category\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*category\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(sql);
    expect(match).not.toBeNull();

    const fromSql = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(fromSql.sort()).toEqual([...REPORT_CATEGORIES].sort());
  });

  it('`other` kategorisi listede VARDIR (kapalı liste beklenmeyen durumu bildirilemez kılardı)', () => {
    expect(REPORT_CATEGORIES).toContain('other');
  });

  it('kategoriler TEKİLDİR', () => {
    expect(new Set(REPORT_CATEGORIES).size).toBe(REPORT_CATEGORIES.length);
  });
});

describe('parseReportCategory', () => {
  it.each(REPORT_CATEGORIES)('geçerli kategoriyi kabul eder: %s', (category) => {
    expect(parseReportCategory(category)).toBe(category);
  });

  it.each([
    ['SPAM', 'büyük harf — sözlük küçük harftir'],
    ['Spam', 'karışık harf'],
    ['', 'boş metin'],
    ['  spam  ', 'kırpılmaz: sözlük eşleşmesi TAM olmalıdır'],
    ['racism', 'sözlükte olmayan bir kategori'],
    ['other ', 'sondaki boşluk'],
  ])('geçersiz metni reddeder: %s (%s)', (value) => {
    expect(() => parseReportCategory(value)).toThrow(InvalidReportCategoryError);
  });

  it.each([[undefined], [null], [1], [true], [['spam']], [{ category: 'spam' }]])(
    'metin OLMAYAN değeri reddeder: %s',
    (value) => {
      // `typeof value === 'string'` kontrolü şart: daraltılmamış `unknown`
      // üzerinde `includes` çağrılsaydı tip güvenliği kaybolurdu
      // (`parseFriendshipAction` ile AYNI).
      expect(() => parseReportCategory(value)).toThrow(InvalidReportCategoryError);
    },
  );

  it('hatırlatıcı ham değeri taşır (hata ayıklama için)', () => {
    try {
      parseReportCategory('racism');
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect((error as InvalidReportCategoryError).value).toBe('racism');
    }
  });
});

describe('normalizeReportReason', () => {
  const MAX = 500;

  it('baş/son boşlukları KIRPAR', () => {
    expect(normalizeReportReason('  spam yapıyor  ', MAX)).toBe('spam yapıyor');
  });

  it('normal metni olduğu gibi döner', () => {
    expect(normalizeReportReason('mesaj yağmuru', MAX)).toBe('mesaj yağmuru');
  });

  it.each([
    [undefined, 'alan hiç gönderilmemiş'],
    [null, 'açıkça null'],
    ['', 'boş metin'],
    ['   ', 'yalnızca boşluk'],
    ['\n\t ', 'yalnızca boşluk karakterleri'],
  ])('gerekçesizliği NULLa indirger: %s (%s)', (value) => {
    // BOŞ METİN GEÇERLİDİR: gerekçe isteğe bağlıdır (brief §33 yalnızca
    // "REPORT USER" der). Boşluğu hata yapmak, kategoriyi seçmiş bir
    // oyuncuyu serbest metin yazmaya zorlardı. Boş dize yazmak ise "gerekçe
    // yok" ile "boş gerekçe yazıldı" arasında ayırt edilemeyen iki durum
    // yaratırdı.
    expect(normalizeReportReason(value, MAX)).toBeNull();
  });

  it('TAM sınır uzunluğu kabul eder', () => {
    const reason = 'a'.repeat(MAX);
    expect(normalizeReportReason(reason, MAX)).toBe(reason);
  });

  it('sınırın BİR FAZLASINI TOO_LONG olarak reddeder', () => {
    try {
      normalizeReportReason('a'.repeat(MAX + 1), MAX);
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect((error as InvalidReportReasonError).reason).toBe('TOO_LONG');
      expect((error as InvalidReportReasonError).maxLength).toBe(MAX);
    }
  });

  it('kırpma SONRASI uzunluğa bakar (kırpılmış metin sınırda kalıyorsa geçer)', () => {
    // Aksi hâlde sonuna binlerce boşluk ekleyen bir istemci, gerekçesi
    // sınırın ALTINDA olduğu hâlde reddedilirdi.
    const reason = ` ${'a'.repeat(MAX)} `;
    expect(normalizeReportReason(reason, MAX)).toBe('a'.repeat(MAX));
  });

  it('uzunluğu KOD NOKTASI sayar — emoji, DB `char_length` ile AYNI sonucu verir', () => {
    // `normalizeMessageBody` ile AYNI ölçüm: JS `str.length` UTF-16 birimi
    // sayardı ve sunucu, veritabanının kabul edeceği geçerli bir gerekçeyi
    // reddederdi.
    const emoji = '👍'.repeat(MAX);
    expect(emoji.length).toBe(MAX * 2); // UTF-16 birimi — yanlış ölçüm
    expect(normalizeReportReason(emoji, MAX)).toBe(emoji); // kod noktası — doğru
  });

  it.each([[42], [true], [['spam']], [{ reason: 'x' }]])(
    'metin OLMAYAN gerekçeyi NOT_A_STRING olarak reddeder: %s',
    (value) => {
      try {
        normalizeReportReason(value, MAX);
        expect.unreachable('hata fırlatmalıydı');
      } catch (error) {
        expect((error as InvalidReportReasonError).reason).toBe('NOT_A_STRING');
      }
    },
  );
});

describe('assertNotSelfBlock / assertNotSelfReport', () => {
  it('kendini engellemeyi reddeder', () => {
    expect(() => assertNotSelfBlock('p1', 'p1')).toThrow(CannotBlockSelfError);
  });

  it('farklı iki oyuncuda geçer', () => {
    expect(() => assertNotSelfBlock('p1', 'p2')).not.toThrow();
  });

  it('kendini şikâyet etmeyi reddeder', () => {
    expect(() => assertNotSelfReport('p1', 'p1')).toThrow(CannotReportSelfError);
  });

  it('farklı iki oyuncuda geçer', () => {
    expect(() => assertNotSelfReport('p1', 'p2')).not.toThrow();
  });
});

describe('assertNoBlock', () => {
  it('engel YOKSA geçer', () => {
    expect(() => assertNoBlock(false)).not.toThrow();
  });

  it('engel VARSA PlayerBlockedError fırlatır', () => {
    expect(() => assertNoBlock(true)).toThrow(PlayerBlockedError);
  });

  it('mesajı YÖN SIZDIRMAZ', () => {
    // Tek bir hata sınıfı, iki yön için: engelleyen de engellenen de aynı
    // metni görür. Yönü ayırt eden bir mesaj, engellenen oyuncuya "seni
    // engelledi" bilgisini sızdırırdı (bkz. `ErrorCode.PlayerBlocked`).
    const error = new PlayerBlockedError();
    expect(error.message).not.toMatch(/engelledi|engellendi|seni/i);
  });
});
