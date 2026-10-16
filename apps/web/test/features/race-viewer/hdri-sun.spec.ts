import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FloatType } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { loadLightingConfig } from '@at-sevdalisi/game-config';
import { getAssetById } from '../../../src/features/race-viewer/assets/asset-manifest';
import { MOBILE_BUDGET_BYTES } from '../../../src/features/race-viewer/assets/asset-inspect';

/**
 * 14.10.2026 — gökyüzü HDRI'si Blender'da üretilir (`tools/blender/build_hdri.py`).
 * Gölgeyi atan güneş ışığı ile gökyüzündeki güneş AYNI yönde olmalı; ikisi de
 * `lighting.config.json` → `sun.position`tan gelir. Biri değişip HDRI yeniden
 * üretilmezse gölgeler gökyüzüyle çelişir — bu test onu yakalar.
 */
const HDRI = getAssetById('HDRI_SKY_REQUIRED')!;
const HDRI_PATH = resolve(__dirname, '../../../public', HDRI.expectedPath);
/** Güneş diski ~0.55°, piksel ~0.18°; kalibrasyon payı ile. */
const MAX_SUN_ERROR_DEGREES = 1.5;

function decode(): { width: number; height: number; data: Float32Array } {
  const bytes = readFileSync(HDRI_PATH);
  const loader = new RGBELoader().setDataType(FloatType);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = loader.parse(buffer as ArrayBuffer);
  return { width: parsed.width, height: parsed.height, data: parsed.data as Float32Array };
}

describe('Blender gökyüzü HDRI', () => {
  it('mobil indirme bütçesinde ve 2:1 eşdikdörtgen', () => {
    expect(statSync(HDRI_PATH).size).toBeLessThanOrEqual(MOBILE_BUDGET_BYTES.environment_map!);
    const { width, height } = decode();
    expect(width).toBe(height * 2);
  });

  it('gökyüzündeki güneş, gölgeyi atan güneş ışığıyla aynı yönde', () => {
    const { width, height, data } = decode();
    let best = -1;
    let bestIndex = 0;
    for (let i = 0; i < width * height; i += 1) {
      const luminance = 0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!;
      if (luminance > best) {
        best = luminance;
        bestIndex = i;
      }
    }
    const row = Math.floor(bestIndex / width);
    const column = bestIndex % width;
    // three.js eşdikdörtgen kuralı (equirectUv): u = atan2(z, x)/2π + 0.5, v = asin(y)/π + 0.5;
    // RGBELoader satır 0'ı görüntünün üstüne koyar (flipY).
    const u = (column + 0.5) / width;
    const v = 1 - (row + 0.5) / height;
    const azimuth = (u - 0.5) * 2 * Math.PI;
    const elevation = (v - 0.5) * Math.PI;
    const fromSky = [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)];
    const [x, y, z] = loadLightingConfig().sun.position;
    const length = Math.hypot(x, y, z);
    const fromConfig = [x / length, y / length, z / length];
    const cosine = fromSky.reduce((sum, value, index) => sum + value * fromConfig[index]!, 0);
    const errorDegrees = (Math.acos(Math.min(1, cosine)) * 180) / Math.PI;
    expect(errorDegrees).toBeLessThan(MAX_SUN_ERROR_DEGREES);
  });
});
