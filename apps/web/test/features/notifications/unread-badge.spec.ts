import { describe, expect, it } from 'vitest';
import {
  UNREAD_BADGE_MAX,
  formatUnreadBadge,
  notificationsAriaLabel,
} from '../../../src/features/notifications/unread-badge';

describe('zil rozeti (16.10.2026)', () => {
  it('0 gizlenir, 1..9 sayı, fazlası 9+', () => {
    expect(formatUnreadBadge(0)).toBeNull();
    expect(formatUnreadBadge(-1)).toBeNull();
    expect(formatUnreadBadge(3)).toBe('3');
    expect(formatUnreadBadge(UNREAD_BADGE_MAX)).toBe('9');
    expect(formatUnreadBadge(UNREAD_BADGE_MAX + 1)).toBe('9+');
  });

  it('ekran okuyucu etiketi sayıyı söyler', () => {
    expect(notificationsAriaLabel('Bildirimler', 0)).toBe('Bildirimler');
    expect(notificationsAriaLabel('Bildirimler', 4)).toBe('Bildirimler (4 okunmamış)');
  });
});
