import { describe, expect, it } from 'vitest';
import {
  RaceAudioManager,
  SILENT_AUDIO_BACKEND,
  type AudioBackend,
  type AudioPlayOptions,
} from '../../../src/features/race-viewer/audio-vfx/audio-manager';
import { getAssetById } from '../../../src/features/race-viewer/assets/asset-manifest';

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
    const manager = new RaceAudioManager();
    expect(() => manager.handleEvent({ type: 'race_start' })).not.toThrow();
    expect(() => manager.handleEvent({ type: 'final_stretch' })).not.toThrow();
    expect(() => manager.handleEvent({ type: 'finish' })).not.toThrow();
  });
});

describe('RaceAudioManager — race_start', () => {
  it('yarış müziğini döngülü çalar ve nal seslerini başlatır', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(backend);
    manager.handleEvent({ type: 'race_start' });

    const musicPath = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED')!.expectedPath;
    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;

    expect(calls.some((c) => c.method === 'play' && c.path === musicPath && c.options?.loop === true)).toBe(true);
    expect(calls.some((c) => c.method === 'play' && c.path === hoofbeatPath && c.options?.loop === true)).toBe(true);
  });

  it('nal sesleri zaten çalıyorsa race_start tekrar çağrıldığında İKİNCİ KEZ play çağrılmaz', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(backend);
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
    const manager = new RaceAudioManager(backend);
    manager.handleEvent({ type: 'race_start' });
    manager.handleEvent({ type: 'final_stretch' });

    const musicPath = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED')!.expectedPath;
    const volumeCalls = calls.filter((c) => c.method === 'setVolume' && c.path === musicPath);
    expect(volumeCalls.length).toBeGreaterThan(0);
    expect(volumeCalls[volumeCalls.length - 1]!.volume!).toBeLessThan(0.4);
  });
});

describe('RaceAudioManager — finish', () => {
  it('nal seslerini durdurur, müziği durdurur, fanfar çalar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(backend);
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
    const manager = new RaceAudioManager(backend);
    manager.handleEvent({ type: 'finish' });

    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'stop' && c.path === hoofbeatPath)).toBe(false);
  });
});

describe('RaceAudioManager.updateHoofbeatIntensity', () => {
  it('nal sesleri çalmıyorsa hiçbir şey yapmaz', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(backend);
    manager.updateHoofbeatIntensity(10, 20);
    expect(calls.length).toBe(0);
  });

  it('hız oranına göre hacmi [taban, taban+ek] aralığında ayarlar', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0; // race_start'ın kendi play çağrılarını temizle, sadece updateHoofbeatIntensity'i test et.

    manager.updateHoofbeatIntensity(20, 20); // tam hız → maksimum hacim
    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    const lastVolumeCall = calls.filter((c) => c.method === 'setVolume' && c.path === hoofbeatPath).pop();
    expect(lastVolumeCall).toBeDefined();
    expect(lastVolumeCall!.volume!).toBeCloseTo(0.7, 6);
  });

  it('maxSpeedMps sıfırsa bölme hatası oluşturmaz (güvenli varsayılan)', () => {
    const { backend } = createRecordingBackend();
    const manager = new RaceAudioManager(backend);
    manager.handleEvent({ type: 'race_start' });
    expect(() => manager.updateHoofbeatIntensity(5, 0)).not.toThrow();
  });
});

describe('RaceAudioManager.stopAll', () => {
  it('nal sesini ve müziği durdurur', () => {
    const { backend, calls } = createRecordingBackend();
    const manager = new RaceAudioManager(backend);
    manager.handleEvent({ type: 'race_start' });
    calls.length = 0;
    manager.stopAll();

    const hoofbeatPath = getAssetById('HOOFBEAT_SFX_REQUIRED')!.expectedPath;
    const musicPath = getAssetById('RACE_BACKGROUND_MUSIC_REQUIRED')!.expectedPath;
    expect(calls.some((c) => c.method === 'stop' && c.path === hoofbeatPath)).toBe(true);
    expect(calls.some((c) => c.method === 'stop' && c.path === musicPath)).toBe(true);
  });
});
