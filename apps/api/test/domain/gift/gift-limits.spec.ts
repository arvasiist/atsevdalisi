import { describe, expect, it } from 'vitest';
import { loadGiftConfig } from '@at-sevdalisi/game-config';
import { GiftLimitExceededError } from '../../../src/domain/gift/errors';
import {
  assertGiftWithinAmountLimits,
  assertGiftableAmount,
  effectiveGiftAllowance,
  giftableBalance,
  validateGiftAmountLimits,
} from '../../../src/domain/gift/gift';

describe('çip transferi tutar tavanları (16.10.2026)', () => {
  const config = loadGiftConfig();
  const usage = (sentAmount: number, receivedAmount: number, senderAccountAgeDays: number) => ({
    sentAmount,
    receivedAmount,
    senderAccountAgeDays,
  });
  const kindOf = (fn: () => void): string | null => {
    try {
      fn();
      return null;
    } catch (error) {
      return error instanceof GiftLimitExceededError ? error.kind : 'OTHER';
    }
  };

  it('config geçerli; yeni hesap tavanı genelden büyük olamaz, hazır tutarlar aralıkta', () => {
    expect(validateGiftAmountLimits(config)).toEqual([]);
    expect(validateGiftAmountLimits({ ...config, newAccount: { ...config.newAccount, maxAmount: config.maxAmount + 1 } })).not.toEqual([]);
    expect(validateGiftAmountLimits({ ...config, presetAmounts: [config.maxAmount + 1] })).not.toEqual([]);
    expect(validateGiftAmountLimits({ ...config, presetAmounts: [] })).not.toEqual([]);
  });

  it('yeni hesap: işlem başı ve günlük tavan düşer; yaşlı hesap genel tavanı kullanır', () => {
    const young = effectiveGiftAllowance(config, { sentAmount: 0, senderAccountAgeDays: 0 });
    expect(young).toMatchObject({ newAccountLimited: true, maxAmount: config.newAccount.maxAmount });
    const old = effectiveGiftAllowance(config, { sentAmount: 0, senderAccountAgeDays: config.newAccount.minAccountAgeDays });
    expect(old).toMatchObject({ newAccountLimited: false, maxAmount: config.maxAmount, remainingToday: config.dailyAmountLimit });
  });

  it('sıra: işlem başı (yeni hesap) → günlük gönderim → alıcının günlük aldığı', () => {
    expect(kindOf(() => assertGiftWithinAmountLimits(config.newAccount.maxAmount + 1, config, usage(0, 0, 0)))).toBe('NEW_ACCOUNT_AMOUNT');
    expect(kindOf(() => assertGiftWithinAmountLimits(2, config, usage(config.newAccount.dailyAmountLimit - 1, 0, 0)))).toBe(
      'NEW_ACCOUNT_DAILY_AMOUNT',
    );
    expect(kindOf(() => assertGiftWithinAmountLimits(2, config, usage(config.dailyAmountLimit - 1, 0, 30)))).toBe('DAILY_AMOUNT');
    expect(kindOf(() => assertGiftWithinAmountLimits(2, config, usage(0, config.dailyReceiveAmountLimit - 1, 30)))).toBe(
      'RECIPIENT_DAILY_AMOUNT',
    );
    expect(kindOf(() => assertGiftWithinAmountLimits(1, config, usage(config.dailyAmountLimit - 1, 0, 30)))).toBeNull();
  });

  it('satın alınan çip hediye edilemez; satın alma yoksa kural devreye girmez', () => {
    expect(giftableBalance(1_000, 800)).toBe(200);
    expect(giftableBalance(500, 800)).toBe(0);
    expect(giftableBalance(500, -10)).toBe(500);
    expect(kindOf(() => assertGiftableAmount(201, 1_000, 800))).toBe('PURCHASED_CHIPS_NOT_GIFTABLE');
    expect(kindOf(() => assertGiftableAmount(200, 1_000, 800))).toBeNull();
    expect(kindOf(() => assertGiftableAmount(1_000, 1_000, 0))).toBeNull();
  });
});
