import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGrandstandConfig } from '@at-sevdalisi/game-config';
import {
  CLIENT_DRAWN_TRIBUNE_GIFTS,
  isRaceOpenForTribuneGifts,
  resolveTribuneGift,
  tribuneGiftOwnerShare,
  validateTribuneGiftsConfig,
} from '../../../src/domain/grandstand/tribune-gift';

/**
 * TRİBÜN HEDİYESİ (08.10.2026, migration 0075) — saf kurallar ve config ↔
 * migration CHECK uyumu (ayrışırsa config'teki hediye çalışma anında 500 olurdu).
 */
const config = loadGrandstandConfig().tribuneGifts;
const MIGRATIONS = join(__dirname, '../../../../../database/migrations');

describe('tribün hediyesi — config', () => {
  it('gerçek config geçerli; nal gibi Unicode\'u olmayan hediyeyi istemci çizer', () => {
    expect(validateTribuneGiftsConfig(config)).toEqual([]);
    expect(config.items.map((item) => item.key)).toContain('horseshoe');
    for (const item of config.items.filter((candidate) => !candidate.emoji)) {
      expect(CLIENT_DRAWN_TRIBUNE_GIFTS).toContain(item.key);
    }
  });

  it('CHECK kısıtını yazan EN SON migration config anahtarlarıyla birebir', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith('.up.sql'))
      .sort()
      .filter((file) => readFileSync(join(MIGRATIONS, file), 'utf8').includes('tribune_gifts_gift_key_valid'));
    const latest = readFileSync(join(MIGRATIONS, files.at(-1)!), 'utf8');
    const listed = [...latest.matchAll(/gift_key IN \(([^)]*)\)/g)].at(-1)![1]!;
    const keys = [...listed.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
    expect(keys).toEqual(config.items.map((item) => item.key));
  });

  it('bozuk config yakalanır: tekrar anahtar, simgesiz, sıfır pay, aralık dışı yüzde', () => {
    const item = { key: 'carrot', name: 'Havuç', emoji: '🥕', price: 10 };
    expect(validateTribuneGiftsConfig({ ...config, items: [item, item] }).length).toBeGreaterThan(0);
    expect(validateTribuneGiftsConfig({ ...config, items: [{ ...item, emoji: '' }] }).length).toBeGreaterThan(0);
    expect(validateTribuneGiftsConfig({ ...config, items: [{ ...item, price: 1 }], ownerSharePercent: 50 }).length).toBe(1);
    expect(validateTribuneGiftsConfig({ ...config, ownerSharePercent: 101 }).length).toBeGreaterThan(0);
    expect(validateTribuneGiftsConfig({ ...config, items: [] }).length).toBeGreaterThan(0);
  });
});

describe('tribün hediyesi — kural', () => {
  it('anahtar yalnızca katalogdan çözülür (fiyat istemciden gelmez)', () => {
    expect(resolveTribuneGift('carrot', config)?.price).toBe(config.items[0]!.price);
    expect(resolveTribuneGift('elmas-yuzuk', config)).toBeNull();
    expect(resolveTribuneGift('KÖTÜ', config)).toBeNull();
    expect(resolveTribuneGift(7, config)).toBeNull();
  });

  it('sahibin payı aşağı yuvarlanır ve fiyatı aşmaz; fark ekonomiden çıkar', () => {
    expect(tribuneGiftOwnerShare(10, 70)).toBe(7);
    expect(tribuneGiftOwnerShare(15, 70)).toBe(10);
    for (const item of config.items) {
      const share = tribuneGiftOwnerShare(item.price, config.ownerSharePercent);
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThan(item.price);
    }
  });

  it('pencere: iptal kapalı; başlangıçtan giftWindowHours sonrasına kadar açık', () => {
    const start = new Date('2026-10-08T12:00:00Z');
    const hours = (h: number) => new Date(start.getTime() + h * 3_600_000);
    expect(isRaceOpenForTribuneGifts('scheduled', start, hours(-1), 48)).toBe(true);
    expect(isRaceOpenForTribuneGifts('finished', start, hours(48), 48)).toBe(true);
    expect(isRaceOpenForTribuneGifts('finished', start, hours(48.01), 48)).toBe(false);
    expect(isRaceOpenForTribuneGifts('cancelled', start, hours(1), 48)).toBe(false);
  });
});
