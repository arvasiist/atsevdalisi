import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLightingConfig } from '@at-sevdalisi/game-config';
import { getQualityTierRenderSettings } from '../../../src/features/race-viewer/quality-tier';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? sourceFiles(full)
      : /\.(tsx?|jsx?)$/.test(name)
        ? [full]
        : [];
  });
}

describe('ışık (01.10.2026, 3D adım 7)', () => {
  it('yumuşak gölge (PCSS) yalnızca ultra kademede', () => {
    expect(getQualityTierRenderSettings('low').softShadowsEnabled).toBe(false);
    expect(getQualityTierRenderSettings('medium').softShadowsEnabled).toBe(false);
    expect(getQualityTierRenderSettings('high').softShadowsEnabled).toBe(false);
    expect(getQualityTierRenderSettings('ultra').softShadowsEnabled).toBe(true);
  });

  it('bloom ölçülü: yalnızca parlak yüzeyler (yüksek eşik, düşük yoğunluk)', () => {
    const { bloom, toneMappingExposure } = loadLightingConfig();
    expect(bloom.luminanceThreshold).toBeGreaterThanOrEqual(0.7);
    expect(bloom.intensity).toBeLessThanOrEqual(0.5);
    expect(toneMappingExposure).toBeGreaterThan(0);
  });

  it("hiçbir 3D bileşen ortam haritasını CDN'den (drei preset) istemez — CLAUDE.md (13)", () => {
    const root = join(__dirname, '../../../src/features');
    const offenders = sourceFiles(root).filter((file) =>
      /<Environment[^>]*\bpreset\s*=/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
    const hdri = readFileSync(join(root, 'race-viewer/assets/HdriEnvironment.tsx'), 'utf8');
    expect(hdri).toMatch(/GltfErrorBoundary/); // yükleme düşerse sahne çökmez
  });
});
