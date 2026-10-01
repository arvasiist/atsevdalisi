import type { WebGLRenderer } from 'three';
import { KTX2Loader } from 'three-stdlib';
import { BASIS_TRANSCODER_PATH } from './asset-pipeline';

// 01.10.2026 — `asset-pipeline.ts`ten ayrıldı: yalnızca 3D sahne (GLTF
// yükleyici) içe aktarır; PLACEHOLDER rozeti gibi DOM bileşenleri three.js'i
// ana JS paketine çekmesin.

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
