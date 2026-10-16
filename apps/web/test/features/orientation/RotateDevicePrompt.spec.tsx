// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RotateDevicePrompt } from '../../../src/features/orientation/RotateDevicePrompt';

/** 10.10.2026 — dikey telefonda "yan çevir" katmanı (görünürlüğü CSS'te). */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
});

function stubLockSupport(lock: () => Promise<void>): void {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: async () => undefined });
  vi.stubGlobal('screen', { orientation: { lock } });
}

describe('RotateDevicePrompt', () => {
  it('yönergeyi gösterir; desteklenmeyen tarayıcıda (iPhone) düğme YOK', () => {
    render(<RotateDevicePrompt />);
    expect(screen.getByRole('dialog', { name: 'Telefonunu yan çevir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tam ekran + yatay' })).toBeNull();
  });

  it('destekleyen tarayıcıda düğme tam ekran + yatay kilidi ister', async () => {
    const lock = vi.fn(async () => undefined);
    stubLockSupport(lock);
    render(<RotateDevicePrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tam ekran + yatay' }));
    await waitFor(() => expect(lock).toHaveBeenCalledWith('landscape'));
    expect(screen.getByRole('status').textContent).toContain('döndürme kilidi');
  });

  it('kilit reddedilirse oyuncuya elle çevirmesini söyler', async () => {
    stubLockSupport(async () => {
      throw new Error('NotSupportedError');
    });
    render(<RotateDevicePrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tam ekran + yatay' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('elle yan çevir'));
  });
});
