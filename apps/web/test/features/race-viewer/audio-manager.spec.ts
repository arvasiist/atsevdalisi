import { describe, expect, it } from 'vitest';
import {
  RaceAudioManager,
  SILENT_AUDIO_BACKEND,
  type AudioBackend,
  type AudioPlayOptions,
} from '../../../src/features/race-viewer/audio-vfx/audio-manager';
import { getAssetById } from '../../../src/features/race-viewer/assets/asset-manifest';
import audioConfigJson from '../../../../../config/audio.config.json';
import type { AudioConfig } from '@at-sevdalisi/game-config';

/** Faz 6 "Config ayrımı" — bkz. `camera-director.spec.ts`'in AYNI desen açıklaması. */
const config = audioConfigJson as unknown as AudioConfig;

interface RecordedCall {
  method: 'play' | 'stop' | 'setVolume';
  path: string;
  options?: AudioPlayOptions;
  volume?: number;
}

function createRecordingBackend(): { backend: AudioBackend; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const backend: AudioBackend = {
    play: (path, options) => calls.push({ method: 'play', path, options }),
    stop: (path) => calls.push({ method: 'stop', path }),
    setVolume: (path, volume) => calls.push({ method: 'setVolume', path, volume }),
  };
  return { backend, calls };
}

describe('SILENT_AUDIO_BACKEND', () => {
  it('hiçbir metodu çağırmak hata fırlatmaz (brief\'in "dosya yoksa sessiz no-op" kuralı)', () => {
    expect(() => SILENT_AUDIO_BACKEND.play('x')).not.toThrow();
    expect(() => SILENT_AUDIO_BACKEND.stop('x')).not.toThrow();
    expect(() => SILENT_AUDIO_BACKEND.setVolume('x', 1)).not.toThrow();
  });
});

describe('RaceAudioManager — backend verilmezse SILENT_AUDIO_BACKEND kullanılır', () => {
  it('hiçbir backend verilmeden event işlemek hata fırlatmaz', () => {
    const manager = new RaceAudioManager(config);
    expect(() => manager.handleEvent({ type: 'race_start' })).not.toThrow();
    expect(() => manager.handleEvent({ type: 'gate_open' })).not.toThrow();
    expect(() => manager.handleEvent({ type: 'overtake' })).not.toThrow();
    expect(() => manager.handleEvent({ type: 'final_stretch' })).not.toThrow();
    expect(() => manager.handleEvent({ type: 'finish' })).not.toThrow();
    expect(() => manager.handleEvent({ type: 'winner' })).not.toThrow();
    expect(() => manager.updateHoofbeatIntensity(5, 10)).not.toThrow();
    expect(() => manager.updateHorseBreathingIntensity(50)).not.toThrow();
    expect(() => manager.playCommentaryLine('x.mp3')).not.toThrow();
    expect(() => manager.setChannelVolume('sfx', 0.2)).not.toThrow();
    expect(() => manager.stopAll()).not.toThrow();
  });
});

describe('RaceAudioManager — race_start', () => {
  it('yarış müziğini döngülü çalar ve nal seslerini başlatır', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });

    const musicPath = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED')!.expectedPath;
    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;

    expect(calls.some((c) => c.method === 'play' && c.path === musicPath && c.options?.loop === true)).toBe(true);
    expect(calls.some((c) => c.method === 'play' && c.path === hoofbeatPath && c.options?.loop === true)).toBe(true);
  });

  /**
   * Faz 2/4 hata düzeltmesi (bu turda EKLENDİ) — brief §31'in "Architecture"
   * listesindeki, `race_start` ile birlikte başlaması gereken KALAN üç
   * süregelen (loop) ses katmanı: HorseBreathing/Crowd/Wind.
   */
  it('at nefesi, kalabalık ve rüzgar ambiyansını da döngülü başlatır', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });

    const breathingPath = getAssetById('HORSE_BREATHING_SFX_REQUIRED')!.expectedPath;
    const crowdPath = getAssetById('CROWD_AMBIENCE_SFX_REQUIRED')!.expectedPath;
    const windPath = getAssetById('WIND_AMBIENCE_SFX_REQUIRED')!.expectedPath;

    expect(calls.some((c) => c.method === 'play' && c.path === breathingPath && c.options?.loop === true)).toBe(true);
    expect(calls.some((c) => c.method === 'play' && c.path === crowdPath && c.options?.loop === true)).toBe(true);
    expect(calls.some((c) => c.method === 'play' && c.path === windPath && c.options?.loop === true)).toBe(true);
  });

  it('nal sesleri zaten çalıyorsa race_start tekrar çağrıldığında İKİNCİ KEZ play çağrılmaz', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    const playCallsAfterFirst = calls.filter((c) => c.method === 'play').length;
    manager.handleEvent({ type: 'race_start' });
    const playCallsAfterSecond = calls.filter((c) => c.method === 'play').length;
    // Müzik ikinci kez de play çağrılabilir (yeniden başlatma davranışı bu testin konusu DEĞİL),
    // ama nal sesi için AYRI bir play çağrısı EKLENMEMELİ (startHoofbeats guard'ı).
    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    const hoofbeatPlayCalls = calls.filter((c) => c.method === 'play' && c.path === hoofbeatPath).length;
    expect(hoofbeatPlayCalls).toBe(1);
    expect(playCallsAfterSecond).toBeGreaterThanOrEqual(playCallsAfterFirst);
  });
});

describe('RaceAudioManager — final_stretch', () => {
  it('müzik hacmini düşürür (duck)', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    manager.handleEvent({ type: 'final_stretch' });

    const musicPath = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED')!.expectedPath;
    const volumeCalls = calls.filter((c) => c.method === 'setVolume' && c.path === musicPath);
    expect(volumeCalls.length).toBeGreaterThan(0);
    expect(volumeCalls[volumeCalls.length - 1]!.volume!).toBeLessThan(config.raceMusicVolume);
  });
});

describe('RaceAudioManager — finish', () => {
  it('nal seslerini durdurur, müziği durdurur, fanfar çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    manager.handleEvent({ type: 'finish' });

    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    const musicPath = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED')!.expectedPath;
    const fanfarePath = getAssetById('RACE_FINISH_FANFARE_REQUIRED')!.expectedPath;

    expect(calls.some((c) => c.method === 'stop' && c.path === hoofbeatPath)).toBe(true);
    expect(calls.some((c) => c.method === 'stop' && c.path === musicPath)).toBe(true);
    expect(calls.some((c) => c.method === 'play' && c.path === fanfarePath)).toBe(true);
  });

  it('yarış hiç başlamadıysa (race_start çağrılmadıysa) finish çağrıldığında nal sesi durdurma denemesi yapılmaz', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'finish' });

    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'stop' && c.path === hoofbeatPath)).toBe(false);
  });

  /** Faz 2/4 hata düzeltmesi — `finish` at nefesini de durdurur (koşan at durdu). */
  it('at nefesini de durdurur', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    manager.handleEvent({ type: 'finish' });

    const breathingPath = getAssetById('HORSE_BREATHING_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'stop' && c.path === breathingPath)).toBe(true);
  });
});

/**
 * Faz 2/4 hata düzeltmesi (bu turda EKLENDİ) — brief §31'in örnek
 * eşleştirmesindeki ("GATES_OPEN → GateOpen", "OVERTAKE → Overtake",
 * "WINNER → Winner") daha önce KARŞILIĞI OLMAYAN üç ayrık olay.
 */
describe('RaceAudioManager — gate_open / overtake / winner', () => {
  it('gate_open bir seferlik (döngüsüz) SFX çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'gate_open' });

    const gatePath = getAssetById('GATE_OPEN_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === gatePath && !c.options?.loop)).toBe(true);
  });

  it('overtake bir seferlik (döngüsüz) SFX çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'overtake' });

    const overtakePath = getAssetById('OVERTAKE_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === overtakePath && !c.options?.loop)).toBe(true);
  });

  it('winner, finish fanfarından AYRI bir ses çalar (finish çağrılmadan da tek başına çalışır)', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'winner' });

    const winnerPath = getAssetById('WINNER_CELEBRATION_SFX_REQUIRED')!.expectedPath;
    const fanfarePath = getAssetById('RACE_FINISH_FANFARE_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === winnerPath)).toBe(true);
    expect(calls.some((c) => c.method === 'play' && c.path === fanfarePath)).toBe(false);
  });
});

describe('RaceAudioManager.updateHorseBreathingIntensity', () => {
  it('at nefesi çalmıyorsa hiçbir şey yapmaz', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.updateHorseBreathingIntensity(80);
    expect(calls.length).toBe(0);
  });

  it('yorgunluk oranına göre hacmi [taban, taban+ek] aralığında ayarlar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0;

    manager.updateHorseBreathingIntensity(100); // tam yorgun → maksimum hacim
    const breathingPath = getAssetById('HORSE_BREATHING_SFX_REQUIRED')!.expectedPath;
    const lastVolumeCall = calls.filter((c) => c.method === 'setVolume' && c.path === breathingPath).pop();
    expect(lastVolumeCall).toBeDefined();
    expect(lastVolumeCall!.volume!).toBeCloseTo(config.horseBreathing.baseVolume + config.horseBreathing.maxExtraVolume, 6);
  });
});

/**
 * Faz 2/4 hata düzeltmesi (bu turda EKLENDİ) — brief §31'in "Commentary"
 * kategorisi: `COMMENTARY_VOICE_REQUIRED` bir KLASÖR olduğundan, çalınacak
 * klip dosya adı ÇAĞIRAN tarafından belirlenir.
 */
describe('RaceAudioManager.playCommentaryLine', () => {
  it('klasör yolu ile dosya adını birleştirip commentary kanalında çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.playCommentaryLine('start.mp3');

    const folder = getAssetById('COMMENTARY_VOICE_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === `${folder}start.mp3`)).toBe(true);
  });
});

/**
 * Faz 2/4 hata düzeltmesi (bu turda EKLENDİ) — brief §31'in "Ses seviyeleri
 * ayrı kontrol edilebilir olmalı: Master/Music/SFX/Crowd/Commentary/Horse"
 * gereksinimi.
 */
describe('RaceAudioManager.setChannelVolume', () => {
  it('yeni kanal hacmini getChannelVolume ile yansıtır', () => {
    const manager = new RaceAudioManager(config);
    manager.setChannelVolume('music', 0.3);
    expect(manager.getChannelVolume('music')).toBe(0.3);
  });

  it('[0, 1] dışındaki değerleri KIRPAR (gerçek bir runtime guard, uydurma sınır değil)', () => {
    const manager = new RaceAudioManager(config);
    manager.setChannelVolume('sfx', 2);
    expect(manager.getChannelVolume('sfx')).toBe(1);
    manager.setChannelVolume('sfx', -1);
    expect(manager.getChannelVolume('sfx')).toBe(0);
  });

  it('o an çalan bir döngülü sesin (kalabalık) hacmini ANINDA yeniden hesaplar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0;

    manager.setChannelVolume('crowd', 0.5);
    const crowdPath = getAssetById('CROWD_AMBIENCE_SFX_REQUIRED')!.expectedPath;
    const lastCall = calls.filter((c) => c.method === 'setVolume' && c.path === crowdPath).pop();
    expect(lastCall).toBeDefined();
    expect(lastCall!.volume!).toBeCloseTo(config.crowdAmbienceVolume * 0.5 * config.volumeChannels.master, 6);
  });

  it('master kanalı kısıldığında BAŞKA bir kanala (horse) ait, o an çalan bir ses de etkilenir', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0;

    manager.setChannelVolume('master', 0.5);
    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    const lastCall = calls.filter((c) => c.method === 'setVolume' && c.path === hoofbeatPath).pop();
    expect(lastCall).toBeDefined();
    expect(lastCall!.volume!).toBeCloseTo(config.hoofbeat.baseVolume * config.volumeChannels.horse * 0.5, 6);
  });
});

describe('RaceAudioManager.updateHoofbeatIntensity', () => {
  it('nal sesleri çalmıyorsa hiçbir şey yapmaz', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.updateHoofbeatIntensity(10, 20);
    expect(calls.length).toBe(0);
  });

  it('hız oranına göre hacmi [taban, taban+ek] aralığında ayarlar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0; // race_start'ın kendi play çağrılarını temizle, sadece updateHoofbeatIntensity'i test et.

    manager.updateHoofbeatIntensity(20, 20); // tam hız → maksimum hacim
    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    const lastVolumeCall = calls.filter((c) => c.method === 'setVolume' && c.path === hoofbeatPath).pop();
    expect(lastVolumeCall).toBeDefined();
    expect(lastVolumeCall!.volume!).toBeCloseTo(config.hoofbeat.baseVolume + config.hoofbeat.maxExtraVolume, 6);
  });

  it('maxSpeedMps sıfırsa bölme hatası oluşturmaz (güvenli varsayılan)', () => {
    const { backend } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    expect(() => manager.updateHoofbeatIntensity(5, 0)).not.toThrow();
  });
});

describe('RaceAudioManager.stopAll', () => {
  it('nal sesini ve müziği durdurur', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0;
    manager.stopAll();

    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    const musicPath = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'stop' && c.path === hoofbeatPath)).toBe(true);
    expect(calls.some((c) => c.method === 'stop' && c.path === musicPath)).toBe(true);
  });

  /** Faz 2/4 hata düzeltmesi — `race_start`'ın başlattığı KALAN üç loop'u da (nefes/kalabalık/rüzgar) durdurur. */
  it('at nefesini, kalabalığı ve rüzgarı da durdurur', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0;
    manager.stopAll();

    const breathingPath = getAssetById('HORSE_BREATHING_SFX_REQUIRED')!.expectedPath;
    const crowdPath = getAssetById('CROWD_AMBIENCE_SFX_REQUIRED')!.expectedPath;
    const windPath = getAssetById('WIND_AMBIENCE_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'stop' && c.path === breathingPath)).toBe(true);
    expect(calls.some((c) => c.method === 'stop' && c.path === windPath)).toBe(true);
    expect(calls.some((c) => c.method === 'stop' && c.path === crowdPath)).toBe(true);
  });

  /** "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §20 (bu turda EKLENDİ) — yeni stadyum ambiyansı loop'unu da durdurur. */
  it('stadyum ambiyansını da durdurur', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0;
    manager.stopAll();

    const stadiumPath = getAssetById('STADIUM_AMBIENT_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'stop' && c.path === stadiumPath)).toBe(true);
  });
});

/**
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §18 (bu turda EKLENDİ) —
 * `RaceSurface` (`@at-sevdalisi/shared-types`) ZATEN VAR OLAN, gerçek bir
 * domain alanına (races.surface) göre nal sesi asset'i SEÇİMİ.
 */
describe('RaceAudioManager — yüzeye göre nal sesi (brief §18)', () => {
  it('surface verilmezse jenerik HOOFBEAT_SFX_REQUIRED çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });

    const genericPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === genericPath && c.options?.loop === true)).toBe(true);
  });

  it('surface "grass" iken HOOF_GRASS_SFX_REQUIRED çalar, jenerik HOOFBEAT_SFX_REQUIRED ÇALINMAZ', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start', surface: 'grass' });

    const grassPath = getAssetById('HOOF_GRASS_SFX_REQUIRED')!.expectedPath;
    const genericPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === grassPath && c.options?.loop === true)).toBe(true);
    expect(calls.some((c) => c.method === 'play' && c.path === genericPath)).toBe(false);
  });

  it('surface "dirt" iken HOOF_DIRT_SFX_REQUIRED çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start', surface: 'dirt' });

    const dirtPath = getAssetById('HOOF_DIRT_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === dirtPath && c.options?.loop === true)).toBe(true);
  });

  it('surface "synthetic" iken HOOF_SYNTHETIC_SFX_REQUIRED çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start', surface: 'synthetic' });

    const syntheticPath = getAssetById('HOOF_SYNTHETIC_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === syntheticPath && c.options?.loop === true)).toBe(true);
  });

  it('surface "grass" ile başlatılan nal sesi finish\'te DOĞRU (grass) asset\'i durdurur', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start', surface: 'grass' });
    manager.handleEvent({ type: 'finish' });

    const grassPath = getAssetById('HOOF_GRASS_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'stop' && c.path === grassPath)).toBe(true);
  });

  it('surface "grass" ile başlatılan nal sesinin yoğunluğu DOĞRU (grass) asset üzerinde güncellenir', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start', surface: 'grass' });
    calls.length = 0;

    manager.updateHoofbeatIntensity(20, 20);
    const grassPath = getAssetById('HOOF_GRASS_SFX_REQUIRED')!.expectedPath;
    const lastVolumeCall = calls.filter((c) => c.method === 'setVolume' && c.path === grassPath).pop();
    expect(lastVolumeCall).toBeDefined();
    expect(lastVolumeCall!.volume!).toBeCloseTo(config.hoofbeat.baseVolume + config.hoofbeat.maxExtraVolume, 6);
  });
});

/** "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §19 (bu turda EKLENDİ). */
describe('RaceAudioManager — start_signal (brief §19)', () => {
  it('bir seferlik (döngüsüz) hazır-ol sinyali çalar, GATE_OPEN_SFX_REQUIRED ÇALINMAZ', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'start_signal' });

    const signalPath = getAssetById('START_SIGNAL_SFX_REQUIRED')!.expectedPath;
    const gatePath = getAssetById('GATE_OPEN_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === signalPath && !c.options?.loop)).toBe(true);
    expect(calls.some((c) => c.method === 'play' && c.path === gatePath)).toBe(false);
  });
});

/** "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §20 (bu turda EKLENDİ). */
describe('RaceAudioManager — kademeli kalabalık (brief §20)', () => {
  it('race_start ambience başlatır, stadyum ambiyansını da AYRICA başlatır', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });

    const ambiencePath = getAssetById('CROWD_AMBIENCE_SFX_REQUIRED')!.expectedPath;
    const stadiumPath = getAssetById('STADIUM_AMBIENT_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === ambiencePath && c.options?.loop === true)).toBe(true);
    expect(calls.some((c) => c.method === 'play' && c.path === stadiumPath && c.options?.loop === true)).toBe(true);
  });

  it('final_stretch ambience\'i durdurup excited döngüsünü başlatır (crossfade)', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0;
    manager.handleEvent({ type: 'final_stretch' });

    const ambiencePath = getAssetById('CROWD_AMBIENCE_SFX_REQUIRED')!.expectedPath;
    const excitedPath = getAssetById('CROWD_EXCITED_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === excitedPath && c.options?.loop === true)).toBe(true);
    expect(calls.some((c) => c.method === 'stop' && c.path === ambiencePath)).toBe(true);
  });

  it('final_stretch yarış hiç başlamadıysa (crowd çalmıyorsa) excited döngüsünü BAŞLATMAZ', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'final_stretch' });

    const excitedPath = getAssetById('CROWD_EXCITED_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === excitedPath)).toBe(false);
  });

  it('final_stretch İKİ KEZ çağrılırsa excited döngüsü tekrar play EDİLMEZ (guard)', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    manager.handleEvent({ type: 'final_stretch' });
    calls.length = 0;
    manager.handleEvent({ type: 'final_stretch' });

    const excitedPath = getAssetById('CROWD_EXCITED_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === excitedPath)).toBe(false);
  });

  it('winner, WINNER_CELEBRATION_SFX_REQUIRED ile BİRLİKTE CROWD_CHEERING_SFX_REQUIRED\'ı da çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'winner' });

    const cheeringPath = getAssetById('CROWD_CHEERING_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === cheeringPath)).toBe(true);
  });

  it('stopAll excited kalabalık döngüsünü de (DOĞRU asset\'i hedefleyerek) durdurur', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    manager.handleEvent({ type: 'final_stretch' });
    calls.length = 0;
    manager.stopAll();

    const excitedPath = getAssetById('CROWD_EXCITED_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'stop' && c.path === excitedPath)).toBe(true);
  });
});

/** "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §17 (bu turda EKLENDİ) — bağımsız at vokalizasyonu bir seferlikleri. */
describe('RaceAudioManager — at vokalizasyonları (brief §17)', () => {
  it('playHorseSnort horse kanalında bir seferlik ses çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.playHorseSnort();

    const snortPath = getAssetById('HORSE_SNORT_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === snortPath && !c.options?.loop)).toBe(true);
  });

  it('playHorseNeigh horse kanalında bir seferlik ses çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.playHorseNeigh();

    const neighPath = getAssetById('HORSE_NEIGH_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === neighPath && !c.options?.loop)).toBe(true);
  });

  it('playHorseMovement horse kanalında bir seferlik ses çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.playHorseMovement();

    const movementPath = getAssetById('HORSE_MOVEMENT_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'play' && c.path === movementPath && !c.options?.loop)).toBe(true);
  });

  it('hiçbir vokalizasyon metodu backend olmadan hata fırlatmaz', () => {
    const manager = new RaceAudioManager(config);
    expect(() => manager.playHorseSnort()).not.toThrow();
    expect(() => manager.playHorseNeigh()).not.toThrow();
    expect(() => manager.playHorseMovement()).not.toThrow();
  });
});

/**
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §21 (bu turda EKLENDİ) —
 * 7. kanal (`environment`): rüzgar VE stadyum ambiyansı bu kanalı paylaşır,
 * `crowd`/`sfx` kanallarından BAĞIMSIZ kısılabilmelidir.
 */
describe('RaceAudioManager — environment kanalı (brief §21)', () => {
  /**
   * `setChannelVolume` HER çağrıda `reapplyActiveLoopVolumes`'u çağırır —
   * bu, o an çalan TÜM döngülerin hacmini yeniden hesaplayıp backend'e
   * GÖNDERİR (ör. `master` kısıldığında AYRI bir kanala ait bir sesin de
   * etkilenmesi gereken yukarıdaki test bu ÇAĞIRAN deseni zaten doğrular).
   * Bu yüzden `environment` DIŞINDAKİ bir kanalın (`crowd`) setVolume
   * ÇAĞRILMAMASI DEĞİL, ÇAĞRILSA BİLE DEĞERİNİN DEĞİŞMEMİŞ olması doğru
   * doğrulamadır — `crowd`'ın hacim FORMÜLÜ `environment` kanalını
   * hiç KULLANMAZ (bkz. `resolveVolume('crowd', ...)`), bu yüzden
   * matematiksel SONUÇ aynı kalır.
   */
  it('environment kanalı kısıldığında rüzgar VE stadyum ambiyansı ANINDA etkilenir, kalabalığın hesaplanan hacmi DEĞİŞMEZ', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0;

    manager.setChannelVolume('environment', 0.5);

    const windPath = getAssetById('WIND_AMBIENCE_SFX_REQUIRED')!.expectedPath;
    const stadiumPath = getAssetById('STADIUM_AMBIENT_SFX_REQUIRED')!.expectedPath;
    const crowdPath = getAssetById('CROWD_AMBIENCE_SFX_REQUIRED')!.expectedPath;

    const windCall = calls.filter((c) => c.method === 'setVolume' && c.path === windPath).pop();
    const stadiumCall = calls.filter((c) => c.method === 'setVolume' && c.path === stadiumPath).pop();
    const crowdCall = calls.filter((c) => c.method === 'setVolume' && c.path === crowdPath).pop();
    expect(windCall).toBeDefined();
    expect(windCall!.volume!).toBeCloseTo(config.windAmbienceVolume * 0.5 * config.volumeChannels.master, 6);
    expect(stadiumCall).toBeDefined();
    expect(stadiumCall!.volume!).toBeCloseTo(config.stadiumAmbientVolume * 0.5 * config.volumeChannels.master, 6);
    if (crowdCall) {
      expect(crowdCall.volume!).toBeCloseTo(config.crowdAmbienceVolume * config.volumeChannels.crowd * config.volumeChannels.master, 6);
    }
  });

  it('getChannelVolume varsayılan olarak config.volumeChannels.environment değerini yansıtır', () => {
    const manager = new RaceAudioManager(config);
    expect(manager.getChannelVolume('environment')).toBe(config.volumeChannels.environment);
  });
});
