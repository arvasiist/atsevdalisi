/**
 * Master Development Brief §31 "Audio Manager" — `audio-manager.ts`'in
 * `AudioBackend` arayüzünün GERÇEK tarayıcı implementasyonu (`HTMLAudioElement`
 * üzerinden). `audio-manager.ts`'in dosya başı doc yorumundaki AYRIM
 * BURADA somutlaşır: bu dosya `dom` lib'e (Audio/HTMLAudioElement tipleri)
 * bağımlıdır — `apps/web/tsconfig.logic.json`'ın SAF (`tsconfig.base.json`,
 * `lib: ["ES2022"]`, `dom` YOK) kapsamına KASITLI OLARAK EKLENMEDİ. `three`/
 * `@react-three/*` gerektirmese de `RaceScene3D.tsx`/`live-race-socket.ts`
 * ile AYNI kısıta tabidir: gerçek doğrulama yalnızca CI'da (`apps/web`'in
 * KENDİ `tsconfig.json`'ı `dom` lib'i içerir) mümkündür, bu sandbox'ta
 * sadece `ts.transpileModule` ile sözdizimi kontrolü yapılabilir.
 */

import type { AudioBackend } from './audio-manager';

/**
 * Aynı `path` için TEK bir `HTMLAudioElement` YENİDEN KULLANILIR
 * (`elements` Map'i) — her `play()` çağrısında yeni bir `Audio` nesnesi
 * yaratmak (a) gereksiz bellek/ağ isteği ÜRETİR, (b) `stop()`/`setVolume()`'un
 * HANGİ elemente uygulanacağını BELİRSİZLEŞTİRİRDİ.
 */
export function createHtmlAudioBackend(): AudioBackend {
  const elements = new Map<string, HTMLAudioElement>();

  function getOrCreate(path: string, loop: boolean): HTMLAudioElement {
    const existing = elements.get(path);
    if (existing) {
      existing.loop = loop;
      return existing;
    }
    const created = new Audio(path);
    created.loop = loop;
    elements.set(path, created);
    return created;
  }

  return {
    play(path, options) {
      const element = getOrCreate(path, options?.loop ?? false);
      if (options?.volume !== undefined) {
        element.volume = Math.max(0, Math.min(1, options.volume));
      }
      if (!options?.loop) {
        // Döngüsel olmayan bir ses (fanfar vb.) HER çağrıldığında baştan
        // çalınmalıdır — kullanıcı yarışı tekrar oynatırsa (replay/seek)
        // aynı sesin ORTASINDAN devam etmesi YANLIŞ olurdu.
        element.currentTime = 0;
      }
      // `HTMLMediaElement.play()` bir Promise döner; tarayıcının otomatik
      // oynatma politikası (autoplay policy) bunu REDDEDEBİLİR (ör.
      // kullanıcı sayfayla HENÜZ etkileşime girmediyse). Brief'in "dosya
      // yoksa sessiz no-op" kuralı SADECE "asset eksik" durumu içindir —
      // gerçek bir tarayıcı KISITLAMASI sessizce yutulmaz, geliştiriciye
      // konsolda GÖRÜNÜR kalır (üretim davranışını GİZLEMEMEK için).
      void element.play().catch((error: unknown) => {
        // eslint-disable-next-line no-console -- bkz. yukarıdaki doc yorumu.
        console.warn(`[AudioManager] '${path}' oynatılamadı (tarayıcı otomatik oynatma politikası olabilir):`, error);
      });
    },
    stop(path) {
      const element = elements.get(path);
      if (element) {
        element.pause();
        element.currentTime = 0;
      }
    },
    setVolume(path, volume) {
      const element = elements.get(path);
      if (element) {
        element.volume = Math.max(0, Math.min(1, volume));
      }
    },
  };
}
