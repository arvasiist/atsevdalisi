import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES as SHARED_NOTIFICATION_TYPES } from '@at-sevdalisi/shared-types';
import {
  NOTIFICATION_TYPES,
  normalizeNotificationPayload,
  parseNotificationType,
} from '../../../src/domain/social/notification';

/**
 * Bildirim TÜR LİSTESİNİN ÜÇ KOPYASINI birbirine bağlar (brief §28, §42
 * PHASE 11).
 *
 * Aynı liste üç yerde yaşamak ZORUNDADIR ve üçünün de farklı bir amacı
 * vardır:
 *
 * 1. `notifications.type` CHECK kısıtı (migration 0039) — veritabanı son
 *    savunma hattı. Yazılamayan bir tür, üretimde 500 demektir.
 * 2. `apps/api/src/domain/social/notification.ts` → `NOTIFICATION_TYPES` —
 *    API'nin derleme zamanı daraltması.
 * 3. `packages/shared-types/src/notification.ts` → `NOTIFICATION_TYPES` —
 *    istemcinin gördüğü sözleşme (`NotificationView`nun `type` alanı).
 *
 * ÜÇÜNDEN BİRİ GÜNCELLENİP DİĞERİ UNUTULURSA, hata SESSİZ olur: TypeScript
 * iki `as const` dizisinin aynı olduğunu KENDİLİĞİNDEN denetlemez (ikisi de
 * `string[]`e genişler) ve veritabanı CHECK'i yalnızca o tür ilk kez
 * yazılmaya çalışıldığında, üretimde patlar. Bu dosya o boşluğu kapatır.
 *
 * `social-config.spec.ts`teki "yukarı yürü" deseninin AYNISI: sabit `../..`
 * sayısı iki çalıştırma yolundan (workspace kökü / `apps/api`) birinde
 * kırılırdı.
 */
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

// 02.10.2026 — kısıt 0056'da genişletildi: yürürlükteki tanım, `notifications`
// CHECK'ini yazan EN SON `up` migration'ıdır (dosya adı sırası = uygulama sırası).
const NOTIFICATION_MIGRATION = readdirSync(join(repoRoot, 'database', 'migrations'))
  .filter((name) => name.endsWith('.up.sql'))
  .sort()
  .filter((name) => {
    const sql = readFileSync(join(repoRoot, 'database', 'migrations', name), 'utf-8');
    return sql.includes('notifications') && sql.includes('CHECK (type IN (');
  })
  .at(-1);

/**
 * Migration dosyasındaki `CHECK (type IN (...))` listesini okur.
 *
 * Dosyayı METİN olarak okumak bilinçlidir: config'i (ya da TS listesini)
 * kendi kopyasıyla karşılaştırmak hiçbir şeyi kanıtlamazdı — asıl soru
 * "veritabanı ne kabul ediyor"dur.
 */
function readMigrationNotificationTypes(): string[] {
  const sql = readFileSync(
    join(repoRoot, 'database', 'migrations', NOTIFICATION_MIGRATION as string),
    'utf-8',
  );
  const start = sql.indexOf('CHECK (type IN (');
  if (start === -1) throw new Error('`notifications.type` CHECK kısıtı bulunamadı.');
  const end = sql.indexOf('))', start);
  if (end === -1) throw new Error('CHECK kısıtının kapanışı bulunamadı.');
  return [...sql.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

describe('NOTIFICATION_TYPES — üç kopya birebir aynı olmalı', () => {
  it('ilgili migrasyon dosyası bulunmalıdır (bulunamazsa test sessizce geçmemeli)', () => {
    // Bu iddia olmadan dosya yeniden adlandırılırsa `readFileSync`
    // `undefined` yolunda patlar ve hata mesajı sebebi anlatmaz.
    expect(NOTIFICATION_MIGRATION).toBeDefined();
  });

  it('domain listesi ile `packages/shared-types` listesi AYNI ve AYNI SIRADA', () => {
    // Sıra da denetlenir: istemci ikonları sıraya göre eşlerse (ör. bir
    // `switch` yerine indeks), yalnızca küme eşitliği yetmezdi.
    expect([...NOTIFICATION_TYPES]).toEqual([...SHARED_NOTIFICATION_TYPES]);
  });

  it('domain listesi ile migrasyon CHECK listesi AYNI (küme olarak)', () => {
    const fromMigration = readMigrationNotificationTypes();
    expect(new Set(fromMigration)).toEqual(new Set(NOTIFICATION_TYPES));
    // Uzunluk da denetlenir: `Set` karşılaştırması yinelenen bir değeri
    // (ör. `race_invite` iki kez yazılmış) GİZLERDİ.
    expect(fromMigration).toHaveLength(NOTIFICATION_TYPES.length);
  });

  it('müzayede bildirimleri (02.10.2026) eksiksiz', () => {
    for (const type of ['auction_outbid', 'auction_won', 'auction_sold', 'auction_unsold', 'auction_refunded']) {
      expect(NOTIFICATION_TYPES).toContain(type);
    }
    expect(NOTIFICATION_MIGRATION).toBe('0056_add_auction_notifications.up.sql');
  });

  it('brief §28in SEKİZ türünü eksiksiz içerir', () => {
    // Sabit yazılır (listenin kendisinden türetilmez): liste bir gün
    // yanlışlıkla kısaltılırsa test kırılsın — kendi kendini doğrulayan
    // bir test hiçbir şeyi korumaz.
    const brief = [
      'friend_request',
      'friend_accepted',
      'race_invite',
      'gift_received',
      'message_received',
      'race_starting',
      'race_finished',
      'prize_won',
    ];
    for (const type of brief) {
      expect(NOTIFICATION_TYPES).toContain(type);
    }
  });

  it('türler `snake_case`tir (CHECK deseni yalnızca `[a-z_]` kabul eder)', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(type).toMatch(/^[a-z][a-z_]*[a-z]$/);
    }
  });
});

describe('parseNotificationType — bilinmeyen türü sessizce eler', () => {
  it('tanımlı türleri döndürür', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(parseNotificationType(type)).toBe(type);
    }
  });

  it('bilinmeyen türde `null` döner (fırlatmaz)', () => {
    // `null` dönmesi bilinçlidir: çağıran satırı ATLAR. Tek bir bozuk
    // satır yüzünden tüm bildirim listesini 500 yapmak, ekranı tamamen
    // karartırdı (bkz. `notification.ts` doc yorumu).
    for (const value of ['race_invite_2', 'RACE_INVITE', '', null, undefined, 7, {}, []]) {
      expect(parseNotificationType(value)).toBeNull();
    }
  });
});

describe('normalizeNotificationPayload — bozuk JSONB`ı `{}`a indirger', () => {
  it('düz nesneyi OLDUĞU GİBİ döndürür', () => {
    const payload = { inviteId: 'abc', raceName: 'Ayrılık Kupası' };
    expect(normalizeNotificationPayload(payload)).toBe(payload);
  });

  it('nesne OLMAYAN her şeyi `{}`a çevirir', () => {
    // JSONB sütunu teorik olarak dizi/sayı/null da içerebilir; CHECK
    // yalnızca "geçerli JSON" der. Bunlar istemciye olduğu gibi gitseydi
    // `NotificationView.payload` sözleşmesi çalışma anında çiğnenirdi.
    for (const value of [null, undefined, 42, 'metin', true, [1, 2, 3], []]) {
      expect(normalizeNotificationPayload(value)).toEqual({});
    }
  });

  it('iç içe nesneyi bozmaz (yalnızca üst seviyeyi doğrular)', () => {
    const payload = { race: { id: 'r1' }, tags: ['a'] };
    expect(normalizeNotificationPayload(payload)).toEqual({ race: { id: 'r1' }, tags: ['a'] });
  });
});
