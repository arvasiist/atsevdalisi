import { describe, expect, it } from 'vitest';
import {
  buildPhotoFinishRows,
  formatFinishGap,
  getFinishSlowMotionFactor,
  isCloseFinish,
  type PhotoFinishSourceEntry,
} from '../../../src/features/race-viewer/photo-finish';
import cameraConfigJson from '../../../../../config/camera.config.json';
import type { CameraConfig } from '@at-sevdalisi/game-config';

/** Faz 6 "Config ayrımı" — bkz. `camera-director.spec.ts`'in AYNI desen açıklaması. */
const config = cameraConfigJson as unknown as CameraConfig;

function makeEntry(overrides: Partial<PhotoFinishSourceEntry>): PhotoFinishSourceEntry {
  return {
    horseId: 'h1',
    displayName: 'Yıldırım',
    finishPosition: 1,
    finishTimeMs: 94820,
    performanceScore: 90,
    ...overrides,
  };
}

describe('buildPhotoFinishRows', () => {
  it('boş dizi için boş dizi döner', () => {
    expect(buildPhotoFinishRows([])).toEqual([]);
  });

  it('finishPosition sırasına göre sıralar (giriş sırası önemli değil)', () => {
    const entries = [
      makeEntry({ horseId: 'h2', finishPosition: 2, finishTimeMs: 95100 }),
      makeEntry({ horseId: 'h1', finishPosition: 1, finishTimeMs: 94820 }),
    ];
    const rows = buildPhotoFinishRows(entries);
    expect(rows[0]!.horseId).toBe('h1');
    expect(rows[1]!.horseId).toBe('h2');
  });

  it('kazananın gapToWinnerMs değeri 0dır ve isWinner true olur', () => {
    const rows = buildPhotoFinishRows([makeEntry({ finishPosition: 1, finishTimeMs: 94820 })]);
    expect(rows[0]!.gapToWinnerMs).toBe(0);
    expect(rows[0]!.isWinner).toBe(true);
  });

  it('diğer katılımcıların farkı kazanana göre doğru hesaplanır', () => {
    const rows = buildPhotoFinishRows([
      makeEntry({ horseId: 'h1', finishPosition: 1, finishTimeMs: 94820 }),
      makeEntry({ horseId: 'h2', finishPosition: 2, finishTimeMs: 95100 }),
      makeEntry({ horseId: 'h3', finishPosition: 3, finishTimeMs: 96500 }),
    ]);
    expect(rows[1]!.gapToWinnerMs).toBe(280);
    expect(rows[1]!.isWinner).toBe(false);
    expect(rows[2]!.gapToWinnerMs).toBe(1680);
  });
});

describe('isCloseFinish', () => {
  it('tek katılımcı varsa false döner (foto finiş anlamsız)', () => {
    const rows = buildPhotoFinishRows([makeEntry({ finishPosition: 1, finishTimeMs: 94820 })]);
    expect(isCloseFinish(rows, config)).toBe(false);
  });

  it('1. ile 2. arasındaki fark eşiğin altındaysa true döner', () => {
    const rows = buildPhotoFinishRows([
      makeEntry({ horseId: 'h1', finishPosition: 1, finishTimeMs: 94820 }),
      makeEntry({ horseId: 'h2', finishPosition: 2, finishTimeMs: 94820 + config.photoFinish.closeFinishThresholdMs - 1 }),
    ]);
    expect(isCloseFinish(rows, config)).toBe(true);
  });

  it('1. ile 2. arasındaki fark eşiğin tam üzerindeyse false döner', () => {
    const rows = buildPhotoFinishRows([
      makeEntry({ horseId: 'h1', finishPosition: 1, finishTimeMs: 94820 }),
      makeEntry({ horseId: 'h2', finishPosition: 2, finishTimeMs: 94820 + config.photoFinish.closeFinishThresholdMs + 1 }),
    ]);
    expect(isCloseFinish(rows, config)).toBe(false);
  });
});

describe('formatFinishGap', () => {
  it('0 veya negatif için "Kazanan" döner', () => {
    expect(formatFinishGap(0)).toBe('Kazanan');
    expect(formatFinishGap(-5)).toBe('Kazanan');
  });

  it('pozitif fark için virgüllü saniye formatı döner', () => {
    expect(formatFinishGap(280)).toBe('+0,28 sn');
    expect(formatFinishGap(1680)).toBe('+1,68 sn');
  });
});

describe('getFinishSlowMotionFactor', () => {
  it('durationMs sıfır veya negatifse her zaman 1 döner', () => {
    expect(getFinishSlowMotionFactor(0, 0, config)).toBe(1);
    expect(getFinishSlowMotionFactor(100, -1, config)).toBe(1);
  });

  it('bitişe slowMotionWindowMsden daha uzakken 1 (normal hız) döner', () => {
    const durationMs = 100000;
    expect(getFinishSlowMotionFactor(durationMs - config.photoFinish.slowMotionWindowMs - 1, durationMs, config)).toBe(1);
  });

  it('pencere başında (tam slowMotionWindowMs kala) 1e çok yakın olur', () => {
    const durationMs = 100000;
    const factor = getFinishSlowMotionFactor(durationMs - config.photoFinish.slowMotionWindowMs, durationMs, config);
    expect(factor).toBeCloseTo(1, 6);
  });

  it('pencere ortasında hız doğrusal olarak azalır', () => {
    const durationMs = 100000;
    const factor = getFinishSlowMotionFactor(durationMs - config.photoFinish.slowMotionWindowMs / 2, durationMs, config);
    const expected = 1 - 0.5 * (1 - config.photoFinish.slowMotionMinFactor);
    expect(factor).toBeCloseTo(expected, 6);
  });

  it('tam bitiş anında ve sonrasında minimum çarpanda sabit kalır (ani sıçrama yok)', () => {
    const durationMs = 100000;
    expect(getFinishSlowMotionFactor(durationMs, durationMs, config)).toBe(config.photoFinish.slowMotionMinFactor);
    expect(getFinishSlowMotionFactor(durationMs + 5000, durationMs, config)).toBe(config.photoFinish.slowMotionMinFactor);
  });
});
