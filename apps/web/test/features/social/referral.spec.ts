import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReferralRowView } from '@at-sevdalisi/shared-types';
import {
  describeReferralStatus,
  referralCodeFromSearch,
  referralLink,
  whatsappShareUrl,
} from '../../../src/features/social/referral';
import { NAV_LINKS } from '../../../src/components/layout/nav-links';

const SRC = join(__dirname, '../../../src');

describe('davet ekranı (16.10.2026)', () => {
  it('bağlantı kendi adresinden kurulur; WhatsApp metni bağlantıyı taşır', () => {
    const link = referralLink('https://oyun.ornek/', 'ABCD2345');
    expect(link).toBe('https://oyun.ornek/?ref=ABCD2345');
    expect(decodeURIComponent(whatsappShareUrl(link))).toContain(link);
    expect(whatsappShareUrl(link).startsWith('https://wa.me/?text=')).toBe(true);
  });

  it('?ref= yakalanır; biçimsiz değer alınmaz', () => {
    expect(referralCodeFromSearch('?ref=ABCD2345')).toBe('ABCD2345');
    expect(referralCodeFromSearch('?ref=<script>')).toBeNull();
    expect(referralCodeFromSearch('?x=1')).toBeNull();
  });

  it('durum metni eksik koşulu söyler', () => {
    const row: ReferralRowView = {
      referralId: 'r',
      invitee: { playerId: 'p', username: 'u', displayName: 'U', level: 1 },
      joinedAt: '2026-10-16T00:00:00.000Z',
      status: 'pending',
      emailVerified: false,
      finishedRaces: 1,
      requiredRaces: 3,
      emailRequired: true,
      rewardedAt: null,
      inviterReward: null,
    };
    expect(describeReferralStatus(row)).toBe('Bekleniyor: e-posta doğrulaması, 1/3 yarış');
    expect(describeReferralStatus({ ...row, status: 'ready' })).toBe('Ödül hazır');
    expect(describeReferralStatus({ ...row, status: 'capped' })).toMatch(/sınırı/);
  });

  it('menüde, üst barda (yakalama) ve sayfada bağlı', () => {
    expect(NAV_LINKS.some((link) => link.href === '/invite')).toBe(true);
    expect(readFileSync(join(SRC, 'components/layout/TopBar.tsx'), 'utf8')).toContain('useReferralCapture(player?.id ?? null)');
    const page = readFileSync(join(SRC, 'app/invite/page.tsx'), 'utf8');
    expect(page).toContain('apiClient.claimReferralRewards()');
    expect(page).toContain('whatsappShareUrl(link)');
  });
});
