import { describe, expect, it, vi } from 'vitest';
import { canRequestLandscape, requestLandscape } from '../../../src/features/orientation/orientation';

/**
 * 10.10.2026 — telefonda oyun yatay oynanır. "Tam ekran + yatay" düğmesi
 * yalnızca tarayıcı ikisini de destekliyorsa görünür (Android Chrome);
 * iPhone Safari öğeyi tam ekrana almaz → düğme yok, oyuncu elle çevirir.
 */
describe('yatay ekran kilidi', () => {
  it('tam ekran VE yön kilidi yoksa düğme gösterilmez', () => {
    const fullscreen = async () => undefined;
    const lock = async () => undefined;
    expect(canRequestLandscape({ fullscreenEnabled: true, requestFullscreen: fullscreen, lockLandscape: lock })).toBe(true);
    expect(canRequestLandscape({ fullscreenEnabled: false, requestFullscreen: fullscreen, lockLandscape: lock })).toBe(false);
    expect(canRequestLandscape({ fullscreenEnabled: true, lockLandscape: lock })).toBe(false);
    expect(canRequestLandscape({ fullscreenEnabled: true, requestFullscreen: fullscreen })).toBe(false);
  });

  it('önce tam ekran, sonra yatay kilit; ikisi de olursa "locked"', async () => {
    const order: string[] = [];
    const result = await requestLandscape({
      fullscreenEnabled: true,
      requestFullscreen: async () => void order.push('fullscreen'),
      lockLandscape: async () => void order.push('lock'),
    });
    expect(result).toBe('locked');
    expect(order).toEqual(['fullscreen', 'lock']);
  });

  it('kilit reddedilirse "failed" (hata fırlatmaz); destek yoksa hiçbir şey çağrılmaz', async () => {
    const lock = vi.fn(async () => {
      throw new Error('NotSupportedError');
    });
    expect(await requestLandscape({ fullscreenEnabled: true, requestFullscreen: async () => undefined, lockLandscape: lock })).toBe(
      'failed',
    );
    const fullscreen = vi.fn(async () => undefined);
    expect(await requestLandscape({ fullscreenEnabled: false, requestFullscreen: fullscreen, lockLandscape: lock })).toBe(
      'unsupported',
    );
    expect(fullscreen).not.toHaveBeenCalled();
  });
});
