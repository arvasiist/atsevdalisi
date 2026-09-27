import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGiftConfig } from '@at-sevdalisi/game-config';
import { CURRENCIES } from '@at-sevdalisi/shared-types';
import { assertGiftConfigIsValid } from '../../../src/domain/gift/gift';

/**
 * `config/gift.config.json` DEĞİŞMEZLERİ (invariants).
 *
 * NEDEN AYRI BİR TEST: `packages/game-config/src/index.ts`'teki
 * `load*Config()` fonksiyonları `JSON` import'unu tip iddiasıyla
 * (`as unknown as X`) döndüren SAF cast'lerdir — ÇALIŞMA ZAMANI
 * DOĞRULAMASI YOKTUR (`social-config.spec.ts`/`grandstand-config.spec.ts`
 * ile AYNI gerekçe).
 *
 * **BU DOSYANIN ASIL DEĞERİ İKİ KANITTIR:**
 *   1. `allowedCurrencies` ile `gift_sends.currency` CHECK'i
 *      (`migration 0034`) AYNI değerleri söyler — MİGRASYON DOSYASI
 *      OKUNARAK. Ayrışsalardı, config'in izin verdiği bir birim
 *      veritabanında `23514` ile patlar ve kullanıcı 500 görürdü.
 *   2. `allowedCurrencies ⊆ CURRENCIES` (`shared-types`) — `game-config`
 *      paketi `shared-types`'a BAĞIMLI OLAMAZ (döngüsel bağımlılık), bu
 *      yüzden tip `string[]`'dir ve tutarlılık YALNIZCA burada
 *      kanıtlanabilir.
 *
 * Üçüncü bir kontrol daha vardır: `assertGiftConfigIsValid` — çalışma
 * zamanı kapısının kendi config'imizle GERÇEKTEN geçtiğini gösterir (kapı
 * ile config ayrışırsa üretimde HER hediye isteği patlardı).
 */
const config = loadGiftConfig();

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

const GIFT_MIGRATION = readdirSync(join(repoRoot, 'database', 'migrations')).find((name) =>
  name.endsWith('create_gift_sends.up.sql'),
);

describe('gift.config.json — migrasyonla uyum', () => {
  it('ilgili migrasyon dosyası bulunmalıdır (bulunamazsa test sessizce geçmemeli)', () => {
    // Bu iddia olmadan, dosya bir gün yeniden adlandırılırsa aşağıdaki
    // karşılaştırmalar `undefined` üzerinde çalışır ve koruma KAYBOLURDU
    // (`social-config.spec.ts`'in AYNI notu).
    expect(GIFT_MIGRATION).toBeDefined();
  });

  it('allowedCurrencies, `gift_sends.currency` CHECK kısıtıyla AYNI kümeyi söyler', () => {
    const sql = readFileSync(join(repoRoot, 'database', 'migrations', GIFT_MIGRATION as string), 'utf-8');
    const match = /currency\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*currency\s+IN\s*\(([^)]*)\)/i.exec(sql);
    expect(match).not.toBeNull();
    const dbCurrencies = (match?.[1] ?? '')
      .split(',')
      .map((value) => value.trim().replace(/^'|'$/g, ''))
      .filter((value) => value.length > 0);

    // EŞİTLİK (kapsama değil): DB'nin kabul ettiği ama config'in
    // yasakladığı bir birim zararsızdır ama KARMAŞIKTIR; config'in kabul
    // edip DB'nin reddettiği bir birim ise 500'dür. İkisini de kapatmak
    // için kümeler birebir karşılaştırılır.
    expect([...config.allowedCurrencies].sort()).toEqual([...dbCurrencies].sort());
  });

  it('allowedCurrencies ⊆ CURRENCIES (bilinmeyen bir birim hediye edilemez)', () => {
    // `game-config` `shared-types`'a bağımlı olamadığı için tip `string[]`'dir;
    // bu iddia, `resolveGiftCurrency`'nin `CURRENCIES` kontrolünü
    // config'imiz için ANLAMSIZ hâle getiren bir yazım hatasını yakalar.
    for (const currency of config.allowedCurrencies) {
      expect(CURRENCIES).toContain(currency);
    }
  });

  it('amount CHECK\'i (`amount > 0`) ile minAmount çelişmez', () => {
    // `minAmount` 1'den küçük olsaydı (ya da 0), domain'in "geçerli" dediği
    // bir miktar veritabanında `CHECK (amount > 0)`'a takılırdı.
    expect(config.minAmount).toBeGreaterThanOrEqual(1);
  });

  it('config, çalışma zamanı kapısından (`assertGiftConfigIsValid`) GERÇEKTEN geçer', () => {
    // Kapı ile config ayrışırsa üretimde HER hediye isteği — kullanıcı
    // girdisinden ÖNCE — patlardı; bu iddia o senaryoyu CI'ya taşır.
    expect(() => assertGiftConfigIsValid(config)).not.toThrow();
  });
});

describe('gift.config.json — sınırlar', () => {
  it('minAmount/maxAmount/dailyLimit/dailyWindowHours pozitif tam sayıdır', () => {
    const integers: [string, number][] = [
      ['minAmount', config.minAmount],
      ['maxAmount', config.maxAmount],
      ['dailyLimit', config.dailyLimit],
      ['dailyWindowHours', config.dailyWindowHours],
    ];
    for (const [name, value] of integers) {
      expect(Number.isInteger(value), `${name} tam sayı olmalı`).toBe(true);
      expect(value, `${name} pozitif olmalı`).toBeGreaterThan(0);
    }
  });

  it('minAmount <= maxAmount (aksi halde HİÇBİR miktar geçemez)', () => {
    expect(config.minAmount).toBeLessThanOrEqual(config.maxAmount);
  });

  it('maxAmount makul bir üst sınırdadır (tek istekte tüm bakiye taşınmasın)', () => {
    // `maxAmount` bir DENGE değil GÜVENLİK sınırıdır: ele geçirilmiş bir
    // oturumun tek istekte hesabı boşaltmasını engeller. Bu yüzden çok
    // yüksek bir değer (ör. 1 milyar) o korumayı anlamsızlaştırırdı.
    expect(config.maxAmount).toBeLessThanOrEqual(1_000_000);
  });

  it('dailyLimit makuldür (günlük tavan spam savunmasının SON hattıdır)', () => {
    expect(config.dailyLimit).toBeLessThanOrEqual(500);
  });

  it('dailyWindowHours "günlük" olarak adlandırılabilecek bir aralıktadır', () => {
    // 1 saatten kısa bir pencere `@RateLimit` ile çakışır (ikisi de
    // dakikalar ölçeğinde olurdu); 1 haftadan uzun bir pencere ise pratikte
    // tavanı kaldırırdı.
    expect(config.dailyWindowHours).toBeGreaterThanOrEqual(1);
    expect(config.dailyWindowHours).toBeLessThanOrEqual(168);
  });

  it('historyLimit pozitif ve SQL `LIMIT` için güvenli bir üst sınırdadır', () => {
    expect(Number.isInteger(config.historyLimit)).toBe(true);
    expect(config.historyLimit).toBeGreaterThan(0);
    expect(config.historyLimit).toBeLessThanOrEqual(1_000);
  });

  it('allowedCurrencies boş değildir (boşsa hiçbir hediye gönderilemez)', () => {
    expect(config.allowedCurrencies.length).toBeGreaterThan(0);
  });
});
