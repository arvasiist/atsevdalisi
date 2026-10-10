import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPerformanceConfig } from '@at-sevdalisi/game-config';

/**
 * 10.10.2026 (görsel B3) — duran atlı sahnelerde temas gölgesi her karede
 * BÜTÜN sahneyi yeniden çiziyordu (ana sayfada kare başına ~570 bin üçgen ek).
 * Vitrin ve ahır gölgeyi sınırlı kare çizer; at değişince `key` ile yenilenir.
 */
const SOURCES = [
  'src/features/home-scene/HomeScene3D.tsx',
  'src/features/stable-scene/StableScene3D.tsx',
];

describe('statik temas gölgesi', () => {
  it('config: küçük pozitif tam sayı', () => {
    const frames = loadPerformanceConfig().staticContactShadowFrames;
    expect(Number.isInteger(frames)).toBe(true);
    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThanOrEqual(10);
  });

  it.each(SOURCES)('%s: ContactShadows kare sınırlı ve ata göre anahtarlı', (path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    const blocks = source.split('<ContactShadows').slice(1).map((rest) => rest.slice(0, rest.indexOf('/>')));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).toContain('frames={PERFORMANCE.staticContactShadowFrames}');
      expect(block).toMatch(/key=\{/);
    }
  });
});
