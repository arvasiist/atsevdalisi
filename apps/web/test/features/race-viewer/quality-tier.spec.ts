import { describe, expect, it } from 'vitest';
import { classifyQualityTier, getQualityTierRenderSettings } from '../../../src/features/race-viewer/quality-tier';

describe('classifyQualityTier', () => {
  it('düşük çekirdekli (<=4) bir mobil cihazı \'low\' olarak sınıflandırır', () => {
    expect(classifyQualityTier({ isMobileUserAgent: true, hardwareConcurrencyCores: 2 })).toBe('low');
    expect(classifyQualityTier({ isMobileUserAgent: true, hardwareConcurrencyCores: 4 })).toBe('low');
  });

  it('orta çekirdekli (5-6) bir mobil cihazı \'medium\' olarak sınıflandırır', () => {
    expect(classifyQualityTier({ isMobileUserAgent: true, hardwareConcurrencyCores: 5 })).toBe('medium');
    expect(classifyQualityTier({ isMobileUserAgent: true, hardwareConcurrencyCores: 6 })).toBe('medium');
  });

  it('yüksek çekirdekli (>6) bir mobil cihazı \'high\' olarak sınıflandırır — mobil ASLA \'ultra\' almaz', () => {
    expect(classifyQualityTier({ isMobileUserAgent: true, hardwareConcurrencyCores: 8 })).toBe('high');
    expect(classifyQualityTier({ isMobileUserAgent: true, hardwareConcurrencyCores: 32 })).toBe('high');
  });

  it('düşük çekirdekli (<=4) bir masaüstünü \'medium\' olarak sınıflandırır — masaüstü ASLA \'low\' almaz', () => {
    expect(classifyQualityTier({ isMobileUserAgent: false, hardwareConcurrencyCores: 2 })).toBe('medium');
    expect(classifyQualityTier({ isMobileUserAgent: false, hardwareConcurrencyCores: 4 })).toBe('medium');
  });

  it('orta çekirdekli (5-8) bir masaüstünü \'high\' olarak sınıflandırır', () => {
    expect(classifyQualityTier({ isMobileUserAgent: false, hardwareConcurrencyCores: 5 })).toBe('high');
    expect(classifyQualityTier({ isMobileUserAgent: false, hardwareConcurrencyCores: 8 })).toBe('high');
  });

  it('yüksek çekirdekli (>8) bir masaüstünü \'ultra\' olarak sınıflandırır', () => {
    expect(classifyQualityTier({ isMobileUserAgent: false, hardwareConcurrencyCores: 12 })).toBe('ultra');
    expect(classifyQualityTier({ isMobileUserAgent: false, hardwareConcurrencyCores: 32 })).toBe('ultra');
  });

  it('çekirdek sayısı bilinmiyorsa (<=0) güvenli orta-seviye varsayıma göre sınıflandırır', () => {
    // UNKNOWN_CORE_COUNT_FALLBACK = 4 -> mobilde 'low', masaüstünde 'medium'
    expect(classifyQualityTier({ isMobileUserAgent: true, hardwareConcurrencyCores: 0 })).toBe('low');
    expect(classifyQualityTier({ isMobileUserAgent: false, hardwareConcurrencyCores: 0 })).toBe('medium');
  });
});

describe('getQualityTierRenderSettings', () => {
  it('\'low\' kademede TÜM pahalı özellikleri (Environment/Bloom/SSAO/gölgeler) kapatır', () => {
    const settings = getQualityTierRenderSettings('low');
    expect(settings.tier).toBe('low');
    expect(settings.environmentEnabled).toBe(false);
    expect(settings.bloomEnabled).toBe(false);
    expect(settings.ssaoEnabled).toBe(false);
    expect(settings.shadowsEnabled).toBe(false);
    expect(settings.pixelRatioCap).toBe(1);
  });

  it('\'medium\' kademede Environment+gölgeleri açar ama Bloom/SSAO\'yu kapalı bırakır', () => {
    const settings = getQualityTierRenderSettings('medium');
    expect(settings.environmentEnabled).toBe(true);
    expect(settings.shadowsEnabled).toBe(true);
    expect(settings.bloomEnabled).toBe(false);
    expect(settings.ssaoEnabled).toBe(false);
  });

  it('\'high\' kademede Bloom\'u da açar ama SSAO\'yu (en pahalı geçiş) kapalı bırakır', () => {
    const settings = getQualityTierRenderSettings('high');
    expect(settings.bloomEnabled).toBe(true);
    expect(settings.ssaoEnabled).toBe(false);
  });

  it('\'ultra\' kademede Faz 1\'in ÖNCEKİ (kademesiz) sabit davranışıyla BİREBİR aynı ayarları döner (geriye dönük regresyon YOK)', () => {
    const settings = getQualityTierRenderSettings('ultra');
    expect(settings.environmentEnabled).toBe(true);
    expect(settings.bloomEnabled).toBe(true);
    expect(settings.ssaoEnabled).toBe(true);
    expect(settings.shadowsEnabled).toBe(true);
    expect(settings.shadowMapSize).toBe(2048);
  });

  it('her kademe için farklı bir shadowMapSize döner (düşükten yükseğe artan)', () => {
    const low = getQualityTierRenderSettings('low');
    const medium = getQualityTierRenderSettings('medium');
    const high = getQualityTierRenderSettings('high');
    expect(low.shadowMapSize).toBeLessThan(medium.shadowMapSize);
    expect(medium.shadowMapSize).toBeLessThan(high.shadowMapSize);
  });
});
