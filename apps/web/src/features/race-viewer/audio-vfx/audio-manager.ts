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
 *
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §17-21 (bu turda
 * GENİŞLETİLDİ) — yeni 32 bölümlük brief'in yeniden denetiminde şu
 * eksiklikler bulundu ve bu turda kapatıldı:
 * - §21 "Master/Music/SFX/Horse/Crowd/Environment/Commentary" 7 kanallı
 *   liste, ama bu dosya sadece 6 kanal destekliyordu (Environment YOK,
 *   Wind YANLIŞLIKLA `sfx` altında sınıflandırılmıştı) — `environment`
 *   kanalı EKLENDİ, `startWindAmbience`/`startStadiumAmbience` bu kanala
 *   TAŞINDI.
 * - §18 "yüzeye göre nal sesi" (HOOF_GRASS/HOOF_DIRT/HOOF_FAST/vb.) —
 *   `RaceSurface` (`@at-sevdalisi/shared-types`) ZATEN VAR OLAN, gerçek
 *   bir domain alanı (races.surface) olduğundan, bu SPEKÜLATİF bir
 *   özellik DEĞİL, mevcut bir veri alanının doğal ses karşılığıdır —
 *   `startHoofbeats` artık opsiyonel bir `surface` parametresi alır,
 *   yüzeye özel asset (`HOOF_GRASS_SFX_REQUIRED` vb.) yoksa jenerik
 *   `HOOFBEAT_SFX_REQUIRED`e DÜŞÜLMEZ (asset-manifest.ts'in KENDİ
 *   dokümante ettiği kural) — ne asset ne de fallback yoksa nal sesi
 *   basitçe SESSİZ kalır, bu "hata" DEĞİLDİR.
 * - §19 "START SIGNAL" (kapılar açılmadan HEMEN ÖNCE çalınan hazır-ol
 *   sinyali) — `GATE_OPEN_SFX_REQUIRED`den (kapı MEKANİZMASI sesi)
 *   KASITLI OLARAK AYRI yeni bir `'start_signal'` event tipi EKLENDİ.
 * - §20 "kalabalık durumu yarışın gidişatına göre değişmeli" —
 *   `final_stretch`te `CROWD_AMBIENCE_SFX_REQUIRED` loop'u artık
 *   `CROWD_EXCITED_SFX_REQUIRED`e ÇAPRAZLANIR (crossfade), `winner`de
 *   AYRICA `CROWD_CHEERING_SFX_REQUIRED` bir seferlik çalınır.
 * - §17 "Horse Snort/Neigh/Movement" — Race Engine'in ŞU AN bu
 *   vokalizasyonları HANGİ ANDA tetikleyeceğine dair bir sinyali
 *   YAYINLAMADIĞI için (rastgele/anlatımsal bir tetikleyici AYRI bir
 *   kapsam) bunlar bir `RaceAudioEventType` OLARAK EKLENMEDİ — bunun
 *   yerine çağıranın (gelecekteki bir rastgele zamanlayıcı/anlatım
 *   sistemi) doğrudan çağırabileceği basit, bağımsız bir seferlik
 *   metotlar (`playHorseSnort`/`playHorseNeigh`/`playHorseMovement`)
 *   olarak eklendi — brief'in KENDİSİ de bu fazda "gerçek tetikleme
 *   mantığı DEĞİL, altyapı" ister.
 */

import type { RaceSurface } from '@at-sevdalisi/shared-types';
import type { AudioConfig } from '@at-sevdalisi/game-config';
import { getAssetById } from '../assets/asset-manifest';

export type RaceAudioEventType = 'race_start' | 'gate_open' | 'start_signal' | 'overtake' | 'final_stretch' | 'finish' | 'photo_finish' | 'winner';

export interface RaceAudioEvent {
  type: RaceAudioEventType;
  /**
   * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §18 (bu turda EKLENDİ) —
   * `race_start`te GEÇİLİRSE nal sesi bu pist yüzeyine ÖZEL asset'i
   * (bkz. `resolveHoofbeatAssetId`) kullanır; GEÇİLMEZSE (veya `handleEvent`
   * ile İLGİSİZ bir event tipindeyse) jenerik `HOOFBEAT_SFX_REQUIRED`e
   * düşülür — bu, `Race.surface`'ın (`@at-sevdalisi/shared-types`)
   * ÇAĞIRAN tarafından İSTEĞE BAĞLI geçirilebilmesiyle geriye dönük
   * UYUMLUDUR (mevcut hiçbir çağrı kırılmaz).
   */
  surface?: RaceSurface;
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
 * / SFX / Crowd / Commentary / Horse" (bu turda EKLENDİ), "REALISTIC 3D
 * ASSET & AUDIO PRODUCTION BRIEF" §21 (bu turda GENİŞLETİLDİ, 7. kanal:
 * Environment) — `AudioConfig.volumeChannels`'in (bkz. `@at-sevdalisi/
 * game-config`'in o alanının doc yorumu) çalışma zamanı karşılığı.
 */
export type AudioChannel = 'master' | 'music' | 'sfx' | 'crowd' | 'commentary' | 'horse' | 'environment';

/**
 * `resolveVolume`'un kabul ettiği, `master`'IN KENDİSİ HARİÇ kanallar —
 * her çalınan ses TAM OLARAK BİR bu kanala aittir, `master` bunun
 * ÜZERİNE AYRICA çarpılır (bkz. `resolveVolume`).
 */
type PlayableAudioChannel = Exclude<AudioChannel, 'master'>;

/**
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §18 (bu turda EKLENDİ) —
 * yüzeye göre nal sesi asset id'lerinin merkezi eşlemesi. `asset-manifest.ts`
 * bu üç asset'in "yoksa jenerik HOOFBEAT'e DÜŞÜLMEZ" kuralını KENDİSİ
 * dokümante eder (bkz. `HOOF_GRASS_SFX_REQUIRED` vb.'nin `fallbackBehavior`
 * alanı) — bu yüzden burada bilinçli olarak `HOOFBEAT_SFX_REQUIRED`e bir
 * "son çare" fallback'i YOKTUR, sadece surface VERİLMEDİĞİNDE (ör. eski
 * çağıran kodlar, ya da yüzeyin henüz bilinmediği bir bağlam) jenerik
 * asset'e düşülür.
 */
type HoofbeatAssetId = 'HOOFBEAT_SFX_REQUIRED' | 'HOOF_GRASS_SFX_REQUIRED' | 'HOOF_DIRT_SFX_REQUIRED' | 'HOOF_SYNTHETIC_SFX_REQUIRED';

function resolveHoofbeatAssetId(surface: RaceSurface | undefined): HoofbeatAssetId {
  switch (surface) {
    case 'grass':
      return 'HOOF_GRASS_SFX_REQUIRED';
    case 'dirt':
      return 'HOOF_DIRT_SFX_REQUIRED';
    case 'synthetic':
      return 'HOOF_SYNTHETIC_SFX_REQUIRED';
    default:
      return 'HOOFBEAT_SFX_REQUIRED';
  }
}

type CrowdAssetId = 'CROWD_AMBIENCE_SFX_REQUIRED' | 'CROWD_EXCITED_SFX_REQUIRED';

/**
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §22 (bu turda EKLENDİ)
 * — brief'in KENDİ "Commentary event listesi" (`RACE_START`/`OVERTAKE`/
 * `LEADER_CHANGE`/`FINAL_400`/`FINAL_200`/`FINAL_100`/`SPRINT`/`FINISH`/
 * `WINNER`) DAHA ÖNCE `COMMENTARY_VOICE_REQUIRED`'in doc yorumunda
 * "tam liste ileride eşleştirilecektir" olarak ERTELENMİŞTİ — bu tip
 * VE aşağıdaki `COMMENTARY_LINE_FILENAMES` o eşlemeyi TAMAMLAR. Not:
 * `LEADER_CHANGE`/`FINAL_400`/`FINAL_100` Race Engine'in ŞU AN
 * yaymadığı YENİ telemetri anları OLDUĞUNDAN (mevcut `RaceAudioEventType`
 * `overtake`/`final_stretch`/`finish`/`winner`den DAHA GRANÜLERdir) bu
 * moment'ler `handleEvent`e BAĞLANMADI — `Camera Director`ın konum
 * eşiklerinden TÜRETİLMİŞ olay sınıflandırmasıyla AYNI şekilde, gerçek
 * entegrasyon Race Engine'in bu anları YAYINLAMASINI gerektiren AYRI
 * bir kapsamdır (brief'in KENDİSİ de bu fazda "gerçek tetikleme mantığı
 * DEĞİL, altyapı" ister). `playCommentaryForMoment` bu yüzden
 * `RaceAudioEvent`ten DEĞİL, ÇAĞIRANIN doğrudan kararından beslenir —
 * `playHorseSnort` vb. ile AYNI "bağımsız bir seferlik metot" deseni.
 */
export type CommentaryMoment =
  | 'race_start'
  | 'overtake'
  | 'leader_change'
  | 'final_400'
  | 'final_200'
  | 'final_100'
  | 'sprint'
  | 'finish'
  | 'winner';

/**
 * `COMMENTARY_VOICE_REQUIRED.expectedPath` KLASÖRÜ İÇİNDEKİ göreli dosya
 * adları — `docs/ASSET_GUIDE.md`'nin `COMMENTARY_VOICE_REQUIRED` bölümündeki
 * TABLO ile BİREBİR eşleşir, biri değişirse İKİSİ DE güncellenmelidir.
 */
export const COMMENTARY_LINE_FILENAMES: Record<CommentaryMoment, string> = {
  race_start: 'race-start.mp3',
  overtake: 'overtake.mp3',
  leader_change: 'leader-change.mp3',
  final_400: 'final-400.mp3',
  final_200: 'final-200.mp3',
  final_100: 'final-100.mp3',
  sprint: 'sprint.mp3',
  finish: 'finish.mp3',
  winner: 'winner.mp3',
};

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
  private stadiumAmbientPlaying = false;
  private musicPlaying = false;
  private musicDucked = false;
  /** `setChannelVolume`'un o an çalan döngülü sesi ANINDA yeniden hesaplayabilmesi için son bilinen yoğunluk oranı (bkz. `reapplyActiveLoopVolumes`). */
  private lastHoofbeatRatio = 0;
  private lastHorseBreathingRatio = 0;
  /**
   * Brief §18 (bu turda EKLENDİ, İkinci öz-denetim turunda `'HOOF_TURN_
   * SFX_REQUIRED'` ile GENİŞLETİLDİ) — o an ÇALAN nal sesi asset'i,
   * `stopHoofbeats`/`updateHoofbeatIntensity`/`reapplyActiveLoopVolumes`'un
   * HANGİ asset'i hedefleyeceğini bilmesi için. Yüzey asset'lerinden
   * (`HoofbeatAssetId`) FARKLI olarak `'HOOF_TURN_SFX_REQUIRED'` da bu
   * alana YAZILABİLİR (viraj sırasında GEÇİCİ OLARAK, bkz.
   * `setHoofbeatTurning`) — bu yüzden tip BURADA genişletilir, ama
   * `surfaceHoofbeatAssetId` (altta) hangi yüzeye DÖNÜLECEĞİNİ ayrı
   * tutar.
   */
  private activeHoofbeatAssetId: HoofbeatAssetId | 'HOOF_TURN_SFX_REQUIRED' | null = null;
  /** İkinci öz-denetim turu (bu turda EKLENDİ) — `setHoofbeatTurning(false)` çağrıldığında DÖNÜLECEK yüzey asset'i (`race_start`ta hangi yüzeyle başlatıldıysa o, viraj sırasında DEĞİŞMEZ). */
  private surfaceHoofbeatAssetId: HoofbeatAssetId | null = null;
  /** İkinci öz-denetim turu (bu turda EKLENDİ) — o an viraj nal sesinin mi yüzey nal sesinin mi ÇALDIĞI (bkz. `setHoofbeatTurning`'in guard'ı — gereksiz tekrar play/stop çağrısı ÖNLENİR). */
  private hoofbeatTurning = false;
  /** Brief §20 (bu turda EKLENDİ) — o an ÇALAN kalabalık döngüsü (ambience veya final-düzlük "excited" varyantı), bkz. `switchToExcitedCrowd`. */
  private activeCrowdAssetId: CrowdAssetId | null = null;

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
      environment: clamp01(config.volumeChannels.environment),
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
   * durum-değiştiren) olay VE "REALISTIC 3D ASSET & AUDIO PRODUCTION
   * BRIEF" §19'un `start_signal`'ı burada işlenir — Hoof/HorseBreathing/
   * Crowd/Wind/StadiumAmbient SÜREKLİ (loop/ambient) sesler olduğundan
   * burada DEĞİL, kendi başlat/durdur metotlarında (bkz. altları)
   * yönetilir; Commentary ise TEK bir "olay" değil, ÇOK SAYIDA olası
   * klipten biridir (bkz. `playCommentaryLine`); Horse Snort/Neigh/
   * Movement (§17) ise Race Engine'in HENÜZ yaymadığı bir sinyale bağlı
   * OLMADIĞINDAN event DEĞİL, bağımsız bir seferlik metotlardır (bkz.
   * `playHorseSnort` vb.).
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
        // birlikte başlar — nal (yüzeye göre), at nefesi, kalabalık,
        // rüzgar, stadyum ortamı.
        this.startHoofbeats(event.surface);
        this.startHorseBreathing();
        this.startCrowdAmbience();
        this.startWindAmbience();
        this.startStadiumAmbience();
        return;
      }
      case 'gate_open': {
        const asset = getAssetById('GATE_OPEN_SFX_REQUIRED');
        if (asset) {
          this.backend.play(asset.expectedPath, { volume: this.resolveVolume('sfx', this.config.gateOpenVolume) });
        }
        return;
      }
      case 'start_signal': {
        // Brief §19 — kapılar açılmadan HEMEN ÖNCE, `gate_open`'dan
        // (kapı MEKANİZMASI sesi) KASITLI OLARAK AYRI hazır-ol sinyali.
        const asset = getAssetById('START_SIGNAL_SFX_REQUIRED');
        if (asset) {
          this.backend.play(asset.expectedPath, { volume: this.resolveVolume('sfx', this.config.startSignalVolume) });
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
        // Brief §20 (bu turda EKLENDİ) — "kalabalık durumu yarışın
        // gidişatına göre değişmeli": sakin ambience'tan yükselmiş
        // "excited" kalabalık döngüsüne çapraz geçiş.
        this.switchToExcitedCrowd();
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
      case 'photo_finish': {
        // İkinci öz-denetim turu (bu turda EKLENDİ) — `photo-finish.ts`teki
        // ZATEN VAR OLAN `isCloseFinish()` fonksiyonu `true` döndüğünde
        // ÇAĞIRAN tarafından tetiklenir (bu dosya `isCloseFinish`'i
        // İÇE AKTARMAZ — framework/domain'den bağımsız kalma prensibi,
        // `updateHoofbeatIntensity`'nin `speedMps`i HESAPLAMAMASIYLA AYNI
        // desen). `finish`ten AYRI, KENDİ bir seferlik (döngüsüz) sesi.
        const asset = getAssetById('PHOTO_FINISH_SFX_REQUIRED');
        if (asset) {
          this.backend.play(asset.expectedPath, { volume: this.resolveVolume('sfx', this.config.photoFinishVolume) });
        }
        return;
      }
      case 'winner': {
        // Brief §31 "Winner" — "Finish" fanfarından KASITLI OLARAK AYRI
        // bir ses: `finish` yarış çizgisini geçme ANINI, `winner` ise
        // kazananın KESİNLEŞTİĞİ (Winner Ceremony sunumunun başlangıcı,
        // AYRI ve gelecekteki bir özellik kapsamı) anı işaretler — brief
        // bu ikisini AYRI kategoriler olarak listeler.
        const asset = getAssetById('WINNER_CELEBRATION_SFX_REQUIRED');
        if (asset) {
          this.backend.play(asset.expectedPath, { volume: this.resolveVolume('sfx', this.config.winnerCelebrationVolume) });
        }
        // "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §20 (bu turda
        // EKLENDİ) — kazanan kesinleştiği andaki kalabalık tezahürat
        // patlaması, `WINNER_CELEBRATION_SFX_REQUIRED` ile BİRLİKTE,
        // bir seferlik (döngüsüz) çalar.
        const cheering = getAssetById('CROWD_CHEERING_SFX_REQUIRED');
        if (cheering) {
          this.backend.play(cheering.expectedPath, { volume: this.resolveVolume('crowd', this.config.crowdCheeringVolume) });
        }
        return;
      }
    }
  }

  /**
   * Brief §31 "hıza göre nal sesi yoğunluğu" isteği — `speedMps`/`maxSpeedMps`
   * ZATEN VAR OLAN telemetriden (`InterpolatedHorseState.speedMps`, Race
   * Engine'in `RaceBalanceConfig`'indeki azami hız) gelir, burada yeni bir
   * fizik/skor HESAPLANMAZ, sadece [0,1] aralığına ORANLANIR.
   *
   * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §18 (bu turda
   * GENİŞLETİLDİ) — opsiyonel `surface` parametresi, hangi yüzeye özel
   * asset'in (bkz. `resolveHoofbeatAssetId`) çalınacağını belirler;
   * verilmezse jenerik `HOOFBEAT_SFX_REQUIRED`e düşülür (geriye dönük
   * UYUMLU — mevcut hiçbir çağrı kırılmaz).
   */
  private startHoofbeats(surface?: RaceSurface): void {
    if (this.hoofbeatPlaying) {
      return;
    }
    const assetId = resolveHoofbeatAssetId(surface);
    const asset = getAssetById(assetId);
    if (!asset) {
      return;
    }
    this.backend.play(asset.expectedPath, { loop: true, volume: this.resolveVolume('horse', this.config.hoofbeat.baseVolume) });
    this.hoofbeatPlaying = true;
    this.activeHoofbeatAssetId = assetId;
    this.surfaceHoofbeatAssetId = assetId;
    this.hoofbeatTurning = false;
    this.lastHoofbeatRatio = 0;
  }

  private stopHoofbeats(): void {
    if (!this.hoofbeatPlaying) {
      return;
    }
    const asset = this.activeHoofbeatAssetId ? getAssetById(this.activeHoofbeatAssetId) : undefined;
    if (asset) {
      this.backend.stop(asset.expectedPath);
    }
    this.hoofbeatPlaying = false;
    this.activeHoofbeatAssetId = null;
    this.surfaceHoofbeatAssetId = null;
    this.hoofbeatTurning = false;
  }

  /**
   * İkinci öz-denetim turu (bu turda EKLENDİ) — "REALISTIC 3D ASSET &
   * AUDIO PRODUCTION BRIEF" §18 "HOOF_TURN": `track-path.ts`teki ZATEN
   * VAR OLAN `isOnTrackTurn()` fonksiyonunun sonucunu (bu dosya o
   * fonksiyonu İÇE AKTARMAZ — `updateHoofbeatIntensity`nin `speedMps`i
   * NEREDEN geldiğini bilmemesiyle AYNI ayrıştırma disiplini, ÇAĞIRAN
   * hesaplar) alıp nal sesini viraj/düz kısım asset'leri ARASINDA
   * ÇAPRAZLAR (crossfade — `switchToExcitedCrowd` ile AYNI desen: yeniyi
   * başlat, eskiyi durdur). `onTurn` mevcut durumla AYNIYSA (guard) veya
   * nal sesi HİÇ çalmıyorsa (`hoofbeatPlaying === false`) hiçbir şey
   * YAPMAZ. Viraj asset'i (`HOOF_TURN_SFX_REQUIRED`) YOKSA sessizce
   * ATLANIR — mevcut yüzey nal sesi KESİNTİYE UĞRAMADAN çalmaya devam
   * eder (`hoofbeatTurning` bu durumda `false` OLARAK KALIR, bir
   * SONRAKİ viraja girişte asset TEKRAR denenir).
   */
  setHoofbeatTurning(onTurn: boolean): void {
    if (!this.hoofbeatPlaying || onTurn === this.hoofbeatTurning) {
      return;
    }
    const targetAssetId: HoofbeatAssetId | 'HOOF_TURN_SFX_REQUIRED' | null = onTurn
      ? 'HOOF_TURN_SFX_REQUIRED'
      : this.surfaceHoofbeatAssetId;
    if (!targetAssetId) {
      return;
    }
    const targetAsset = getAssetById(targetAssetId);
    if (!targetAsset) {
      return;
    }
    const previous = this.activeHoofbeatAssetId ? getAssetById(this.activeHoofbeatAssetId) : undefined;
    this.backend.play(targetAsset.expectedPath, {
      loop: true,
      volume: this.resolveVolume('horse', this.config.hoofbeat.baseVolume + this.lastHoofbeatRatio * this.config.hoofbeat.maxExtraVolume),
    });
    if (previous) {
      this.backend.stop(previous.expectedPath);
    }
    this.activeHoofbeatAssetId = targetAssetId;
    this.hoofbeatTurning = onTurn;
  }

  updateHoofbeatIntensity(speedMps: number, maxSpeedMps: number): void {
    if (!this.hoofbeatPlaying) {
      return;
    }
    const asset = this.activeHoofbeatAssetId ? getAssetById(this.activeHoofbeatAssetId) : undefined;
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

  /** Brief §31 "Crowd" (bu turda EKLENDİ) — sabit hacimli, sürekli tribün kalabalığı arka plan sesi (loop, ambience varyantı). */
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
    this.activeCrowdAssetId = 'CROWD_AMBIENCE_SFX_REQUIRED';
  }

  private stopCrowdAmbience(): void {
    if (!this.crowdPlaying) {
      return;
    }
    const asset = this.activeCrowdAssetId ? getAssetById(this.activeCrowdAssetId) : undefined;
    if (asset) {
      this.backend.stop(asset.expectedPath);
    }
    this.crowdPlaying = false;
    this.activeCrowdAssetId = null;
  }

  /**
   * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §20 (bu turda EKLENDİ)
   * — final düzlükte sakin `CROWD_AMBIENCE_SFX_REQUIRED` döngüsünü
   * yükselmiş gerilim seviyesindeki `CROWD_EXCITED_SFX_REQUIRED` döngüsüne
   * ÇAPRAZLAR (crossfade — önce yenisini başlat, sonra eskisini durdur,
   * kısa bir an İKİSİ birden çalar). Kalabalık HİÇ başlamadıysa (`race_
   * start` çağrılmadıysa, `crowdPlaying === false`) hiçbir şey YAPMAZ —
   * `startHoofbeats`in guard deseniyle AYNI disiplin. "Excited" asset'i
   * YOKSA sessizce ATLANIR, mevcut ambience döngüsü OLDUĞU GİBİ çalmaya
   * devam eder (brief'in "asset yoksa çökmeden fallback" kuralı — burada
   * "fallback", zaten çalan sesin KESİNTİYE UĞRAMAMASIdır).
   */
  private switchToExcitedCrowd(): void {
    if (!this.crowdPlaying || this.activeCrowdAssetId === 'CROWD_EXCITED_SFX_REQUIRED') {
      return;
    }
    const excited = getAssetById('CROWD_EXCITED_SFX_REQUIRED');
    if (!excited) {
      return;
    }
    const previous = this.activeCrowdAssetId ? getAssetById(this.activeCrowdAssetId) : undefined;
    this.backend.play(excited.expectedPath, { loop: true, volume: this.resolveVolume('crowd', this.config.crowdExcitedVolume) });
    if (previous) {
      this.backend.stop(previous.expectedPath);
    }
    this.activeCrowdAssetId = 'CROWD_EXCITED_SFX_REQUIRED';
  }

  /**
   * Brief §31 "Wind" (bu turda EKLENDİ) — sabit hacimli, sürekli rüzgar
   * arka plan sesi (loop). "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF"
   * §21 (bu turda DÜZELTİLDİ) — brief'in 7 kanallı listesinde "Wind" AYRI
   * bir kanal DEĞİL, `environment` kanalı altında sınıflandırılır (daha
   * önce YANLIŞLIKLA `sfx` kanalına bağlıydı).
   */
  private startWindAmbience(): void {
    if (this.windPlaying) {
      return;
    }
    const asset = getAssetById('WIND_AMBIENCE_SFX_REQUIRED');
    if (!asset) {
      return;
    }
    this.backend.play(asset.expectedPath, { loop: true, volume: this.resolveVolume('environment', this.config.windAmbienceVolume) });
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
   * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §20 (bu turda EKLENDİ)
   * — genel stadyum atmosferi (loop), `CROWD_AMBIENCE_SFX_REQUIRED`den
   * (kalabalık SESİ) KASITLI OLARAK AYRI: hoparlör hışırtısı/uzak mekanik
   * gürültü gibi kalabalıktan BAĞIMSIZ yapısal ortam sesi, `wind` ile AYNI
   * `environment` kanalını paylaşır.
   */
  private startStadiumAmbience(): void {
    if (this.stadiumAmbientPlaying) {
      return;
    }
    const asset = getAssetById('STADIUM_AMBIENT_SFX_REQUIRED');
    if (!asset) {
      return;
    }
    this.backend.play(asset.expectedPath, {
      loop: true,
      volume: this.resolveVolume('environment', this.config.stadiumAmbientVolume),
    });
    this.stadiumAmbientPlaying = true;
  }

  private stopStadiumAmbience(): void {
    if (!this.stadiumAmbientPlaying) {
      return;
    }
    const asset = getAssetById('STADIUM_AMBIENT_SFX_REQUIRED');
    if (asset) {
      this.backend.stop(asset.expectedPath);
    }
    this.stadiumAmbientPlaying = false;
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
   * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §22 (bu turda EKLENDİ)
   * — `playCommentaryLine`in ÜZERİNE inşa edilmiş, TİP-GÜVENLİ bir
   * kısayol: çağıran keyfi bir dosya adı YAZMAK yerine `CommentaryMoment`
   * union'ından SEÇİM yapar, dosya adı eşlemesi (`COMMENTARY_LINE_FILENAMES`)
   * TEK bir yerden yönetilir — bir yazım hatası (ör. `"race-strat.mp3"`)
   * artık DERLEME ZAMANINDA değil ÇALIŞMA ZAMANINDA bile mümkün DEĞİLDİR.
   * `playCommentaryLine` geriye dönük UYUMLU olarak KALIR (serbest metin
   * gerektiren gelecekteki bir kullanım için).
   */
  playCommentaryForMoment(moment: CommentaryMoment): void {
    this.playCommentaryLine(COMMENTARY_LINE_FILENAMES[moment]);
  }

  /**
   * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §17 (bu turda EKLENDİ)
   * — Race Engine'in bu vokalizasyonları HANGİ ANDA tetikleyeceğine dair
   * bir sinyali HENÜZ yaymadığı için (rastgele/anlatımsal bir tetikleyici
   * AYRI bir kapsam, brief'in KENDİSİ de bu fazda "gerçek tetikleme
   * mantığı DEĞİL, altyapı" ister) bunlar `handleEvent`e BAĞLI DEĞİLDİR,
   * çağıranın kendi kararıyla (ör. gelecekteki bir rastgele zamanlayıcı)
   * çağırabileceği bağımsız bir seferlik metotlardır — üçü de `horse`
   * kanalını paylaşır, `hoofbeat`/`horseBreathing`in aksine DÖNGÜSÜZ ve
   * durum TUTMAZLAR (birden çok kez üst üste çağrılabilir).
   */
  playHorseSnort(): void {
    const asset = getAssetById('HORSE_SNORT_SFX_REQUIRED');
    if (asset) {
      this.backend.play(asset.expectedPath, { volume: this.resolveVolume('horse', this.config.horseSnortVolume) });
    }
  }

  playHorseNeigh(): void {
    const asset = getAssetById('HORSE_NEIGH_SFX_REQUIRED');
    if (asset) {
      this.backend.play(asset.expectedPath, { volume: this.resolveVolume('horse', this.config.horseNeighVolume) });
    }
  }

  playHorseMovement(): void {
    const asset = getAssetById('HORSE_MOVEMENT_SFX_REQUIRED');
    if (asset) {
      this.backend.play(asset.expectedPath, { volume: this.resolveVolume('horse', this.config.horseMovementVolume) });
    }
  }

  /**
   * Brief §31 "Ses seviyeleri ayrı kontrol edilebilir olmalı" — RUNTIME'da
   * (ör. bir ayarlar ekranından) bir kanalın hacmini değiştirir. O ANDA
   * ÇALAN döngülü sesler (nal/nefes/kalabalık/rüzgar/stadyum/müzik) varsa
   * YENİ hacim HEMEN uygulanır (bkz. `reapplyActiveLoopVolumes`) — aksi
   * halde bir "Kalabalık" kaydırıcısını yarış SIRASINDA hareket
   * ettirmenin hiçbir GÖZLENEBİLİR etkisi olmazdı, bu da özelliği
   * YARIM/anlamsız bırakırdı.
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
    if (this.hoofbeatPlaying && this.activeHoofbeatAssetId) {
      const asset = getAssetById(this.activeHoofbeatAssetId);
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
    if (this.crowdPlaying && this.activeCrowdAssetId) {
      const asset = getAssetById(this.activeCrowdAssetId);
      if (asset) {
        const base = this.activeCrowdAssetId === 'CROWD_EXCITED_SFX_REQUIRED' ? this.config.crowdExcitedVolume : this.config.crowdAmbienceVolume;
        this.backend.setVolume(asset.expectedPath, this.resolveVolume('crowd', base));
      }
    }
    if (this.windPlaying) {
      const asset = getAssetById('WIND_AMBIENCE_SFX_REQUIRED');
      if (asset) {
        this.backend.setVolume(asset.expectedPath, this.resolveVolume('environment', this.config.windAmbienceVolume));
      }
    }
    if (this.stadiumAmbientPlaying) {
      const asset = getAssetById('STADIUM_AMBIENT_SFX_REQUIRED');
      if (asset) {
        this.backend.setVolume(asset.expectedPath, this.resolveVolume('environment', this.config.stadiumAmbientVolume));
      }
    }
  }

  /** Testler/temizlik için — bileşen unmount olduğunda (`useEffect` cleanup) çağrılır. */
  stopAll(): void {
    this.stopHoofbeats();
    this.stopHorseBreathing();
    this.stopCrowdAmbience();
    this.stopWindAmbience();
    this.stopStadiumAmbience();
    const music = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED');
    if (music) {
      this.backend.stop(music.expectedPath);
      this.musicPlaying = false;
    }
  }
}
