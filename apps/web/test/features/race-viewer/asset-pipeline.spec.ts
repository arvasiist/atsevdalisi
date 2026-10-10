import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASIS_TRANSCODER_PATH,
  DRACO_DECODER_PATH,
  assetUrl,
  ASSET_AVAILABILITY_URL,
  buildAssetAvailabilityReport,
  parseAssetAvailability,
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

  it('probeAsset (rapor yoksa HEAD): 200 → var, 404 → yok, ağ hatası → yok; sonuç önbelleklenir', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({ ok: url === '/var.glb' }) as Response);
    expect(await probeAsset('/var.glb', fetchImpl as unknown as typeof fetch)).toBe(true);
    expect(await probeAsset('/yok.glb', fetchImpl as unknown as typeof fetch)).toBe(false);
    expect(await probeAsset('/var.glb', fetchImpl as unknown as typeof fetch)).toBe(true);
    // 1 rapor denemesi (başarısız) + 2 HEAD.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith(ASSET_AVAILABILITY_URL);
    expect(fetchImpl).toHaveBeenCalledWith('/var.glb', { method: 'HEAD' });

    const failing = vi.fn(async () => {
      throw new Error('ağ yok');
    });
    expect(await probeAsset('/hata.glb', failing as unknown as typeof fetch)).toBe(false);
  });

  it('probeAsset: manifest yolları TEK rapordan — HEAD atılmaz (404 konsol gürültüsü yok)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === ASSET_AVAILABILITY_URL) {
        return { ok: true, json: async () => ({ checked: ['models/horse.glb', 'hdri/sky.hdr'], available: ['hdri/sky.hdr'] }) } as Response;
      }
      return { ok: true } as Response;
    });
    const f = fetchImpl as unknown as typeof fetch;
    expect(await probeAsset('/models/horse.glb', f)).toBe(false);
    expect(await probeAsset('/hdri/sky.hdr', f)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Manifest dışı yol rapordan çözülemez → HEAD.
    expect(await probeAsset('/baska.mp3', f)).toBe(true);
    expect(fetchImpl).toHaveBeenLastCalledWith('/baska.mp3', { method: 'HEAD' });
  });

  it('bozuk rapor yok sayılır; rapor yolları tekilleştirir ve yalnızca var olanı listeler', async () => {
    expect(parseAssetAvailability(null)).toBeNull();
    expect(parseAssetAvailability({ checked: 'x' })).toBeNull();
    const report = await buildAssetAvailabilityReport(
      ['models/a.glb', '/models/a.glb', 'hdri/b.hdr'],
      async (path) => path === 'hdri/b.hdr',
    );
    expect(report).toEqual({ checked: ['models/a.glb', 'hdri/b.hdr'], available: ['hdri/b.hdr'] });
  });
});
