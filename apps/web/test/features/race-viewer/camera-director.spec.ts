import { describe, expect, it } from 'vitest';
import {
  classifyRaceCameraEvent,
  selectAutomaticCameraMode,
  type CameraDirectorInput,
} from '../../../src/features/race-viewer/camera-director';
import cameraConfigJson from '../../../../../config/camera.config.json';
import type { CameraConfig } from '@at-sevdalisi/game-config';

/**
 * Faz 6 "Config ayrımı" (bu turda EKLENDİ) — `apps/api`'nin
 * `genetics.spec.ts`/`pedigree.spec.ts` gibi testlerinin AYNI deseni:
 * gerçek `config/*.config.json` dosyası DOĞRUDAN içeri aktarılır, testler
 * KENDİ uydurma sabitlerini DEĞİL bu config'in alanlarını referans alır —
 * böylece config değerleri değişirse testler otomatik olarak GEÇERLİ
 * kalır (kırılgan çift-sabit senkronizasyonu YOKTUR).
 */
const config = cameraConfigJson as unknown as CameraConfig;

function makeInput(overrides: Partial<CameraDirectorInput>): CameraDirectorInput {
  return {
    leaderPositionMeters: 800,
    raceDistanceMeters: 1600,
    anyHorseBlocked: false,
    isFinished: false,
    ...overrides,
  };
}

describe('classifyRaceCameraEvent', () => {
  it('yarış bittiyse (diğer her şeyden ÖNCELİKLİ) finish döner', () => {
    const event = classifyRaceCameraEvent(makeInput({ isFinished: true, leaderPositionMeters: 10 }), config);
    expect(event).toBe('finish');
  });

  it('lider start eşiğinin (startPhaseMeters) altındaysa start döner', () => {
    const event = classifyRaceCameraEvent(makeInput({ leaderPositionMeters: config.startPhaseMeters - 1 }), config);
    expect(event).toBe('start');
  });

  it('start eşiğinin tam üzerinde artık start DEĞİLDİR', () => {
    const event = classifyRaceCameraEvent(
      makeInput({ leaderPositionMeters: config.startPhaseMeters + 1, raceDistanceMeters: 10000 }),
      config,
    );
    expect(event).not.toBe('start');
  });

  it('kalan mesafe finalStretchRemainingMeters eşiğinin altındaysa final_stretch döner', () => {
    const event = classifyRaceCameraEvent(
      makeInput({ leaderPositionMeters: 1600 - (config.finalStretchRemainingMeters - 1), raceDistanceMeters: 1600 }),
      config,
    );
    expect(event).toBe('final_stretch');
  });

  it('final düzlüğü DIŞINDA bir at bloklandıysa overtake döner', () => {
    const event = classifyRaceCameraEvent(
      makeInput({ anyHorseBlocked: true, leaderPositionMeters: 800, raceDistanceMeters: 1600 }),
      config,
    );
    expect(event).toBe('overtake');
  });

  it('hiçbir özel koşul yoksa normal döner', () => {
    const event = classifyRaceCameraEvent(makeInput({}), config);
    expect(event).toBe('normal');
  });

  it('aynı girdi her zaman aynı sonucu döner (determinizm)', () => {
    const input = makeInput({ leaderPositionMeters: 300 });
    expect(classifyRaceCameraEvent(input, config)).toBe(classifyRaceCameraEvent(input, config));
  });
});

describe('selectAutomaticCameraMode', () => {
  it('start event\'i track kamerasına eşlenir', () => {
    expect(selectAutomaticCameraMode(makeInput({ leaderPositionMeters: 0 }), config)).toBe('track');
  });

  it('final_stretch event\'i final_straight kamerasına eşlenir', () => {
    expect(selectAutomaticCameraMode(makeInput({ leaderPositionMeters: 1590, raceDistanceMeters: 1600 }), config)).toBe(
      'final_straight',
    );
  });

  it('finish event\'i photo_finish kamerasına eşlenir', () => {
    expect(selectAutomaticCameraMode(makeInput({ isFinished: true }), config)).toBe('photo_finish');
  });

  it('overtake event\'i jokey kamerasına eşlenir', () => {
    expect(selectAutomaticCameraMode(makeInput({ anyHorseBlocked: true }), config)).toBe('jockey');
  });
});
