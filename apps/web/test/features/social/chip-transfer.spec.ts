import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GiftQuotaView } from '@at-sevdalisi/shared-types';
import { checkTransferAmount, transferKeyFor, transferSummary } from '../../../src/features/social/chip-transfer';

const SRC = join(__dirname, '../../../src');

const quota = (patch: Partial<GiftQuotaView> = {}): GiftQuotaView => ({
  currency: 'money',
  minAmount: 1,
  maxAmount: 1_000,
  presetAmounts: [10, 50, 100, 500],
  dailyCountLimit: 20,
  sentCountToday: 0,
  dailyAmountLimit: 2_000,
  sentAmountToday: 0,
  remainingAmountToday: 2_000,
  newAccountLimited: false,
  balance: 5_000,
  giftableBalance: 5_000,
  purchasedChipsLocked: 0,
  ...patch,
});

describe('çip gönderme onay ekranı (16.10.2026)', () => {
  it('tutar ön kontrolü: tam sayı, tavanlar, bakiye, satın alınmış çip, günlük sayı', () => {
    expect(checkTransferAmount('', quota()).ok).toBe(false);
    expect(checkTransferAmount('2.5', quota()).ok).toBe(false);
    expect(checkTransferAmount('100', quota())).toEqual({ ok: true, amount: 100 });
    expect(checkTransferAmount('1001', quota()).ok).toBe(false);
    const newAccount = checkTransferAmount('150', quota({ maxAmount: 100, newAccountLimited: true }));
    expect(newAccount.ok === false && newAccount.message).toMatch(/Yeni hesaplar/);
    expect(checkTransferAmount('300', quota({ remainingAmountToday: 200 })).ok).toBe(false);
    const purchased = checkTransferAmount('300', quota({ giftableBalance: 200, purchasedChipsLocked: 800 }));
    expect(purchased.ok === false && purchased.message).toMatch(/mağazadan alınan/);
    expect(checkTransferAmount('10', quota({ sentCountToday: 20 })).ok).toBe(false);
  });

  it('onay özeti: işlem sonrası bakiye ve bugün kalan hak', () => {
    expect(transferSummary(quota(), 300)).toEqual({ balanceAfter: 4_700, remainingTodayAfter: 1_700 });
  });

  it('Idempotency-Key aynı alıcı + tutarda saklanır, değişince yenilenir', () => {
    let n = 0;
    const make = () => `k${++n}`;
    const first = transferKeyFor(null, 'a', 100, make);
    expect(transferKeyFor(first, 'a', 100, make)).toBe(first);
    expect(transferKeyFor(first, 'a', 200, make).key).toBe('k2');
    expect(transferKeyFor(first, 'b', 100, make).key).toBe('k3');
  });

  it('arkadaş ekranı onaylı paneli kullanır; eski anahtar-her-basışta formu kalktı', () => {
    const page = readFileSync(join(SRC, 'app/friends/page.tsx'), 'utf8');
    expect(page).toContain('<ChipTransferPanel');
    expect(page).not.toContain('crypto.randomUUID()');
    const panel = readFileSync(join(SRC, 'features/social/ChipTransferPanel.tsx'), 'utf8');
    expect(panel).toContain('Onayla ve Gönder');
    expect(panel).toContain('transferKeyFor(pendingKey.current');
  });
});
