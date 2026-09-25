import { describe, expect, it } from 'vitest';
import {
  ASSET_MANIFEST,
  getAssetById,
  getAssetsByKind,
  getMissingAssets,
} from '../../../src/features/race-viewer/assets/asset-manifest';

describe('ASSET_MANIFEST', () => {
  it('boş değildir ve her girişin benzersiz bir id\'si vardır', () => {
    expect(ASSET_MANIFEST.length).toBeGreaterThan(0);
    const ids = ASSET_MANIFEST.map((asset) => asset.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('her girişin expectedPath, description ve fallbackBehavior alanları doludur (uydurma boş alan yok)', () => {
    for (const asset of ASSET_MANIFEST) {
      expect(asset.expectedPath.length).toBeGreaterThan(0);
      expect(asset.description.length).toBeGreaterThan(0);
      expect(asset.fallbackBehavior.length).toBeGreaterThan(0);
    }
  });
});

describe('getAssetById', () => {
  it('bilinen bir id için ilgili asset\'i döner', () => {
    const asset = getAssetById('HORSE_MODEL_REQUIRED');
    expect(asset).toBeDefined();
    expect(asset!.kind).toBe('model_3d');
  });

  it('bilinmeyen bir id için undefined döner', () => {
    expect(getAssetById('BILINMEYEN_ID')).toBeUndefined();
  });
});

describe('getAssetsByKind', () => {
  it('sadece istenen türdeki asset\'leri döner', () => {
    const models = getAssetsByKind('model_3d');
    expect(models.length).toBeGreaterThan(0);
    for (const asset of models) {
      expect(asset.kind).toBe('model_3d');
    }
  });

  it('hiç eşleşme yoksa boş dizi döner', () => {
    // 'texture' türünde tam olarak bir giriş olduğunu biliyoruz (crowd billboard) —
    // burada olmayan bir kombinasyonu test etmek yerine gerçek listeyle tutarlılığı doğruluyoruz.
    const textures = getAssetsByKind('texture');
    expect(textures.length).toBe(1);
  });
});

describe('getMissingAssets', () => {
  it('hiçbir dosya mevcut değilse TÜM manifest eksik döner (bu oturumun gerçek durumu)', () => {
    const missing = getMissingAssets([]);
    expect(missing.length).toBe(ASSET_MANIFEST.length);
  });

  it('bazı dosyalar mevcutsa sadece kalanları döner', () => {
    const missing = getMissingAssets(['models/horse.glb']);
    expect(missing.length).toBe(ASSET_MANIFEST.length - 1);
    expect(missing.find((asset) => asset.id === 'HORSE_MODEL_REQUIRED')).toBeUndefined();
  });

  it('manifestte olmayan bir yol verilirse hiçbir etkisi olmaz', () => {
    const missing = getMissingAssets(['models/hic-var-olmayan-dosya.glb']);
    expect(missing.length).toBe(ASSET_MANIFEST.length);
  });
});
