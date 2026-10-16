import { describe, expect, it } from 'vitest';
import {
  ASSET_MANIFEST,
  getAssetById,
  getAssetsByKind,
  getMissingAssets,
  resolveAnimationClips,
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
    // 'texture' türünde dört giriş vardır (kalabalık billboard + 01.10.2026'da
    // eklenen pist/çim/ahır PBR dokuları) — gerçek listeyle tutarlılık.
    const textures = getAssetsByKind('texture');
    expect(textures.length).toBe(4);
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

describe('resolveAnimationClips (01.10.2026)', () => {
  const horse = getAssetById('HORSE_MODEL_REQUIRED')!;

  it('GLB klip adlarını büyük/küçük harf duyarsız ROLLERE eşler; eksik rol null', () => {
    const clips = resolveAnimationClips(horse, ['GALLOP', 'idle', 'Something_Else']);
    expect(clips.gallop).toBe('GALLOP');
    expect(clips.idle).toBe('idle');
    expect(clips.trot).toBeNull();
  });

  it('manifestteki sıra önceliktir', () => {
    expect(resolveAnimationClips(horse, ['Run', 'Gallop']).gallop).toBe('Gallop');
  });

  it('animasyonsuz varlık boş eşleme döner', () => {
    expect(resolveAnimationClips(getAssetById('HDRI_SKY_REQUIRED')!, ['Idle'])).toEqual({});
  });
});
