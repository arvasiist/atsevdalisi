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
 *
 * Faz 2/4 hata düzeltmesi (bu turda GENİŞLETİLDİ) — yeni 18 fazlık
 * brief'in yeniden denetiminde bu dosyanın brief §31'in KENDİ
 * "Architecture" listesindeki 11 ses kategorisinden (RaceStart/GateOpen/
 * Hoof/HorseBreathing/Crowd/Wind/Overtake/FinalStretch/Finish/
 * Commentary/Winner) yalnızca ÜÇÜNÜ (`race_start`/`final_stretch`/
 * `finish`) uyguladığı VE brief'in istediği "Master/Music/SFX/Crowd/
 * Commentary/Horse" ayrı ses kanallarının HİÇBİRİNİ desteklemediği
 * bulundu (proje sahibinin "Önce mevcut hataları düzelt (Faz 2 + 4)"
 * kararıyla düzeltildi). Brief'in kendi örnek eşleştirmesi
 * ("RACE_START → RaceStart, GATES_OPEN → GateOpen, OVERTAKE → Overtake,
 * FINAL_200 → FinalStretch, FINISH → Finish, WINNER → Winner") yalnızca
 * ALTI kategoriyi TEK bir Race Engine olayına birebir bağlar — kalan
 * beşi (Hoof/HorseBreathing/Crowd/Wind/Commentary) doğası gereği SÜREKLİ
 * (loop/ambient) veya ÇOK SAYIDA olası klipten biri (Commentary) olduğu
 * için AYRI başlat/durdur/yoğunluk metotlarıyla modellenir — bkz. altta
 * ilgili metotların doc yorumları. Bu genişletme `RaceViewer.tsx`/
 * `LiveRaceViewer.tsx`'e YENİ bir çağrı EKLEMEZ (bu dosya hâlâ HİÇBİR
 * yerden instantiate EDİLMİYOR — bkz. `RaceAudioManager` sınıfının
 * kendisi zaten framework-agnostik bir modül olarak tasarlanmıştı);
 * viewer entegrasyonu, gerçek Race Engine event yayını (GATES_OPEN/
 * OVERTAKE/WINNER gibi ayrık sinyaller ŞU AN motor tarafından
 * YAYINLANMIYOR) gerektiren AYRI ve daha büyük bir kapsamdır, brief'in
 * KENDİSİ de bu fazda "gerçek ses assetlerini ÜRETME, sadece altyapıyı
 * hazırla" der — bu yüzden BİLİNÇLİ olarak bu turun kapsamı DIŞINDA
 * bırakıldı.
 */

import type { AudioConfig } from '@at-sevdalisi/game-config';
import { getAssetById } from '../assets/asset-manifest';

export type RaceAudioEventType = 'race_start' | 'gate_open' | 'overtake' | 'final_stretch' | 'finish' | 'winner';

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

/**
 * Brief §31 "Ses seviyeleri ayrı kontrol edilebilir olmalı: Master / Music
 * / SFX / Crowd / Commentary / Horse" (bu turda EKLENDİ) —
 * `AudioConfig.volumeChannels`'in (bkz. `@at-sevdalisi/game-config`'in o
 * alanının doc yorumu) çalışma zamanı karşılığı.
 */
export type AudioChannel = 'master' | 'music' | 'sfx' | 'crowd' | 'commentary' | 'horse';

/**
 * `resolveVolume`'un kabul ettiği, `master`'IN KENDİSİ HARİÇ kanallar —
 * her çalınan ses TAM OLARAK BİR bu kanala aittir, `master` bunun
 * ÜZERİNE AYRICA çarpılır (bkz. `resolveVolume`).
 */
type PlayableAudioChannel = Exclude<AudioChannel, 'master'>;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class RaceAudioManager {
  private backend: AudioBackend;
  private config: AudioConfig;
  private channelVolumes: Record<AudioChannel, number>;
  private hoofbeatPlaying = false;
  private horseBreathingPlaying = false;
  private crowdPlaying = false;
  private windPlaying = false;
  private musicPlaying = false;
  private musicDucked = false;
  /** `setChannelVolume`'un o an çalan döngülü sesi ANINDA yeniden hesaplayabilmesi için son bilinen yoğunluk oranı (bkz. `reapplyActiveLoopVolumes`). */
  private lastHoofbeatRatio = 0;
  private lastHorseBreathingRatio = 0;

  constructor(config: AudioConfig, backend: AudioBackend = SILENT_AUDIO_BACKEND) {
    this.config = config;
    this.backend = backend;
    this.channelVolumes = {
      master: clamp01(config.volumeChannels.master),
      music: clamp01(config.volumeChannels.music),
      sfx: clamp01(config.volumeChannels.sfx),
      crowd: clamp01(config.volumeChannels.crowd),
      commentary: clamp01(config.volumeChannels.commentary),
      horse: clamp01(config.volumeChannels.horse),
    };
  }

  /**
   * Bir sesin NİHAİ (backend'e geçirilen) hacmi: kendi taban hacmi İLE
   * KENDİ kanalının VE `master` kanalının ÇARPIMIDIR — brief'in "ayrı
   * kontrol edilebilir" istediği HER kanal (Master DAHİL) her sesi
   * ETKİLER, ama TEK bir sesin kanalı DIŞINDAKİ diğer kanallar (ör.
   * `crowd`'ı kısmak nal sesini ETKİLEMEZ) ETKİLEMEZ.
   */
  private resolveVolume(channel: PlayableAudioChannel, baseVolume: number): number {
    return clamp01(baseVolume) * this.channelVolumes[channel] * this.channelVolumes.master;
  }

  /**
   * `getAssetById`'nin `undefined` dönmesi (id yanlış yazıldıysa —
   * derleme zamanında olmaz ama savunmacı programlama, brief'in
   * "gerçekçi yaz" ilkesi) HİÇBİR ZAMAN bir hataya yol AÇMAZ, sadece
   * o adım sessizce ATLANIR — tıpkı asset dosyasının kendisi eksikken
   * `AudioBackend`'in yapacağı gibi.
   *
   * Brief §31'in örnek eşleştirmesindeki ALTI ayrık (bir seferlik veya
   * durum-değiştiren) olay burada işlenir — Hoof/HorseBreathing/Crowd/
   * Wind SÜREKLİ (loop) sesler olduğundan burada DEĞİL, kendi başlat/
   * durdur metotlarında (bkz. altları) yönetilir; Commentary ise TEK bir
   * "olay" değil, ÇOK SAYIDA olası klipten biridir (bkz. `playCommentaryLine`).
   */
  handleEvent(event: RaceAudioEvent): void {
    switch (event.type) {
      case 'race_start': {
        const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
        if (music) {
          this.backend.play(music.expectedPath, { loop: true, volume: this.resolveVolume('music', this.config.raceMusicVolume) });
          this.musicPlaying = true;
          this.musicDucked = false;
        }
        // Yarış başlangıcında TÜM süregelen (loop) ses katmanları
        // birlikte başlar — nal, at nefesi, kalabalık, rüzgar.
        this.startHoofbeats();
        this.startHorseBreathing();
        this.startCrowdAmbience();
        this.startWindAmbience();
        return;
      }
      case 'gate_open': {
        const asset = getAssetById('GATE_OPEN_SFX_REQUIRED');
        if (asset) {
          this.backend.play(asset.expectedPath, { volume: this.resolveVolume('sfx', this.config.gateOpenVolume) });
        }
        return;
      }
      case 'overtake': {
        const asset = getAssetById('OVERTAKE_SFX_REQUIRED');
        if (asset) {
          this.backend.play(asset.expectedPath, { volume: this.resolveVolume('sfx', this.config.overtakeVolume) });
        }
        return;
      }
      case 'final_stretch': {
        const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
        if (music) {
          this.musicDucked = true;
          this.backend.setVolume(
            music.expectedPath,
            this.resolveVolume('music', this.config.raceMusicVolume * this.config.finalStretchMusicDuckFactor),
          );
        }
        return;
      }
      case 'finish': {
        this.stopHoofbeats();
        this.stopHorseBreathing();
        const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
        if (music) {
          this.backend.stop(music.expectedPath);
          this.musicPlaying = false;
        }
        const fanfare = getAssetById('RACE_FINISH_FANFARE_REQUIRED');
        if (fanfare) {
          this.backend.play(fanfare.expectedPath, { volume: this.resolveVolume('sfx', this.config.finishFanfareVolume) });
        }
        return;
      }
      case 'winner': {
        // Brief §31 "Winner" — `finish`ten KASITLI OLARAK AYRI (bkz.
        // `AudioConfig.winnerCelebrationVolume` doc yorumu): "finish"
        // yarış çizgisini geçme ANINI, "winner" kazananın KESİNLEŞTİĞİ
        // anı (Winner Ceremony sunumunun başlangıcı, AYRI bir özellik
        // kapsamı) işaretler.
        const asset = getAssetById('WINNER_CELEBRATION_SFX_REQUIRED');
        if (asset) {
          this.backend.play(asset.expectedPath, { volume: this.resolveVolume('sfx', this.config.winnerCelebrationVolume) });
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
    this.backend.play(asset.expectedPath, { loop: true, volume: this.resolveVolume('horse', this.config.hoofbeat.baseVolume) });
    this.hoofbeatPlaying = true;
    this.lastHoofbeatRatio = 0;
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
    const ratio = clamp01(speedMps / safeMax);
    this.lastHoofbeatRatio = ratio;
    this.backend.setVolume(
      asset.expectedPath,
      this.resolveVolume('horse', this.config.hoofbeat.baseVolume + ratio * this.config.hoofbeat.maxExtraVolume),
    );
  }

  /**
   * Brief §31 "HorseBreathing" (bu turda EKLENDİ) — `startHoofbeats` ile
   * BİREBİR AYNI başlat/durdur/yoğunluk deseni, ama AYRI bir ses dosyası
   * (`HORSE_BREATHING_SFX_REQUIRED`) ve AYRI bir yoğunluk girdisi
   * (yorgunluk — bkz. `updateHorseBreathingIntensity`) kullanır.
   */
  private startHorseBreathing(): void {
    if (this.horseBreathingPlaying) {
      return;
    }
    const asset = getAssetById('HORSE_BREATHING_SFX_REQUIRED');
    if (!asset) {
      return;
    }
    this.backend.play(asset.expectedPath, {
      loop: true,
      volume: this.resolveVolume('horse', this.config.horseBreathing.baseVolume),
    });
    this.horseBreathingPlaying = true;
    this.lastHorseBreathingRatio = 0;
  }

  private stopHorseBreathing(): void {
    if (!this.horseBreathingPlaying) {
      return;
    }
    const asset = getAssetById('HORSE_BREATHING_SFX_REQUIRED');
    if (asset) {
      this.backend.stop(asset.expectedPath);
    }
    this.horseBreathingPlaying = false;
  }

  /**
   * `updateHoofbeatIntensity` ile AYNI [taban, taban+ek] deseni, ama
   * girdi hıza DEĞİL yorgunluğa (fatigue, ZATEN VAR OLAN telemetriden —
   * bkz. `LiveLeaderboardEntry.fatigue`/`InterpolatedHorseState.fatigue`
   * — [0, 100] aralığında) dayanır: yorgun bir at daha SERT nefes alır.
   */
  updateHorseBreathingIntensity(fatiguePercent: number): void {
    if (!this.horseBreathingPlaying) {
      return;
    }
    const asset = getAssetById('HORSE_BREATHING_SFX_REQUIRED');
    if (!asset) {
      return;
    }
    const ratio = clamp01(fatiguePercent / 100);
    this.lastHorseBreathingRatio = ratio;
    this.backend.setVolume(
      asset.expectedPath,
      this.resolveVolume('horse', this.config.horseBreathing.baseVolume + ratio * this.config.horseBreathing.maxExtraVolume),
    );
  }

  /** Brief §31 "Crowd" (bu turda EKLENDİ) — sabit hacimli, sürekli tribün kalabalığı arka plan sesi (loop). */
  private startCrowdAmbience(): void {
    if (this.crowdPlaying) {
      return;
    }
    const asset = getAssetById('CROWD_AMBIENCE_SFX_REQUIRED');
    if (!asset) {
      return;
    }
    this.backend.play(asset.expectedPath, { loop: true, volume: this.resolveVolume('crowd', this.config.crowdAmbienceVolume) });
    this.crowdPlaying = true;
  }

  private stopCrowdAmbience(): void {
    if (!this.crowdPlaying) {
      return;
    }
    const asset = getAssetById('CROWD_AMBIENCE_SFX_REQUIRED');
    if (asset) {
      this.backend.stop(asset.expectedPath);
    }
    this.crowdPlaying = false;
  }

  /**
   * Brief §31 "Wind" (bu turda EKLENDİ) — sabit hacimli, sürekli rüzgar
   * arka plan sesi (loop). Brief'in 6 kanallı listesinde "Wind"in KENDİ
   * bir kanalı YOK — ortam SFX'i olarak `sfx` kanalı altında sınıflandırılır
   * (bkz. `AudioConfig.windAmbienceVolume` doc yorumu).
   */
  private startWindAmbience(): void {
    if (this.windPlaying) {
      return;
    }
    const asset = getAssetById('WIND_AMBIENCE_SFX_REQUIRED');
    if (!asset) {
      return;
    }
    this.backend.play(asset.expectedPath, { loop: true, volume: this.resolveVolume('sfx', this.config.windAmbienceVolume) });
    this.windPlaying = true;
  }

  private stopWindAmbience(): void {
    if (!this.windPlaying) {
      return;
    }
    const asset = getAssetById('WIND_AMBIENCE_SFX_REQUIRED');
    if (asset) {
      this.backend.stop(asset.expectedPath);
    }
    this.windPlaying = false;
  }

  /**
   * Brief §31 "Commentary" (bu turda EKLENDİ) — `COMMENTARY_VOICE_REQUIRED`
   * TEK bir dosya DEĞİL, bir KLASÖRdür (bkz. o asset'in doc yorumu) —
   * HANGİ klibin çalınacağına ÇAĞIRAN karar verir (ör. "start veriliyor"
   * anlatımı için `"start.mp3"`), bu metot yalnızca klasör yolunu dosya
   * adıyla BİRLEŞTİRİP `commentary` kanalının hacminde ÇALAR — TEK bir
   * "olay" olarak modellenemez çünkü ÇOK SAYIDA olası klip vardır.
   * `fileName` klasör İÇİNDEKİ göreli dosya adıdır, TAM yol DEĞİLDİR.
   */
  playCommentaryLine(fileName: string): void {
    const asset = getAssetById('COMMENTARY_VOICE_REQUIRED');
    if (!asset) {
      return;
    }
    this.backend.play(`${asset.expectedPath}${fileName}`, {
      volume: this.resolveVolume('commentary', this.config.commentaryLineVolume),
    });
  }

  /**
   * Brief §31 "Ses seviyeleri ayrı kontrol edilebilir olmalı" — RUNTIME'da
   * (ör. bir ayarlar ekranından) bir kanalın hacmini değiştirir. O ANDA
   * ÇALAN döngülü sesler (nal/nefes/kalabalık/rüzgar/müzik) varsa YENİ
   * hacim HEMEN uygulanır (bkz. `reapplyActiveLoopVolumes`) — aksi halde
   * bir "Kalabalık" kaydırıcısını yarış SIRASINDA hareket ettirmenin
   * hiçbir GÖZLENEBİLİR etkisi olmazdı, bu da özelliği YARIM/anlamsız
   * bırakırdı.
   */
  setChannelVolume(channel: AudioChannel, volume: number): void {
    this.channelVolumes[channel] = clamp01(volume);
    this.reapplyActiveLoopVolumes();
  }

  getChannelVolume(channel: AudioChannel): number {
    return this.channelVolumes[channel];
  }

  private reapplyActiveLoopVolumes(): void {
    if (this.musicPlaying) {
      const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
      if (music) {
        const base = this.musicDucked
          ? this.config.raceMusicVolume * this.config.finalStretchMusicDuckFactor
          : this.config.raceMusicVolume;
        this.backend.setVolume(music.expectedPath, this.resolveVolume('music', base));
      }
    }
    if (this.hoofbeatPlaying) {
      const asset = getAssetById('HOOFBEAT_SFX_REQUIRED');
      if (asset) {
        this.backend.setVolume(
          asset.expectedPath,
          this.resolveVolume('horse', this.config.hoofbeat.baseVolume + this.lastHoofbeatRatio * this.config.hoofbeat.maxExtraVolume),
        );
      }
    }
    if (this.horseBreathingPlaying) {
      const asset = getAssetById('HORSE_BREATHING_SFX_REQUIRED');
      if (asset) {
        this.backend.setVolume(
          asset.expectedPath,
          this.resolveVolume(
            'horse',
            this.config.horseBreathing.baseVolume + this.lastHorseBreathingRatio * this.config.horseBreathing.maxExtraVolume,
          ),
        );
      }
    }
    if (this.crowdPlaying) {
      const asset = getAssetById('CROWD_AMBIENCE_SFX_REQUIRED');
      if (asset) {
        this.backend.setVolume(asset.expectedPath, this.resolveVolume('crowd', this.config.crowdAmbienceVolume));
      }
    }
    if (this.windPlaying) {
      const asset = getAssetById('WIND_AMBIENCE_SFX_REQUIRED');
      if (asset) {
        this.backend.setVolume(asset.expectedPath, this.resolveVolume('sfx', this.config.windAmbienceVolume));
      }
    }
  }

  /** Testler/temizlik için — bileşen unmount olduğunda (`useEffect` cleanup) çağrılır. */
  stopAll(): void {
    this.stopHoofbeats();
    this.stopHorseBreathing();
    this.stopCrowdAmbience();
    this.stopWindAmbience();
    const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
    if (music) {
      this.backend.stop(music.expectedPath);
      this.musicPlaying = false;
    }
  }
}
