import { describe, expect, it } from 'vitest';
import { NAV_LINKS } from '../../../src/components/layout/nav-links';
import {
  STABLE_ACTIONS,
  parseStableActionParam,
  stableActionHref,
} from '../../../src/features/stable-actions/stable-actions';

/**
 * 08.10.2026 — bakım ve ekipman ahırın içine taşındı (sahibinin isteği):
 * menüde ayrı sayfa olarak YOKLAR, eski adresler `/stable?panel=…`a yönlenir.
 */
describe('ahır içi işlemler', () => {
  it('bakım ve ekipman ahır işlemidir; ayrı sayfa değildir', () => {
    expect(STABLE_ACTIONS.map((action) => action.key)).toEqual(['care', 'equipment', 'upgrade']);
    const hrefs = NAV_LINKS.map((link) => link.href);
    // 16.10.2026 (brief §3.2): "Bakım" üst menüde — ama `/care` ayrı sayfa
    // DEĞİL, ahırın bakım paneline yönlenir (`top-bar-nav.spec.ts` kilitler).
    expect(hrefs).toContain('/care');
    expect(hrefs).not.toContain('/equipment');
    expect(hrefs).toContain('/stable');
  });

  it('sorgu dizesi doğrulanır; bilinmeyen değer panel açmaz', () => {
    expect(parseStableActionParam('care')).toBe('care');
    expect(parseStableActionParam('equipment')).toBe('equipment');
    expect(parseStableActionParam('upgrade')).toBe('upgrade');
    expect(parseStableActionParam('admin')).toBeNull();
    expect(parseStableActionParam('')).toBeNull();
    expect(parseStableActionParam(null)).toBeNull();
    expect(parseStableActionParam(undefined)).toBeNull();
  });

  it('eski adresin yönlendiği ahır adresi geri ayrıştırılır', () => {
    for (const { key } of STABLE_ACTIONS) {
      const url = new URL(stableActionHref(key), 'http://localhost');
      expect(url.pathname).toBe('/stable');
      expect(parseStableActionParam(url.searchParams.get('panel'))).toBe(key);
    }
  });
});
