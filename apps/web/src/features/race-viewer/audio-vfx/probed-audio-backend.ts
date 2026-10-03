/**
 * YOKLAMALI SES ARKA UCU (01.10.2026, 3D adım 9) — dosya YOKSA hiçbir şey
 * çalmaz, konsola hata da basmaz. Her yol ilk kullanımda HEAD ile yoklanır
 * (`probeAsset`, önbellekli); yoksa çağrı sessizce düşer. `apps/web/public/`
 * bilinçli olarak boş olduğu için bugün HER ses bu yoldan susar — gerçek
 * dosyalar manifestteki yollara konunca kod değişmeden çalar.
 *
 * Manifest yolları `public/`e görelidir ("audio/x.mp3"); `new Audio()`a
 * göreli verilirse sayfanın URL'sine göre çözülür (`/races/audio/x.mp3`),
 * bu yüzden burada mutlak URL'ye (`assetUrl`) çevrilir.
 */

import { assetUrl, probeAsset } from '../assets/asset-pipeline';
import type { AudioBackend, AudioPlayOptions } from './audio-manager';

export function createProbedAudioBackend(
  inner: AudioBackend,
  probe: (url: string) => Promise<boolean> = probeAsset,
): AudioBackend {
  /** Çalması istenen ve henüz durdurulmamış yollar (yoklama sürerken `stop` gelirse çalınmaz). */
  const wanted = new Map<string, AudioPlayOptions | undefined>();
  const latestVolume = new Map<string, number>();

  return {
    play(path, options) {
      const url = assetUrl(path);
      wanted.set(url, options);
      // Yeni çalma kendi hacmini taşır; yoklama sürerken gelen setVolume onu ezer.
      latestVolume.delete(url);
      void probe(url).then((present) => {
        if (!present || !wanted.has(url)) return;
        const volume = latestVolume.get(url) ?? options?.volume;
        inner.play(url, { ...options, volume });
        latestVolume.delete(url);
        if (!options?.loop) wanted.delete(url);
      });
    },
    stop(path) {
      const url = assetUrl(path);
      wanted.delete(url);
      latestVolume.delete(url);
      inner.stop(url);
    },
    setVolume(path, volume) {
      const url = assetUrl(path);
      latestVolume.set(url, volume);
      inner.setVolume(url, volume);
    },
  };
}
