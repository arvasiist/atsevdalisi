/**
 * 3D VARLIK HATTI (01.10.2026).
 *
 * 1. **Yerel çözücüler.** drei'nin `useGLTF`i Draco çözücüsünü varsayılan
 *    olarak gstatic.com'dan indirir — indirme düşünce sahne çöker (CLAUDE.md
 *    (13)). Çözücüler `scripts/copy-3d-decoders.mjs` ile `three` paketinden
 *    `public/decoders/`e kopyalanır ve buradan yüklenir. Meshopt çözücüsü
 *    zaten paketin içindedir (ağ isteği yok).
 * 2. **Varlık yoklaması.** Dosya `public/` altında yoksa yüklemeyi hiç
 *    denemeyiz (404 + hata sınırı yerine doğrudan PLACEHOLDER). Sonuç oturum
 *    boyunca önbelleklenir.
 */

import { useEffect, useState } from 'react';
import type { WebGLRenderer } from 'three';
import { KTX2Loader } from 'three-stdlib';

export const DRACO_DECODER_PATH = '/decoders/draco/';
export const BASIS_TRANSCODER_PATH = '/decoders/basis/';

/** `public/`e göreli manifest yolunu URL'ye çevirir. */
export function assetUrl(expectedPath: string): string {
  return `/${expectedPath.replace(/^\/+/, '')}`;
}

const ktx2Loaders = new WeakMap<WebGLRenderer, KTX2Loader>();

/** Renderer başına TEK KTX2 yükleyici (GPU biçim desteği renderer'a bağlıdır). */
export function getKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  let loader = ktx2Loaders.get(renderer);
  if (!loader) {
    loader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH).detectSupport(renderer);
    ktx2Loaders.set(renderer, loader);
  }
  return loader;
}

export type AssetAvailability = 'checking' | 'available' | 'missing';

const probeCache = new Map<string, Promise<boolean>>();

/**
 * Dosya var mı (HEAD isteği). Ağ hatası da "yok" sayılır — sahne
 * PLACEHOLDER ile çalışmaya devam eder. Sonuç yol başına önbelleklenir.
 */
export function probeAsset(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  let pending = probeCache.get(url);
  if (!pending) {
    pending = fetchImpl(url, { method: 'HEAD' })
      .then((response) => response.ok)
      .catch(() => false);
    probeCache.set(url, pending);
  }
  return pending;
}

/** Yalnızca testler için: yoklama önbelleğini temizler. */
export function resetAssetProbeCache(): void {
  probeCache.clear();
}

export function useAssetAvailability(url: string): AssetAvailability {
  const [state, setState] = useState<AssetAvailability>('checking');
  useEffect(() => {
    let cancelled = false;
    void probeAsset(url).then((present) => {
      if (!cancelled) setState(present ? 'available' : 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

/**
 * Birden çok varlığın yoklaması: henüz yoklanmamış/eksik olanların yolları.
 * `null` = yoklama sürüyor. Boş dizi = hepsi mevcut.
 */
export function useMissingAssetPaths(urls: readonly string[]): string[] | null {
  const key = urls.join('|');
  const [missing, setMissing] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const list = key === '' ? [] : key.split('|');
    void Promise.all(
      list.map((url) => probeAsset(url).then((present) => (present ? null : url))),
    ).then((results) => {
      if (!cancelled) setMissing(results.filter((url): url is string => url !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return missing;
}
