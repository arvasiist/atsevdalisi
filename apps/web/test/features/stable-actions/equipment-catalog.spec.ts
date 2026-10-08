import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_CATALOG,
  catalogItemsOfType,
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
      },
      price: item.priceMoney,
      money: 1000,
    });
    expect(text).toContain(item.name);
    expect(text).toContain(String(item.priceMoney));
  });
});
