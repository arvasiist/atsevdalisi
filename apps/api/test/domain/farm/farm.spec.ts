import { describe, expect, it } from 'vitest';
import {
  assertCanHireMoreStaff,
  buildFacility,
  canHireMoreStaff,
  getBreedingCenterHealthRiskMultiplier,
  getFarrierAreaInjuryRiskMultiplier,
  getFacilityBonusValue,
  getMaxDefinedFacilityLevel,
  getMaxStaffCapacity,
  getNextFacilityUpgradeCost,
  getNextFacilityUpgradeOffer,
  getPaddockRecoveryMultiplier,
  getTrainingTrackInjuryRiskMultiplier,
  getVetCenterCostMultiplier,
  getWarehouseFeedCostMultiplier,
  summarizeFacilities,
  summarizeFacility,
  upgradeFacility,
} from '../../../src/domain/farm/farm';
import { InvalidFacilityTypeError, MaxFacilityLevelReachedError, StaffCapacityExceededError } from '../../../src/domain/farm/errors';
import { FACILITY_TYPES, parseFacilityType } from '../../../src/domain/farm/validation';
import farmConfigJson from '../../../../../config/farm.config.json';
import type { FarmConfig } from '@at-sevdalisi/game-config';

const config = farmConfigJson as unknown as FarmConfig;

describe('getNextFacilityUpgradeCost', () => {
  it('level 0 için 1. seviye maliyetini döner (ilk inşa)', () => {
    const cost = getNextFacilityUpgradeCost('paddock', 0, config);
    expect(cost.nextLevel).toBe(1);
    expect(cost.currency).toBe('money');
    expect(cost.amount).toBeGreaterThan(0);
  });

  it('seviye arttıkça maliyet de artar', () => {
    const level1 = getNextFacilityUpgradeCost('vet_center', 0, config);
    const level2 = getNextFacilityUpgradeCost('vet_center', 1, config);
    expect(level2.amount).toBeGreaterThan(level1.amount);
  });

  it('tanımlı en yüksek seviyeye ulaşınca MaxFacilityLevelReachedError fırlatır', () => {
    const maxLevel = getMaxDefinedFacilityLevel('farrier_area', config);
    expect(() => getNextFacilityUpgradeCost('farrier_area', maxLevel, config)).toThrow(MaxFacilityLevelReachedError);
  });
});

describe('getFacilityBonusValue', () => {
  it('level 0 (inşa edilmemiş) için her zaman 0 döner', () => {
    expect(getFacilityBonusValue('paddock', 0, config)).toBe(0);
  });

  it('seviye arttıkça bonus değeri de artar (tanımlı bir seviyede)', () => {
    const level1 = getFacilityBonusValue('training_track', 1, config);
    const level2 = getFacilityBonusValue('training_track', 2, config);
    expect(level2).toBeGreaterThan(level1);
  });

  it('tanımsız bir ara seviye için altındaki en yüksek tanımlı seviyenin değerini kullanır', () => {
    // warehouse maxLevel=2; 50 tanımlı değil, seviye 2'nin değeri kullanılmalı.
    expect(getFacilityBonusValue('warehouse', 50, config)).toBe(getFacilityBonusValue('warehouse', 2, config));
  });
});

describe('buildFacility / upgradeFacility', () => {
  it('yeni bir tesisi level 1 olarak inşa eder', () => {
    const { facility, cost } = buildFacility({ id: 'f1', ownerId: 'player-1', type: 'paddock' }, config);
    expect(facility.level).toBe(1);
    expect(facility.ownerId).toBe('player-1');
    expect(cost.nextLevel).toBe(1);
  });

  it('var olan bir tesisi bir seviye yükseltir', () => {
    const { facility } = buildFacility({ id: 'f1', ownerId: 'player-1', type: 'vet_center' }, config);
    const upgraded = upgradeFacility(facility, config, new Date('2026-02-01T00:00:00Z'));
    expect(upgraded.facility.level).toBe(2);
    expect(upgraded.cost.nextLevel).toBe(2);
  });

  it('en yüksek seviyedeki bir tesisi yükseltmeye çalışırsa hata fırlatır', () => {
    let current = buildFacility({ id: 'f1', ownerId: 'player-1', type: 'farrier_area' }, config).facility;
    const maxLevel = getMaxDefinedFacilityLevel('farrier_area', config);
    while (current.level < maxLevel) {
      current = upgradeFacility(current, config).facility;
    }
    expect(() => upgradeFacility(current, config)).toThrow(MaxFacilityLevelReachedError);
  });
});

describe('bonus çarpanları [artış/azaltma] kontrollü aralıkta kalır', () => {
  it('getPaddockRecoveryMultiplier her zaman >= 1 döner', () => {
    expect(getPaddockRecoveryMultiplier(0, config)).toBe(1);
    expect(getPaddockRecoveryMultiplier(3, config)).toBeGreaterThan(1);
    expect(getPaddockRecoveryMultiplier(3, config)).toBeLessThanOrEqual(2);
  });

  it.each([
    ['training_track' as const, getTrainingTrackInjuryRiskMultiplier],
    ['vet_center' as const, getVetCenterCostMultiplier],
    ['farrier_area' as const, getFarrierAreaInjuryRiskMultiplier],
    ['breeding_center' as const, getBreedingCenterHealthRiskMultiplier],
    ['warehouse' as const, getWarehouseFeedCostMultiplier],
  ])('%s azaltma çarpanı her zaman (0.5, 1] aralığındadır', (type, getMultiplier) => {
    const maxLevel = getMaxDefinedFacilityLevel(type, config);
    expect(getMultiplier(0, config)).toBe(1);
    const atMax = getMultiplier(maxLevel, config);
    expect(atMax).toBeLessThan(1);
    expect(atMax).toBeGreaterThan(0.5);
  });
});

describe('personel kapasitesi (staff_building)', () => {
  it('hiç inşa edilmemişken (level 0) taban kapasiteyi döner', () => {
    expect(getMaxStaffCapacity(0, config)).toBe(config.baseStaffCapacityWithoutFacility);
  });

  it('seviye arttıkça kapasite de artar', () => {
    const level1 = getMaxStaffCapacity(1, config);
    const level2 = getMaxStaffCapacity(2, config);
    expect(level2).toBeGreaterThan(level1);
    expect(level1).toBeGreaterThan(config.baseStaffCapacityWithoutFacility);
  });

  it('canHireMoreStaff kapasite dolunca false döner', () => {
    const capacity = getMaxStaffCapacity(0, config);
    expect(canHireMoreStaff(capacity - 1, capacity)).toBe(true);
    expect(canHireMoreStaff(capacity, capacity)).toBe(false);
  });

  it('assertCanHireMoreStaff kapasite dolunca StaffCapacityExceededError fırlatır', () => {
    const capacity = getMaxStaffCapacity(0, config);
    expect(() => assertCanHireMoreStaff(capacity, capacity)).toThrow(StaffCapacityExceededError);
    expect(() => assertCanHireMoreStaff(capacity - 1, capacity)).not.toThrow();
  });
});

/**
 * brief §32 "Çiftlik" ekranı (bu turda EKLENDİ) — `GET /players/:id/farm`'in
 * gösterim adımı. Beklenen değerler `config/farm.config.json`'dan elle
 * doğrulanmıştır: paddock seviye 1 = 6000 money, warehouse seviye 1 = 4000
 * money, warehouse maxLevel = 2.
 */
describe('getNextFacilityUpgradeOffer', () => {
  it('level 0 için İLK İNŞANIN teklifini döner (paddock → seviye 1, 6.000 ₺)', () => {
    expect(getNextFacilityUpgradeOffer('paddock', 0, config)).toEqual({
      nextLevel: 1,
      cost: { currency: 'money', amount: 6000 },
    });
  });

  it('en yüksek seviyede null döner — HATA FIRLATMAZ (fırlatan kardeşiyle karşıtlık test edilir)', () => {
    const maxLevel = getMaxDefinedFacilityLevel('farrier_area', config);
    expect(getNextFacilityUpgradeOffer('farrier_area', maxLevel, config)).toBeNull();
    // Aynı girdiyle `getNextFacilityUpgradeCost` FIRLATIR: "tavanda" bir hata
    // değil normal bir DURUMDUR, bu yüzden ekranın try/catch yazması
    // gerekmesin diye ayrı bir fonksiyon vardır.
    expect(() => getNextFacilityUpgradeCost('farrier_area', maxLevel, config)).toThrow(MaxFacilityLevelReachedError);
  });

  it('her seviyede teklifin maliyeti getNextFacilityUpgradeCost ile BİREBİR aynıdır', () => {
    // Bu test, config değiştiğinde iki fonksiyonun sessizce ayrışmasını
    // ENGELLER — elle yazılmış bir sayı yerine doğrudan karşılaştırma yapılır.
    for (const type of FACILITY_TYPES) {
      const maxLevel = getMaxDefinedFacilityLevel(type, config);
      for (let level = 0; level < maxLevel; level += 1) {
        const cost = getNextFacilityUpgradeCost(type, level, config);
        expect(getNextFacilityUpgradeOffer(type, level, config)).toEqual({
          nextLevel: cost.nextLevel,
          cost: { currency: cost.currency, amount: cost.amount },
        });
      }
    }
  });
});

describe('summarizeFacility / summarizeFacilities', () => {
  it('inşa edilmemiş tesis (level 0) sıfır bonusla gelir ama ilk inşa teklifi DOLU olur', () => {
    expect(summarizeFacility('warehouse', 0, config)).toEqual({
      type: 'warehouse',
      level: 0,
      maxLevel: 2,
      bonusValue: 0,
      nextUpgrade: { nextLevel: 1, cost: { currency: 'money', amount: 4000 } },
    });
  });

  it('YEDİ tesisin TAMAMINI döner; kaydı olmayan tipler level 0 sayılır', () => {
    const summaries = summarizeFacilities(new Map([['paddock', 2]]), config);
    expect(summaries).toHaveLength(FACILITY_TYPES.length);
    expect(summaries.map((summary) => summary.type)).toEqual([...FACILITY_TYPES]);
    expect(summaries.find((summary) => summary.type === 'paddock')?.level).toBe(2);
    expect(summaries.find((summary) => summary.type === 'vet_center')?.level).toBe(0);
  });

  it('tavana ulaşmış tesisin nextUpgrade alanı null olur (ekran "En yüksek seviyede" yazar)', () => {
    const maxLevel = getMaxDefinedFacilityLevel('farrier_area', config);
    expect(summarizeFacility('farrier_area', maxLevel, config).nextUpgrade).toBeNull();
  });
});

describe('parseFacilityType', () => {
  it('geçerli bir tipi olduğu gibi döner', () => {
    expect(parseFacilityType('vet_center')).toBe('vet_center');
  });

  it('geçersiz bir değer için InvalidFacilityTypeError fırlatır — DTO doğrulaması esbuild altında atlansa BİLE', () => {
    expect(() => parseFacilityType('greenhouse')).toThrow(InvalidFacilityTypeError);
    expect(() => parseFacilityType(42)).toThrow(InvalidFacilityTypeError);
    expect(() => parseFacilityType(undefined)).toThrow(InvalidFacilityTypeError);
  });
});
