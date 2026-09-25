import { describe, expect, it } from 'vitest';
import {
  FINAL_STRETCH_REMAINING_METERS,
  START_PHASE_METERS,
  classifyRaceCameraEvent,
  selectAutomaticCameraMode,
  type CameraDirectorInput,
} from '../../../src/features/race-viewer/camera-director';

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
    const event = classifyRaceCameraEvent(makeInput({ isFinished: true, leaderPositionMeters: 10 }));
    expect(event).toBe('finish');
  });

  it('lider start eşiğinin (STARTPHASEMETERS) altındaysa start döner', () => {
    const event = classifyRaceCameraEvent(makeInput({ leaderPositionMeters: START_PHASE_METERS - 1 }));
    expect(event).toBe('start');
  });

  it('start eşiğinin tam üzerinde artık start DEĞİLDİR', () => {
    const event = classifyRaceCameraEvent(makeInput({ leaderPositionMeters: START_PHASE_METERS + 1, raceDistanceMeters: 10000 }));
    expect(event).not.toBe('start');
  });

  it('kalan mesafe FINAL_STRETCH_REMAINING_METERS eşiğinin altındaysa final_stretch döner', () => {
    const event = classifyRaceCameraEvent(
      makeInput({ leaderPositionMeters: 1600 - (FINAL_STRETCH_REMAINING_METERS - 1), raceDistanceMeters: 1600 }),
    );
    expect(event).toBe('final_stretch');
  });

  it('final düzlüğü DIŞINDA bir at bloklandıysa overtake döner', () => {
    const event = classifyRaceCameraEvent(makeInput({ anyHorseBlocked: true, leaderPositionMeters: 800, raceDistanceMeters: 1600 }));
    expect(event).toBe('overtake');
  });

  it('hiçbir özel koşul yoksa normal döner', () => {
    const event = classifyRaceCameraEvent(makeInput({}));
    expect(event).toBe('normal');
  });

  it('aynı girdi her zaman aynı sonucu döner (determinizm)', () => {
    const input = makeInput({ leaderPositionMeters: 300 });
    expect(classifyRaceCameraEvent(input)).toBe(classifyRaceCameraEvent(input));
  });
});

describe('selectAutomaticCameraMode', () => {
  it('start event\'i track kamerasına eşlenir', () => {
    expect(selectAutomaticCameraMode(makeInput({ leaderPositionMeters: 0 }))).toBe('track');
  });

  it('final_stretch event\'i final_straight kamerasına eşlenir', () => {
    expect(selectAutomaticCameraMode(makeInput({ leaderPositionMeters: 1590, raceDistanceMeters: 1600 }))).toBe('final_straight');
  });

  it('finish event\'i photo_finish kamerasına eşlenir', () => {
    expect(selectAutomaticCameraMode(makeInput({ isFinished: true }))).toBe('photo_finish');
  });

  it('overtake event\'i jokey kamerasına eşlenir', () => {
    expect(selectAutomaticCameraMode(makeInput({ anyHorseBlocked: true }))).toBe('jockey');
  });
});
