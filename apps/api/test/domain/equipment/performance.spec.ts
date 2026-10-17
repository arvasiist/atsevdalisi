import { describe, expect, it } from 'vitest';
import { computeEquipmentPerformanceModifier, NEUTRAL_EQUIPMENT_MODIFIER } from '../../../src/domain/equipment/performance';

describe('computeEquipmentPerformanceModifier (Ekipman — bkz. dosya başı kalibrasyon notu)', () => {
  it('hiç ekipman yoksa nötr (1) döner', () => {
    expect(computeEquipmentPerformanceModifier([])).toBe(NEUTRAL_EQUIPMENT_MODIFIER);
  });

  it('kuşanılmamış (equipped: false) bir parçanın HİÇBİR etkisi yoktur', () => {
    expect(computeEquipmentPerformanceModifier([{ quality: 100, equipped: false }])).toBe(NEUTRAL_EQUIPMENT_MODIFIER);
  });

  it('kuşanılmış tek bir parça, kalitesiyle ORANTILI küçük bir bonus verir', () => {
    const lowQuality = computeEquipmentPerformanceModifier([{ quality: 25, equipped: true }]);
    const highQuality = computeEquipmentPerformanceModifier([{ quality: 100, equipped: true }]);
    expect(lowQuality).toBeGreaterThan(NEUTRAL_EQUIPMENT_MODIFIER);
    expect(highQuality).toBeGreaterThan(lowQuality);
  });

  it('kalite=100 tek bir parça için TAM OLARAK %1 bonus (1.01) verir', () => {
    expect(computeEquipmentPerformanceModifier([{ quality: 100, equipped: true }])).toBeCloseTo(1.01, 10);
  });

  it('kalite=0 kuşanılmış bir parça bile nötr (1) döner (sıfır kaliteden fayda yok, ama CEZA da yok)', () => {
    expect(computeEquipmentPerformanceModifier([{ quality: 0, equipped: true }])).toBe(NEUTRAL_EQUIPMENT_MODIFIER);
  });

  it('birden fazla kuşanılmış parça TOPLANIR (beş yuvanın hepsi en yüksek kalitede: tam olarak 1.05)', () => {
    const fiveMaxQualityItems = Array.from({ length: 5 }, () => ({ quality: 100, equipped: true }));
    expect(computeEquipmentPerformanceModifier(fiveMaxQualityItems)).toBeCloseTo(1.05, 10);
  });

  it('asla NEUTRAL_EQUIPMENT_MODIFIER (1) altına düşmez — ceza kavramı yoktur', () => {
    const items = [
      { quality: 0, equipped: true },
      { quality: 0, equipped: false },
    ];
    expect(computeEquipmentPerformanceModifier(items)).toBeGreaterThanOrEqual(NEUTRAL_EQUIPMENT_MODIFIER);
  });

  it('üst sınır (1.05) hiçbir girdi kombinasyonunda AŞILMAZ (savunma tabanı)', () => {
    const manyMaxQualityItems = Array.from({ length: 20 }, () => ({ quality: 100, equipped: true }));
    expect(computeEquipmentPerformanceModifier(manyMaxQualityItems)).toBeLessThanOrEqual(1.05);
  });

  it('aynı girdi için her zaman aynı sonucu döner (saf fonksiyon)', () => {
    const items = [
      { quality: 40, equipped: true },
      { quality: 90, equipped: true },
    ];
    expect(computeEquipmentPerformanceModifier(items)).toBe(computeEquipmentPerformanceModifier(items));
  });

  // 16.10.2026 (brief §8) — kozmetik + zemine özel nal.
  it('kozmetik aksesuar kalitesi ne olursa olsun çarpana girmez', () => {
    expect(computeEquipmentPerformanceModifier([{ quality: 100, equipped: true, equipmentType: 'blanket' }])).toBe(
      NEUTRAL_EQUIPMENT_MODIFIER,
    );
  });

  it('zemine özel nal yalnızca kendi zemininde sayılır; zemin bilinmiyorsa sayılmaz', () => {
    const shoe = [{ quality: 80, equipped: true, equipmentType: 'horseshoe', surface: 'grass' }];
    expect(computeEquipmentPerformanceModifier(shoe, 'grass')).toBeCloseTo(1.008, 10);
    expect(computeEquipmentPerformanceModifier(shoe, 'dirt')).toBe(NEUTRAL_EQUIPMENT_MODIFIER);
    expect(computeEquipmentPerformanceModifier(shoe)).toBe(NEUTRAL_EQUIPMENT_MODIFIER);
  });

  it('zemini olmayan parça her zeminde aynı (eski parçalarla sonuç değişmedi)', () => {
    const items = [{ quality: 65, equipped: true, equipmentType: 'saddle', surface: null }];
    const expected = computeEquipmentPerformanceModifier([{ quality: 65, equipped: true }]);
    for (const surface of ['grass', 'dirt', 'synthetic', null]) {
      expect(computeEquipmentPerformanceModifier(items, surface)).toBe(expected);
    }
  });

  it('pahalı ekipman yarışı tek başına kazandırmaz: en iyi kalemlerin hepsi kuşanılsa da tavan 1.05', () => {
    const best = ['saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps'].map((equipmentType) => ({
      quality: 100,
      equipped: true,
      equipmentType,
    }));
    const withCosmetics = [...best, { quality: 100, equipped: true, equipmentType: 'collectible' }];
    expect(computeEquipmentPerformanceModifier(withCosmetics, 'grass')).toBeLessThanOrEqual(1.05);
  });
});
