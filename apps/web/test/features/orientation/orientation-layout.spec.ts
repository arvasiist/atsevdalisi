import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../../src/features/pwa/pwa';

/**
 * 10.10.2026 — telefon YATAY oynanır (sahibinin isteği). Düzen CSS'tedir;
 * bu dosya onu kilitler: dikey telefonda katman, yatay telefonda ince üst
 * bar + soldaki dikey menü + ekranı tam dolduran sahneler.
 */
const css = readFileSync(resolve(__dirname, '../../../src/app/globals.css'), 'utf8');
const layout = readFileSync(resolve(__dirname, '../../../src/app/layout.tsx'), 'utf8');

const PORTRAIT_PHONE = '@media (orientation: portrait) and (hover: none) and (pointer: coarse) and (max-width: 600px)';
const LANDSCAPE_PHONE = '@media (orientation: landscape) and (max-height: 500px)';
const LANDSCAPE_PHONE_RAIL = '@media (orientation: landscape) and (max-height: 500px) and (max-width: 1279px)';

/** Bir medya sorgusunun gövdesi (iç içe süslü parantezleri sayarak). */
function mediaBlock(query: string): string {
  const start = css.indexOf(`${query} {`);
  expect(start, `${query} bulunamadı`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(start, i + 1);
  }
  throw new Error('kapanmayan blok');
}

describe('telefon yatay düzeni', () => {
  it('dikey telefonda "yan çevir" katmanı görünür; varsayılan gizli; katman her sayfada', () => {
    expect(css).toMatch(/\.rotate-prompt\s*\{\s*display:\s*none;/);
    const portrait = mediaBlock(PORTRAIT_PHONE);
    expect(portrait).toMatch(/\.rotate-prompt\s*\{[^}]*display:\s*flex/);
    expect(portrait).toMatch(/position:\s*fixed/);
    expect(layout).toContain('<RotateDevicePrompt />');
  });

  it('yatay telefonda alt sekme çubuğu soldaki dikey menüye döner ve alt boşluk sıfırlanır', () => {
    const rail = mediaBlock(LANDSCAPE_PHONE_RAIL);
    expect(rail).toMatch(/--bottom-nav-height:\s*0px/);
    expect(rail).toMatch(/\.bottom-nav\s*\{[^}]*grid-template-rows/);
    expect(rail).toMatch(/margin-left:\s*calc\(var\(--side-nav-width\)/);
  });

  it('yatay telefonda üst bar incelir ve sahnelerin 420/480 px alt sınırı kalkar', () => {
    const landscape = mediaBlock(LANDSCAPE_PHONE);
    expect(landscape).toMatch(/--topbar-height:\s*48px/);
    expect(landscape).toMatch(/\.viewer-page,\s*\.race-viewer-root\s*\{\s*min-height:\s*0/);
    expect(landscape).toMatch(/\.stable3d-full\s*\{\s*min-height:\s*0/);
    expect(landscape).toMatch(/\.home3d\s*\{[^}]*100dvh/);
  });

  it('tam ekran sahneler duyuru şeridinin yüksekliğini de düşer (sayfa kaymasın)', () => {
    for (const selector of ['.viewer-page', '.stable3d-full']) {
      const rule = new RegExp(`\\${selector}\\s*\\{\\s*height:\\s*calc\\(([^;]*)\\)`).exec(css);
      expect(rule?.[1], selector).toContain('var(--announcement-height)');
    }
  });

  it('kurulu uygulama (PWA) yatay açılır', () => {
    expect(buildManifest().orientation).toBe('landscape');
  });
});
