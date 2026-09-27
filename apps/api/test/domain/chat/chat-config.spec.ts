import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadChatConfig } from '@at-sevdalisi/game-config';

/**
 * `config/chat.config.json` DEĞİŞMEZLERİ (invariants) — brief §13/§27.
 *
 * `social-config.spec.ts` ile AYNI gerekçe: `load*Config()` fonksiyonları
 * `JSON` import'unu tip iddiasıyla (`as unknown as X`) döndüren SAF
 * cast'lerdir, ÇALIŞMA ZAMANI DOĞRULAMASI YOKTUR.
 *
 * **BU DOSYANIN ASIL DEĞERİ:** `maxMessageLength` ile `race_messages`
 * tablosunun CHECK kısıtının AYNI sayıyı söylediğini MİGRASYON DOSYASINI
 * OKUYARAK kanıtlamasıdır. Sayıyı buraya elle yazmak (ör. `toBe(300)`)
 * yalnızca config'i sabitlerdi; migrasyon okunduğunda ise "config ile
 * veritabanı ayrıştı" hatası CI'da YAKALANIR — ki bu, kullanıcıya 500
 * dönen gerçek bir üretim hatasıdır.
 */
const config = loadChatConfig();

/** `social-config.spec.ts` ile AYNI "yukarı yürü" deseni (sabit `../..` sayısı iki çalıştırma yolundan birinde kırılırdı). */
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

const CHAT_MIGRATION = readdirSync(join(repoRoot, 'database', 'migrations')).find((name) =>
  name.endsWith('create_race_messages.up.sql'),
);

describe('chat.config.json — mesaj uzunluğu ile DB CHECK uyumu', () => {
  it('ilgili migrasyon dosyası bulunmalıdır (bulunamazsa test sessizce geçmemeli)', () => {
    // Bu iddia olmadan, dosya bir gün yeniden adlandırılırsa aşağıdaki
    // karşılaştırma `undefined` üzerinde çalışır ve koruma KAYBOLURDU.
    expect(CHAT_MIGRATION).toBeDefined();
  });

  it('maxMessageLength, `race_messages` CHECK kısıtıyla AYNI sayıdır', () => {
    const sql = readFileSync(join(repoRoot, 'database', 'migrations', CHAT_MIGRATION as string), 'utf-8');
    const match = /char_length\(body\)\s+BETWEEN\s+1\s+AND\s+(\d+)/i.exec(sql);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(config.maxMessageLength);
  });

  it('maxMessageLength makul bir aralıktadır (1 karakter "mesaj" olmaz, 10.000 sohbeti bozar)', () => {
    expect(Number.isInteger(config.maxMessageLength)).toBe(true);
    expect(config.maxMessageLength).toBeGreaterThanOrEqual(10);
    expect(config.maxMessageLength).toBeLessThanOrEqual(5_000);
  });
});

describe('chat.config.json — geçmiş limiti', () => {
  it('historyLimit pozitif bir tam sayıdır', () => {
    // 0 ya da NaN bir limit, SQL `LIMIT`'i sessizce anlamsızlaştırırdı
    // (`social-config.spec.ts`'teki AYNI gerekçe).
    expect(Number.isInteger(config.historyLimit)).toBe(true);
    expect(config.historyLimit).toBeGreaterThan(0);
  });

  it('historyLimit SQL `LIMIT` için güvenli bir üst sınırdadır', () => {
    expect(config.historyLimit).toBeLessThanOrEqual(1_000);
  });
});

describe('chat.config.json — hız sınırı (brief §32)', () => {
  it('limit ve pencere pozitif tam sayılardır', () => {
    expect(Number.isInteger(config.rateLimit.limit)).toBe(true);
    expect(config.rateLimit.limit).toBeGreaterThan(0);
    expect(Number.isInteger(config.rateLimit.windowSeconds)).toBe(true);
    expect(config.rateLimit.windowSeconds).toBeGreaterThan(0);
  });

  it('pencere en az 10 saniyedir (1-2 saniyelik bir pencere pratikte kimseyi durdurmaz)', () => {
    expect(config.rateLimit.windowSeconds).toBeGreaterThanOrEqual(10);
  });

  it('limit, pencerenin kendisinden KÜÇÜK ya da eşittir (saniyede birden fazla mesaj spam sayılır)', () => {
    // Anlamlı olması için: limit > windowSeconds ise saniyede birden fazla
    // mesaja izin verilir — sohbet kanalı için bu artık "sohbet" değil
    // "akın"dır. `social.config.json`'daki `pendingRequestsLimit <=
    // overviewRequestsLimit` değişmeziyle AYNI ruh.
    expect(config.rateLimit.limit).toBeLessThanOrEqual(config.rateLimit.windowSeconds);
  });
});
