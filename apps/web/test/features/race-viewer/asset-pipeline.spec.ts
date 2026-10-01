import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASIS_TRANSCODER_PATH,
  DRACO_DECODER_PATH,
  assetUrl,
  probeAsset,
  resetAssetProbeCache,
} from '../../../src/features/race-viewer/assets/asset-pipeline';

describe('3D varlık hattı (01.10.2026)', () => {
  beforeEach(() => resetAssetProbeCache());

  it('çözücüler YEREL yoldan yüklenir — CDN yok', () => {
    for (const path of [DRACO_DECODER_PATH, BASIS_TRANSCODER_PATH]) {
      expect(path.startsWith('/decoders/')).toBe(true);
      expect(path).not.toMatch(/^https?:/);
    }
  });

  it('assetUrl public köküne göre mutlak yol üretir', () => {
    expect(assetUrl('models/horse.glb')).toBe('/models/horse.glb');
    expect(assetUrl('/models/horse.glb')).toBe('/models/horse.glb');
  });

  it('probeAsset: 200 → var, 404 → yok, ağ hatası → yok; sonuç önbelleklenir', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({ ok: url === '/var.glb' }) as Response);
    expect(await probeAsset('/var.glb', fetchImpl as unknown as typeof fetch)).toBe(true);
    expect(await probeAsset('/yok.glb', fetchImpl as unknown as typeof fetch)).toBe(false);
    expect(await probeAsset('/var.glb', fetchImpl as unknown as typeof fetch)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith('/var.glb', { method: 'HEAD' });

    const failing = vi.fn(async () => {
      throw new Error('ağ yok');
    });
    expect(await probeAsset('/hata.glb', failing as unknown as typeof fetch)).toBe(false);
  });
});
