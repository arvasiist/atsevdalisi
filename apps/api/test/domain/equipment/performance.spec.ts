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
});
