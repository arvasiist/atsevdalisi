'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GiftQuotaView, SendGiftResult } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { checkTransferAmount, transferKeyFor, transferSummary, type PendingTransferKey } from './chip-transfer';

/**
 * 16.10.2026 — sosyal brief §4/§9: "Çip Hediye Et" → tutar (hazır ya da
 * serbest) → ONAY ekranı (alıcı, tutar, işlem sonrası bakiye, bugün kalan
 * hak) → gönder → sonuç. Bakiye/limit/arkadaşlık/engel sunucuda kilit altında
 * yeniden denetlenir; başarı mesajı yalnızca sunucu yanıtından sonra gösterilir.
 */
export function ChipTransferPanel({
  playerId,
  recipient,
  onClose,
  onSent,
}: {
  playerId: string;
  recipient: { playerId: string; displayName: string };
  onClose: () => void;
  onSent: () => Promise<void> | void;
}): React.ReactElement {
  const [quota, setQuota] = useState<GiftQuotaView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm' | 'done'>('edit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendGiftResult | null>(null);
  const pendingKey = useRef<PendingTransferKey | null>(null);

  const loadQuota = useCallback(async () => {
    try {
      setQuota(await apiClient.getGiftQuota(playerId));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gönderim hakkın yüklenemedi.');
    }
  }, [playerId]);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  if (loadError !== null) {
    return (
      <section className="chip-transfer" data-testid="chip-transfer">
        <p className="friend-gift-error">{loadError}</p>
        <button type="button" className="btn-outline" onClick={onClose}>
          Kapat
        </button>
      </section>
    );
  }
  if (quota === null) {
    return (
      <section className="chip-transfer" data-testid="chip-transfer">
        <p className="friend-gift-hint">Gönderim hakkın yükleniyor…</p>
      </section>
    );
  }

  const check = checkTransferAmount(amountText, quota);

  const confirm = async (): Promise<void> => {
    if (!check.ok || busy) return;
    pendingKey.current = transferKeyFor(pendingKey.current, recipient.playerId, check.amount, () => crypto.randomUUID());
    setBusy(true);
    setError(null);
    try {
      const sent = await apiClient.sendGift(playerId, recipient.playerId, check.amount, 'money', pendingKey.current.key);
      pendingKey.current = null;
      setResult(sent);
      setStep('done');
      await onSent();
      await loadQuota();
    } catch (err) {
      // Anahtar SAKLANIR: aynı tutarla yeniden deneme ikinci transfer üretmez.
      setError(err instanceof Error ? err.message : 'Transfer tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="chip-transfer" data-testid="chip-transfer" data-step={step}>
      <div className="friend-gift-row">
        <strong className="friend-gift-title">🪙 {recipient.displayName} kişisine çip gönder</strong>
        <button type="button" className="btn-outline" onClick={onClose}>
          Kapat
        </button>
      </div>

      {step === 'edit' ? (
        <>
          <p className="friend-gift-hint" data-testid="chip-transfer-quota">
            Gönderilebilir bakiyen {formatCurrency('money', quota.giftableBalance)} · bugün kalan hakkın{' '}
            {formatCurrency('money', quota.remainingAmountToday)} · tek seferde en fazla{' '}
            {formatCurrency('money', quota.maxAmount)}
            {quota.newAccountLimited ? ' (yeni hesap sınırı)' : ''}
            {quota.purchasedChipsLocked > 0
              ? ` · mağazadan alınan ${formatCurrency('money', quota.purchasedChipsLocked)} hediye edilemez`
              : ''}
          </p>
          <div className="chip-transfer-presets" role="group" aria-label="Hazır tutarlar">
            {quota.presetAmounts.map((preset) => (
              <button
                key={preset}
                type="button"
                className={amountText === String(preset) ? 'btn-gold' : 'btn-outline'}
                onClick={() => setAmountText(String(preset))}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            className="social-search-input"
            type="number"
            inputMode="numeric"
            min={quota.minAmount}
            max={quota.maxAmount}
            placeholder="Ya da tutar yaz"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            aria-label="Gönderilecek çip"
          />
          {!check.ok && amountText.trim() !== '' ? <p className="friend-gift-error">{check.message}</p> : null}
          <button type="button" className="btn-gold" disabled={!check.ok} onClick={() => setStep('confirm')}>
            Devam
          </button>
        </>
      ) : null}

      {step === 'confirm' && check.ok ? (
        <div className="chip-transfer-confirm" data-testid="chip-transfer-confirm">
          <dl>
            <dt>Alıcı</dt>
            <dd>{recipient.displayName}</dd>
            <dt>Gönderilecek</dt>
            <dd>{formatCurrency('money', check.amount)}</dd>
            <dt>İşlem sonrası bakiyen</dt>
            <dd>{formatCurrency('money', transferSummary(quota, check.amount).balanceAfter)}</dd>
            <dt>Bugün kalan hakkın</dt>
            <dd>{formatCurrency('money', transferSummary(quota, check.amount).remainingTodayAfter)}</dd>
          </dl>
          <p className="friend-gift-hint">Transfer geri alınamaz; çipler arkadaşının hesabına geçer.</p>
          <div className="friend-gift-row">
            <button type="button" className="btn-outline" disabled={busy} onClick={() => setStep('edit')}>
              Geri
            </button>
            <button type="button" className="btn-gold" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Gönderiliyor…' : 'Onayla ve Gönder'}
            </button>
          </div>
          {error ? (
            <p className="friend-gift-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 'done' && result !== null ? (
        <div data-testid="chip-transfer-done">
          <p className="friend-gift-notice" role="status">
            {result.recipient.displayName} kişisine {formatCurrency('money', result.amount)} gönderildi. Yeni bakiyen{' '}
            {formatCurrency('money', result.senderBalance.money)}.
          </p>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setAmountText('');
              setResult(null);
              setStep('edit');
            }}
          >
            Yeniden gönder
          </button>
        </div>
      ) : null}
    </section>
  );
}
