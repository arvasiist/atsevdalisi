import { describe, expect, it } from 'vitest';
import { buildManifest, parsePwaIconSize, PWA_ICON_SIZES } from '../../../src/features/pwa/pwa';

/** PWA (02.10.2026) — kurulabilirlik şartları: ad, başlangıç, standalone, 192 + 512 ikon. */
describe('PWA manifesti', () => {
  it('kurulabilirlik alanları dolu; ikonlar 192 ve 512, any + maskable', () => {
    const manifest = buildManifest();
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    const sizes = new Set(manifest.icons?.map((icon) => icon.sizes));
    expect(sizes).toEqual(new Set(['192x192', '512x512']));
    for (const size of PWA_ICON_SIZES) {
      const purposes = manifest.icons?.filter((icon) => icon.sizes === `${size}x${size}`).map((icon) => icon.purpose);
      expect(purposes?.sort()).toEqual(['any', 'maskable']);
    }
    // İkon yolları üretici rotaya gider — `public/` altında dosya YOK.
    expect(manifest.icons?.every((icon) => icon.src.startsWith('/pwa-icon/'))).toBe(true);
  });

  it('ikon rotası yalnızca tanımlı ölçüleri kabul eder', () => {
    expect(parsePwaIconSize('192')).toBe(192);
    expect(parsePwaIconSize('512')).toBe(512);
    expect(parsePwaIconSize('100')).toBeNull();
    expect(parsePwaIconSize('../etc')).toBeNull();
  });
});
