import type { GiftQuotaView } from '@at-sevdalisi/shared-types';

/**
 * 16.10.2026 — sosyal brief §4/§9: çip gönderme onay ekranının saf kuralları.
 * Sunucu her şeyi yeniden denetler (kilit altında); buradaki ön kontrol
 * yalnızca kullanıcıya işlemden ÖNCE doğru bilgiyi göstermek içindir.
 */
export type TransferAmountCheck = { ok: true; amount: number } | { ok: false; message: string };

export function checkTransferAmount(raw: string, quota: GiftQuotaView): TransferAmountCheck {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, message: 'Bir tutar seç ya da yaz.' };
  const amount = Number(trimmed);
  if (!Number.isInteger(amount) || amount < quota.minAmount) {
    return { ok: false, message: `Tutar en az ${quota.minAmount} çip olan bir tam sayı olmalı.` };
  }
  if (amount > quota.maxAmount) {
    return {
      ok: false,
      message: quota.newAccountLimited
        ? `Yeni hesaplar tek seferde en fazla ${quota.maxAmount} çip gönderebilir.`
        : `Tek seferde en fazla ${quota.maxAmount} çip gönderilebilir.`,
    };
  }
  if (amount > quota.remainingAmountToday) {
    return { ok: false, message: `Bugün en fazla ${quota.remainingAmountToday} çip daha gönderebilirsin.` };
  }
  if (amount > quota.giftableBalance) {
    return {
      ok: false,
      message:
        quota.purchasedChipsLocked > 0
          ? `Gönderebileceğin en fazla ${quota.giftableBalance} çip (mağazadan alınan çip hediye edilemez).`
          : 'Bakiyen bu tutarı karşılamıyor.',
    };
  }
  if (quota.sentCountToday >= quota.dailyCountLimit) {
    return { ok: false, message: `Günlük hediye sayısı sınırına (${quota.dailyCountLimit}) ulaştın.` };
  }
  return { ok: true, amount };
}

/** Onay ekranının özeti: işlem sonrası bakiye ve bugün kalan hak. */
export function transferSummary(quota: GiftQuotaView, amount: number): { balanceAfter: number; remainingTodayAfter: number } {
  return { balanceAfter: quota.balance - amount, remainingTodayAfter: Math.max(0, quota.remainingAmountToday - amount) };
}

/**
 * `Idempotency-Key` BAŞARIYA KADAR saklanır (CLAUDE.md §13.23 deseni): aynı
 * alıcı + tutar için yeniden basış AYNI anahtarı yollar → ağda kaybolan yanıt
 * ikinci transfer üretmez. Alıcı ya da tutar değişince yeni anahtar.
 */
export interface PendingTransferKey {
  key: string;
  recipientId: string;
  amount: number;
}

export function transferKeyFor(
  previous: PendingTransferKey | null,
  recipientId: string,
  amount: number,
  makeKey: () => string,
): PendingTransferKey {
  if (previous !== null && previous.recipientId === recipientId && previous.amount === amount) return previous;
  return { key: makeKey(), recipientId, amount };
}
