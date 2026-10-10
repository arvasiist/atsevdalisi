// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AnnouncementView } from '@at-sevdalisi/shared-types';

/**
 * 10.10.2026 (yatay telefon) — şeridin yüksekliği `--announcement-height`e
 * yazılır; tam ekran sahneler bunu düşer. Şerit yokken/kalkınca 0.
 */
const { getAnnouncementsMock } = vi.hoisted(() => ({ getAnnouncementsMock: vi.fn() }));
vi.mock('../../../src/lib/api-client', () => ({
  apiClient: { getAnnouncements: (...args: unknown[]) => getAnnouncementsMock(...args) },
}));

import { ANNOUNCEMENT_HEIGHT_VAR, AnnouncementStrip } from '../../../src/features/announcements/AnnouncementStrip';

const STRIP_HEIGHT_PX = 42;

const ITEM: AnnouncementView = {
  id: 'a1',
  title: 'Yarın etkinlik',
  body: 'Hazır olun.',
  level: 'info',
  startsAt: '2026-10-10T00:00:00.000Z',
  endsAt: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(ANNOUNCEMENT_HEIGHT_VAR);
});

describe('AnnouncementStrip yüksekliği', () => {
  it('şerit görünürken yüksekliğini yazar, kalkınca 0 yapar', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(STRIP_HEIGHT_PX);
    getAnnouncementsMock.mockResolvedValue([ITEM]);
    const { unmount } = render(<AnnouncementStrip />);
    await screen.findByRole('region', { name: 'Duyurular' });
    expect(document.documentElement.style.getPropertyValue(ANNOUNCEMENT_HEIGHT_VAR)).toBe(`${STRIP_HEIGHT_PX}px`);
    unmount();
    expect(document.documentElement.style.getPropertyValue(ANNOUNCEMENT_HEIGHT_VAR)).toBe('0px');
  });

  it('duyuru yoksa değişken 0', async () => {
    getAnnouncementsMock.mockResolvedValue([]);
    render(<AnnouncementStrip />);
    await Promise.resolve();
    expect(screen.queryByRole('region', { name: 'Duyurular' })).toBeNull();
    expect(document.documentElement.style.getPropertyValue(ANNOUNCEMENT_HEIGHT_VAR)).toBe('0px');
  });
});
