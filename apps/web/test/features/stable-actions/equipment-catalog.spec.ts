import { describe, expect, it } from 'vitest';
import {
  COSMETIC_EQUIPMENT_TYPES,
  EQUIPMENT_CATALOG,
  EQUIPMENT_TYPE_LABELS,
  PERFORMANCE_EQUIPMENT_TYPES,
  catalogItemsOfType,
  describeCatalogItem,
  describeDurability,
  isWornOut,
  describeEquipmentPurchase,
  equipmentPurchaseBlock,
} from '../../../src/features/stable-actions/equipment-catalog';

/** 08.10.2026 — ekipman katalog paneli: ucuzdan pahalıya, seviye/bakiye düğme durumu. */
describe('ekipman kataloğu paneli', () => {
  it('her tip için kalemler ucuzdan pahalıya; kalite fiyatla artar', () => {
    const saddles = catalogItemsOfType('saddle');
    expect(saddles.length).toBeGreaterThan(0);
    for (let index = 1; index < saddles.length; index += 1) {
      expect(saddles[index]!.priceMoney).toBeGreaterThanOrEqual(saddles[index - 1]!.priceMoney);
      expect(saddles[index]!.quality).toBeGreaterThanOrEqual(saddles[index - 1]!.quality);
    }
    expect(EQUIPMENT_CATALOG.every((item) => item.priceMoney > 0)).toBe(true);
  });

  it('düğme: seviye yetmiyorsa "level", çip yetmiyorsa "money", yoksa açık', () => {
    const locked = EQUIPMENT_CATALOG.find((item) => item.requiredLevel > 1)!;
    expect(equipmentPurchaseBlock(locked, { level: locked.requiredLevel - 1, money: 1_000_000 })).toBe('level');
    expect(equipmentPurchaseBlock(locked, { level: locked.requiredLevel, money: locked.priceMoney - 1 })).toBe('money');
    expect(equipmentPurchaseBlock(locked, { level: locked.requiredLevel, money: locked.priceMoney })).toBeNull();
    expect(equipmentPurchaseBlock(locked, null)).toBe('money');
  });

  it('alım metni ad + fiyat taşır', () => {
    const item = EQUIPMENT_CATALOG[0]!;
    const text = describeEquipmentPurchase({
      item: {
        id: 'e',
        horseId: 'h',
        equipmentType: 'saddle',
        name: item.name,
        quality: item.quality,
        equipped: false,
        createdAt: '2026-10-08T00:00:00Z',
        catalogKey: item.key,
        maxRaces: 40,
        racesRemaining: 40,
        surface: null,
        wornOutAt: null,
      },
      price: item.priceMoney,
      money: 1000,
    });
    expect(text).toContain(item.name);
    expect(text).toContain(String(item.priceMoney));
  });

  // 16.10.2026 (brief §8)
  it('her tipin (performans + kozmetik) adı ve katalog kalemi var', () => {
    for (const type of [...PERFORMANCE_EQUIPMENT_TYPES, ...COSMETIC_EQUIPMENT_TYPES]) {
      expect(EQUIPMENT_TYPE_LABELS[type].length).toBeGreaterThan(0);
      expect(catalogItemsOfType(type).length).toBeGreaterThan(0);
    }
  });

  it('kozmetik kalem "yarışa etkisi yok" der; zemine özel nal zeminini yazar', () => {
    const blanket = EQUIPMENT_CATALOG.find((item) => item.equipmentType === 'blanket')!;
    expect(describeCatalogItem(blanket)).toContain('yarışa etkisi yok');
    const grassShoe = EQUIPMENT_CATALOG.find((item) => item.surface === 'grass')!;
    expect(describeCatalogItem(grassShoe)).toContain('yalnızca Çim zeminde etkili');
    expect(describeCatalogItem(grassShoe)).toContain(`${grassShoe.durabilityRaces} yarış dayanır`);
  });

  it('dayanıklılık metni sunucunun sayılarından; 0 = aşındı, null = aşınmaz', () => {
    expect(describeDurability({ maxRaces: 40, racesRemaining: 12, surface: null })).toBe('12/40 yarış kaldı');
    expect(describeDurability({ maxRaces: 20, racesRemaining: 5, surface: 'dirt' })).toBe('5/20 yarış kaldı · yalnızca Toprak zeminde');
    expect(describeDurability({ maxRaces: 40, racesRemaining: 0, surface: null })).toBe('Aşındı — yenisini al');
    expect(describeDurability({ maxRaces: null, racesRemaining: null, surface: null })).toBe('Aşınmaz');
    expect(isWornOut({ racesRemaining: 0 })).toBe(true);
    expect(isWornOut({ racesRemaining: null })).toBe(false);
  });
});
