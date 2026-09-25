/**
 * Master Development Brief §31 "Audio Manager" (bu turda EKLENDİ) —
 * event-driven (yarış başlangıcı, final düzlük, bitiş vb.) bir ses
 * yöneticisi İSKELETİ. Brief'in kendi kuralı ("dosya yoksa sessiz
 * no-op") burada MİMARİ bir prensip olarak uygulanır: bu dosya HANGİ
 * sesin NE ZAMAN çalınacağına karar verir (saf mantık), GERÇEK ses
 * çalma işini `AudioBackend` arayüzüne DEVREDER — böylece:
 *
 * 1. Bu dosya framework'ten VE tarayıcı API'lerinden (Web Audio/`HTMLAudioElement`)
 *    bağımsızdır — `track-path.ts`/`camera-director.ts`/`photo-finish.ts`
 *    ile AYNI şekilde bu sandbox'ta gerçek `tsc --noEmit` + `tsx` ile
 *    doğrulanabilir (bkz. `apps/web/tsconfig.logic.json`).
 * 2. Gerçek tarayıcı implementasyonu (`html-audio-backend.ts`, AYNI
 *    klasör) TAMAMEN AYRI bir dosyadadır — `RaceScene3D.tsx` ile AYNI
 *    kısıta tabidir (bu sandbox'ta `dom` lib/Audio API'si test ortamı
 *    DIŞINDadır), CI'da doğrulanır.
 * 3. `AudioBackend` VERİLMEZSE (ör. bu oturumda gerçek asset/tarayıcı
 *    API'si YOKKEN test edilirken) `SILENT_AUDIO_BACKEND` kullanılır —
 *    bu bir "mock" DEĞİLDİR, brief'in KENDİ istediği "asset/ortam yoksa
 *    sessizce hiçbir şey yapma" GERÇEK davranışının varsayılan
 *    uygulamasıdır (üretimde de, ses dosyaları HENÜZ repoda yokken,
 *    TAM OLARAK bu backend kullanılacaktır — bkz. `asset-manifest.ts`).
 *
 * Faz 6 "Config ayrımı" (bu turda EKLENDİ) — hacim/eşik değerleri ARTIK
 * bu dosyada gömülü sabitler DEĞİL, `@at-sevdalisi/game-config`'in
 * `AudioConfig`'i (bkz. `config/audio.config.json`) üzerinden ÇAĞIRAN
 * TARAFÇA (`RaceAudioManager`'ın kurucusuna) geçirilir — `camera-director.ts`/
 * `dust-particle-sim.ts` ile AYNI desen. `AudioBackend`'in aksine (o,
 * "backend yok" anlamlı bir varsayılana — `SILENT_AUDIO_BACKEND`'e —
 * sahiptir) `config` İÇİN bir varsayılan YOKTUR: config, GERÇEK oyun
 * dengesi verisidir, `apps/api`'nin domain fonksiyonlarının hiçbirinin
 * config parametresini "isteğe bağlı" YAPMAMASIYLA AYNI disiplin.
 */

import type { AudioConfig } from '@at-sevdalisi/game-config';
import { getAssetById } from '../assets/asset-manifest';

export type RaceAudioEventType = 'race_start' | 'final_stretch' | 'finish';

export interface RaceAudioEvent {
  type: RaceAudioEventType;
}

export interface AudioPlayOptions {
  loop?: boolean;
  /** [0, 1] aralığında — çağıran sınırlamazsa `AudioBackend` implementasyonu KENDİSİ sıkıştırmalıdır. */
  volume?: number;
}

/**
 * Gerçek ses çalma işini SOYUTLAR — `html-audio-backend.ts`'teki gerçek
 * `HTMLAudioElement` implementasyonu VE bu dosyanın kendi `SILENT_AUDIO_
 * BACKEND`'i AYNI arayüzü paylaşır. Bu, `PhotoFinishSourceEntry`'nin iki
 * farklı kaynaktan (canlı/replay) beslenmesiyle AYNI adaptör deseni.
 */
export interface AudioBackend {
  play(path: string, options?: AudioPlayOptions): void;
  stop(path: string): void;
  setVolume(path: string, volume: number): void;
}

/** Brief'in "dosya yoksa sessiz no-op" kuralının doğrudan kod karşılığı. */
export const SILENT_AUDIO_BACKEND: AudioBackend = {
  play: () => undefined,
  stop: () => undefined,
  setVolume: () => undefined,
};

export class RaceAudioManager {
  private backend: AudioBackend;
  private config: AudioConfig;
  private hoofbeatPlaying = false;

  constructor(config: AudioConfig, backend: AudioBackend = SILENT_AUDIO_BACKEND) {
    this.config = config;
    this.backend = backend;
  }

  /**
   * `getAssetById`'nin `undefined` dönmesi (id yanlış yazıldıysa —
   * derleme zamanında olmaz ama savunmacı programlama, brief'in
   * "gerçekçi yaz" ilkesi) HİÇBİR ZAMAN bir hataya yol AÇMAZ, sadece
   * o adım sessizce ATLANIR — tıpkı asset dosyasının kendisi eksikken
   * `AudioBackend`'in yapacağı gibi.
   */
  handleEvent(event: RaceAudioEvent): void {
    switch (event.type) {
      case 'race_start': {
        const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
        if (music) {
          this.backend.play(music.expectedPath, { loop: true, volume: this.config.raceMusicVolume });
        }
        this.startHoofbeats();
        return;
      }
      case 'final_stretch': {
        const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
        if (music) {
          this.backend.setVolume(music.expectedPath, this.config.raceMusicVolume * this.config.finalStretchMusicDuckFactor);
        }
        return;
      }
      case 'finish': {
        this.stopHoofbeats();
        const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
        if (music) {
          this.backend.stop(music.expectedPath);
        }
        const fanfare = getAssetById('RACE_FINISH_FANFARE_REQUIRED');
        if (fanfare) {
          this.backend.play(fanfare.expectedPath, { volume: this.config.finishFanfareVolume });
        }
        return;
      }
    }
  }

  private startHoofbeats(): void {
    if (this.hoofbeatPlaying) {
      return;
    }
    const asset = getAssetById('HOOFBEAT_SFX_REQUIRED');
    if (!asset) {
      return;
    }
    this.backend.play(asset.expectedPath, { loop: true, volume: this.config.hoofbeat.baseVolume });
    this.hoofbeatPlaying = true;
  }

  private stopHoofbeats(): void {
    if (!this.hoofbeatPlaying) {
      return;
    }
    const asset = getAssetById('HOOFBEAT_SFX_REQUIRED');
    if (asset) {
      this.backend.stop(asset.expectedPath);
    }
    this.hoofbeatPlaying = false;
  }

  /**
   * Brief §31 "hıza göre nal sesi yoğunluğu" isteği — `speedMps`/`maxSpeedMps`
   * ZATEN VAR OLAN telemetriden (`InterpolatedHorseState.speedMps`, Race
   * Engine'in `RaceBalanceConfig`'indeki azami hız) gelir, burada yeni bir
   * fizik/skor HESAPLANMAZ, sadece [0,1] aralığına ORANLANIR.
   */
  updateHoofbeatIntensity(speedMps: number, maxSpeedMps: number): void {
    if (!this.hoofbeatPlaying) {
      return;
    }
    const asset = getAssetById('HOOFBEAT_SFX_REQUIRED');
    if (!asset) {
      return;
    }
    const safeMax = maxSpeedMps > 0 ? maxSpeedMps : 1;
    const ratio = Math.max(0, Math.min(1, speedMps / safeMax));
    this.backend.setVolume(
      asset.expectedPath,
      this.config.hoofbeat.baseVolume + ratio * this.config.hoofbeat.maxExtraVolume,
    );
  }

  /** Testler/temizlik için — bileşen unmount olduğunda (`useEffect` cleanup) çağrılır. */
  stopAll(): void {
    this.stopHoofbeats();
    const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
    if (music) {
      this.backend.stop(music.expectedPath);
    }
  }
}
