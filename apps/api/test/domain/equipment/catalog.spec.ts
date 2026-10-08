import { describe, expect, it } from 'vitest';
import { loadEquipmentConfig, loadProgressionConfig } from '@at-sevdalisi/game-config';
import {
  assertCanBuyEquipment,
  EquipmentLevelLockedError,
  findEquipmentItem,
  validateEquipmentConfig,
} from '../../../src/domain/equipment/catalog';
import { InvalidEquipmentInputError } from '../../../src/domain/equipment/errors';
import { EQUIPMENT_TYPES } from '../../../src/domain/equipment/validation';

/**
 * EKİPMAN KATALOĞU (08.10.2026). Kalite ve fiyat config'tedir; istemci yalnızca
 * anahtar seçer. Kilitlenenler: gerçek katalog geçerli; her tipin kalemi var;
 * aynı tipte daha kaliteli kalem daha ucuz olamaz (ucuz yoldan azami bonus
 * kapısı); bilinmeyen anahtar ve seviye şartı reddedilir.
 */
const config = loadEquipmentConfig();
const maxLevel = loadProgressionConfig().maxLevel;
const base = { key: 'a', equipmentType: 'saddle', name: 'Eyer', quality: 40, priceMoney: 100, requiredLevel: 1 };

describe('ekipman kataloğu', () => {
  it('gerçek katalog geçerli ve beş tipin hepsini kapsar', () => {
    expect(() => validateEquipmentConfig(config, maxLevel)).not.toThrow();
    for (const type of EQUIPMENT_TYPES) {
      expect(config.catalog.some((item) => item.equipmentType === type)).toBe(true);
    }
  });

  it('bozuk katalog API açılışını durdurur', () => {
    const others = EQUIPMENT_TYPES.filter((type) => type !== 'saddle').map((type, index) => ({
      ...base,
      key: `x-${index}`,
      equipmentType: type,
    }));
    const valid = { catalog: [base, ...others] };
    expect(() => validateEquipmentConfig(valid, maxLevel)).not.toThrow();
    // Daha kaliteli ama daha ucuz.
    expect(() =>
      validateEquipmentConfig({ catalog: [...valid.catalog, { ...base, key: 'b', quality: 90, priceMoney: 50 }] }, maxLevel),
    ).toThrow(/ucuz/);
    expect(() => validateEquipmentConfig({ catalog: [...valid.catalog, { ...base }] }, maxLevel)).toThrow(/tekrarlı/);
    expect(() =>
      validateEquipmentConfig({ catalog: [...valid.catalog, { ...base, key: 'c', quality: 101 }] }, maxLevel),
    ).toThrow(/kalite/);
    expect(() =>
      validateEquipmentConfig({ catalog: [...valid.catalog, { ...base, key: 'd', equipmentType: 'kask' }] }, maxLevel),
    ).toThrow(/tip/);
    expect(() =>
      validateEquipmentConfig({ catalog: [...valid.catalog, { ...base, key: 'e', priceMoney: 0 }] }, maxLevel),
    ).toThrow(/fiyat/);
    expect(() =>
      validateEquipmentConfig({ catalog: [...valid.catalog, { ...base, key: 'f', requiredLevel: maxLevel + 1 }] }, maxLevel),
    ).toThrow(/seviye/);
    expect(() => validateEquipmentConfig({ catalog: [base] }, maxLevel)).toThrow(/kalem yok/);
  });

  it('anahtar yalnızca katalogdan çözülür (kalite istemciden gelmez)', () => {
    const first = config.catalog[0]!;
    expect(findEquipmentItem(config, first.key)).toBe(first);
    expect(() => findEquipmentItem(config, 'altin-eyer')).toThrow(InvalidEquipmentInputError);
    expect(() => findEquipmentItem(config, undefined)).toThrow(InvalidEquipmentInputError);
    expect(() => findEquipmentItem(config, { quality: 100 })).toThrow(InvalidEquipmentInputError);
  });

  it('seviye şartı', () => {
    const locked = config.catalog.find((item) => item.requiredLevel > 1)!;
    expect(() => assertCanBuyEquipment(locked, locked.requiredLevel - 1)).toThrow(EquipmentLevelLockedError);
    expect(() => assertCanBuyEquipment(locked, locked.requiredLevel)).not.toThrow();
  });
});
