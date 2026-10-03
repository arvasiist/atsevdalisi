import { describe, expect, it } from 'vitest';
import { loadAudioConfig } from '@at-sevdalisi/game-config';
import {
  RaceAudioManager,
  type AudioBackend,
} from '../../../src/features/race-viewer/audio-vfx/audio-manager';
import {
  deriveRaceAudioCues,
  type RaceAudioFrame,
} from '../../../src/features/race-viewer/audio-vfx/race-audio-cues';
import { createProbedAudioBackend } from '../../../src/features/race-viewer/audio-vfx/probed-audio-backend';

const config = loadAudioConfig();
const frame = (over: Partial<RaceAudioFrame>): RaceAudioFrame => ({
  timeMs: 0,
  started: false,
  leaderHorseId: 'a',
  inFinalStretch: false,
  isFinished: false,
  ...over,
});
const cooldown = { overtakeCooldownMs: config.overtakeCooldownMs };

function recordingBackend(): AudioBackend & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    play: (path, options) => calls.push(`play ${path} ${options?.volume ?? ''}`),
    stop: (path) => calls.push(`stop ${path}`),
    setVolume: (path, volume) => calls.push(`vol ${path} ${volume}`),
  };
}

describe('yarış ses işaretleri (01.10.2026, 3D adım 9)', () => {
  it('kapılar açılınca başlangıç üçlüsü; bitişte bitiş + kazanan', () => {
    const start = deriveRaceAudioCues(
      frame({}),
      frame({ timeMs: 100, started: true }),
      null,
      cooldown,
    );
    expect(start.events).toEqual(['race_start', 'gate_open', 'start_signal']);
    const end = deriveRaceAudioCues(
      frame({ timeMs: 9000, started: true }),
      frame({ timeMs: 9100, started: true, isFinished: true }),
      null,
      cooldown,
    );
    expect(end.events).toEqual(['finish', 'winner']);
  });

  it('ses yarış ortasında açılırsa geçmiş kapı/işaret sesleri ÇALINMAZ', () => {
    const resumed = deriveRaceAudioCues(
      null,
      frame({ timeMs: 5000, started: true }),
      null,
      cooldown,
    );
    expect(resumed.events).toEqual(['race_start']);
    expect(
      deriveRaceAudioCues(null, frame({ started: true, isFinished: true }), null, cooldown).events,
    ).toEqual([]);
  });

  it('lider değişimi config aralığından sık çalmaz', () => {
    const prev = frame({ timeMs: 1000, started: true, leaderHorseId: 'a' });
    const first = deriveRaceAudioCues(
      prev,
      { ...prev, timeMs: 1200, leaderHorseId: 'b' },
      null,
      cooldown,
    );
    expect(first.events).toEqual(['overtake']);
    const tooSoon = deriveRaceAudioCues(
      { ...prev, timeMs: 1200, leaderHorseId: 'b' },
      { ...prev, timeMs: 1200 + config.overtakeCooldownMs - 1, leaderHorseId: 'a' },
      first.lastOvertakeAtMs,
      cooldown,
    );
    expect(tooSoon.events).toEqual([]);
  });

  it('geri sarma döngüleri sıfırlar; final düzlüğü bir kez', () => {
    const running = frame({ timeMs: 3000, started: true });
    expect(deriveRaceAudioCues(running, frame({}), null, cooldown).reset).toBe(true);
    expect(
      deriveRaceAudioCues(
        running,
        { ...running, timeMs: 3100, inFinalStretch: true },
        null,
        cooldown,
      ).events,
    ).toEqual(['final_stretch']);
  });

  it('kalabalık hacmi heyecanla ölçeklenir (config min çarpanı)', () => {
    const backend = recordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.setCrowdExcitement(0);
    manager.handleEvent({ type: 'race_start' });
    const crowdPlay = backend.calls.find((call) => call.includes('crowd-ambience'));
    const expected = config.crowdAmbienceVolume * config.crowdExcitementMinFactor;
    expect(Number(crowdPlay?.split(' ')[2])).toBeCloseTo(expected, 6);
    manager.setCrowdExcitement(1);
    expect(Number(backend.calls.at(-1)?.split(' ')[2])).toBeCloseTo(config.crowdAmbienceVolume, 6);
  });

  it('ahır ortam sesi config hacmiyle çalar, stopAll ile susar', () => {
    const backend = recordingBackend();
    const manager = new RaceAudioManager(config, backend);
    manager.startStableAmbience();
    expect(backend.calls[0]).toBe(
      `play audio/stable-ambience-loop.mp3 ${config.stableAmbienceVolume}`,
    );
    manager.stopAll();
    expect(backend.calls).toContain('stop audio/stable-ambience-loop.mp3');
  });

  it('dosya yoksa HİÇBİR şey çalınmaz; varsa mutlak URL ile çalınır', async () => {
    const inner = recordingBackend();
    const missing = createProbedAudioBackend(inner, () => Promise.resolve(false));
    missing.play('audio/x.mp3', { volume: 0.5 });
    await Promise.resolve();
    expect(inner.calls).toEqual([]);

    const present = createProbedAudioBackend(inner, () => Promise.resolve(true));
    present.play('audio/y.mp3', { loop: true, volume: 0.5 });
    present.setVolume('audio/y.mp3', 0.2); // yoklama sürerken gelen hacim kazanır
    await Promise.resolve();
    await Promise.resolve();
    expect(inner.calls).toContain('play /audio/y.mp3 0.2');
  });

  it('yoklama sürerken durdurulan ses çalmaz', async () => {
    const inner = recordingBackend();
    const backend = createProbedAudioBackend(inner, () => Promise.resolve(true));
    backend.play('audio/z.mp3', { loop: true });
    backend.stop('audio/z.mp3');
    await Promise.resolve();
    await Promise.resolve();
    expect(inner.calls.filter((call) => call.startsWith('play'))).toEqual([]);
  });
});
