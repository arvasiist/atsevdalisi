// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

/**
 * PLACEHOLDER rozeti (10.10.2026): üretimde oyuncuya dosya yolu GÖSTERİLMEZ
 * ama eksiklik gizlenmez (kısa not); geliştirmede yol listesi görünür.
 * Varlık durumu tek rapordan gelir (`/asset-availability`) — sahte fetch.
 */
const fetchStub = vi.fn(async (url: string) => {
  if (url === '/asset-availability') {
    return { ok: true, json: async () => ({ checked: ['models/horse.glb'], available: [] }) } as Response;
  }
  return { ok: false } as Response;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function renderBadge(nodeEnv: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubGlobal('fetch', fetchStub);
  vi.resetModules();
  const { PlaceholderBadge } = await import('../../../src/features/race-viewer/assets/PlaceholderBadge');
  render(<PlaceholderBadge assetIds={['HORSE_MODEL_REQUIRED']} />);
  return screen.findByRole('note', { name: 'Placeholder görüntü' });
}

describe('PlaceholderBadge', () => {
  it('üretim: kısa not, dosya yolu YOK', async () => {
    const note = await renderBadge('production');
    expect(note.textContent).toContain('PLACEHOLDER');
    expect(note.textContent).not.toMatch(/\.glb|models\//);
  });

  it('geliştirme: bekleyen yollar listelenir ve konsola bir kez yazılır', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const note = await renderBadge('development');
    await waitFor(() => expect(note.textContent).toContain('models/horse.glb'));
    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it('geliştirme rozeti üretim rozetiyle aynı sağ payı bırakır (ahırda Bakım/Ekipman düğmelerinin altına girmez)', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const note = await renderBadge('development');
    const css = readFileSync(resolve(__dirname, '../../../src/app/globals.css'), 'utf8');
    const compact = /\.placeholder-badge-compact\s*\{[^}]*max-width:\s*min\(\d+px,\s*calc\(100% - (\d+)px\)\)/.exec(css);
    expect(compact).not.toBeNull();
    expect(note.style.maxWidth).toContain(`calc(100% - ${compact![1]}px)`);
  });
});
