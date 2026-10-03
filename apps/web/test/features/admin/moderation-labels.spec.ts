import { describe, expect, it } from 'vitest';
import { canSeeTab, roleOf } from '../../../src/features/admin/moderation-labels';
import { ApiError } from '../../../src/lib/api-client';
import { isAccountSuspended } from '../../../src/lib/session-logic';

describe('yönetim sekmeleri role göre (Faz 10)', () => {
  it('moderatör yalnızca şikâyet + oyuncu sekmesini görür; yönetici hepsini', () => {
    const tabs = ['reports', 'players', 'races', 'transactions', 'audit', 'announcements', 'events', 'anomalies'];
    expect(tabs.filter((tab) => canSeeTab('moderator', tab))).toEqual(['reports', 'players', 'anomalies']);
    expect(tabs.filter((tab) => canSeeTab('admin', tab))).toEqual(tabs);
    expect(tabs.filter((tab) => canSeeTab('player', tab))).toEqual([]);
  });
  it('roleOf: yönetici bayrağı moderatörden önce gelir', () => {
    expect(roleOf({ isAdmin: true, isModerator: true })).toBe('admin');
    expect(roleOf({ isAdmin: false, isModerator: true })).toBe('moderator');
    expect(roleOf(null)).toBe('player');
  });
});

describe('isAccountSuspended', () => {
  it('yalnızca 403 + ACCOUNT_SUSPENDED', () => {
    expect(isAccountSuspended(new ApiError('askı', 'ACCOUNT_SUSPENDED', 403))).toBe(true);
    expect(isAccountSuspended(new ApiError('x', 'ADMIN_REQUIRED', 403))).toBe(false);
    expect(isAccountSuspended(new ApiError('x', 'ACCOUNT_SUSPENDED', 401))).toBe(false);
  });
});
