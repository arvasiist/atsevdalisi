import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSocialConfig } from '@at-sevdalisi/game-config';

/**
 * `config/social.config.json` DEĞİŞMEZLERİ (invariants).
 *
 * NEDEN AYRI BİR TEST: `packages/game-config/src/index.ts`'teki
 * `load*Config()` fonksiyonları `JSON` import'unu tip iddiasıyla
 * (`as unknown as X`) döndüren SAF cast'lerdir — ÇALIŞMA ZAMANI
 * DOĞRULAMASI YOKTUR (`grandstand-config.spec.ts` ile AYNI gerekçe).
 *
 * **BU DOSYANIN ASIL DEĞERİ:** `maxMessageLength` ile `direct_messages`
 * tablosunun CHECK kısıtının AYNI sayıyı söylediğini MİGRASYON DOSYASINI
 * OKUYARAK kanıtlamasıdır. Sayıyı buraya elle yazmak (ör. `toBe(500)`)
 * yalnızca config'i sabitlerdi; migrasyon okunduğunda ise "config ile
 * veritabanı ayrıştı" hatası CI'da YAKALANIR — ki bu, kullanıcıya 500
 * dönen gerçek bir üretim hatasıdır.
 */
const config = loadSocialConfig();

/** `sql-literals.spec.ts` ile AYNI "yukarı yürü" deseni (sabit `../..` sayısı iki çalıştırma yolundan birinde kırılırdı). */
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

const SOCIAL_MIGRATION = readdirSync(join(repoRoot, 'database', 'migrations')).find((name) =>
  name.endsWith('create_friendships_and_messages.up.sql'),
);

describe('social.config.json — mesaj uzunluğu ile DB CHECK uyumu', () => {
  it('ilgili migrasyon dosyası bulunmalıdır (bulunamazsa test sessizce geçmemeli)', () => {
    // Bu iddia olmadan, dosya bir gün yeniden adlandırılırsa aşağıdaki
    // karşılaştırma `undefined` üzerinde çalışır ve koruma KAYBOLURDU.
    expect(SOCIAL_MIGRATION).toBeDefined();
  });

  it('maxMessageLength, `direct_messages` CHECK kısıtıyla AYNI sayıdır', () => {
    const sql = readFileSync(join(repoRoot, 'database', 'migrations', SOCIAL_MIGRATION as string), 'utf-8');
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

describe('social.config.json — limitler', () => {
  const limits: [string, number, number][] = [
    ['overviewFriendsLimit', config.overviewFriendsLimit, 1_000],
    ['overviewRequestsLimit', config.overviewRequestsLimit, 1_000],
    ['pendingRequestsLimit', config.pendingRequestsLimit, 500],
    ['inboxLimit', config.inboxLimit, 1_000],
    ['conversationLimit', config.conversationLimit, 1_000],
  ];

  it.each(limits)('%s pozitif bir tam sayıdır', (_name, value) => {
    // 0 ya da NaN bir limit, ya her isteği 409 yapardı
    // (`assertUnderSocialLimit`'in bozuk-config dalı) ya da SQL `LIMIT`'i
    // sessizce anlamsızlaştırırdı.
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });

  it.each(limits)('%s SQL `LIMIT` için güvenli bir üst sınırdadır', (_name, value, max) => {
    expect(value).toBeLessThanOrEqual(max);
  });

  it('bekleyen istek TAVANI, liste limitinden KÜÇÜK ya da eşittir', () => {
    // Anlamlı olması için: tavan, listede gösterilebilecekten fazlasına
    // izin verirse liste "kırpılmış" görünür ve kullanıcı isteklerinin bir
    // kısmını hiç göremez — tavanı bir hata mesajıyla öğrenmesi gerekirken.
    expect(config.pendingRequestsLimit).toBeLessThanOrEqual(config.overviewRequestsLimit);
  });
});
