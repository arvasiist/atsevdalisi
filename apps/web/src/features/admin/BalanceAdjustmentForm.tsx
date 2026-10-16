'use client';

/**
 * BAKİYE DÜZELTMESİ (02.10.2026, Faz 10) — yalnızca yönetici, yalnızca oyuncu
 * hedefi. PARA YOLU: `Idempotency-Key` BAŞARIYA KADAR SAKLANIR (CLAUDE.md
 * `/wallet` kuralı) — yanıt ağda kaybolup yeniden basılırsa sunucu ikinci
 * bir düzeltme yazmaz. Gövde/tutar değişince yeni anahtar üretilir.
 */

import { useRef, useState } from 'react';
import type { AdminPlayerAccountView } from '@at-sevdalisi/shared-types';
import { loadModerationConfig } from '@at-sevdalisi/game-config';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';

const LIMITS = loadModerationConfig().economyAdjustment;

export function BalanceAdjustmentForm({
  player,
  onDone,
}: {
  player: AdminPlayerAccountView;
  onDone: (message: string) => void;
}): React.ReactElement {
  const [currency, setCurrency] = useState<'money' | 'gems'>('money');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<{ key: string; signature: string } | null>(null);

  const numeric = Number(amount);
  const valid =
    Number.isInteger(numeric) &&
    numeric !== 0 &&
    Math.abs(numeric) <= LIMITS.maxAbsAmount[currency] &&
    reason.trim().length >= LIMITS.reasonMinLength;

  const submit = async (): Promise<void> => {
    const signature = `${player.playerId}|${currency}|${numeric}|${reason.trim()}`;
    if (keyRef.current?.signature !== signature) keyRef.current = { key: crypto.randomUUID(), signature };
    const verb = numeric > 0 ? 'eklensin' : 'düşülsün';
    if (!window.confirm(`${player.displayName}: ${formatCurrency(currency, Math.abs(numeric))} ${verb} mi?`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.adjustPlayerBalance(
        player.playerId,
        { currency, amount: numeric, reason: reason.trim() },
        keyRef.current.key,
      );
      keyRef.current = null; // yalnızca BAŞARIDA atılır
      setAmount('');
      setReason('');
      onDone(`${player.displayName}: bakiye ${formatCurrency(currency, result.balanceBefore)} → ${formatCurrency(currency, result.balanceAfter)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Düzeltme yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h4>Bakiye düzeltmesi</h4>
      <div className="moderation-form">
        <label className="moderation-field">
          Birim
          <select aria-label="Düzeltme birimi" value={currency} onChange={(e) => setCurrency(e.target.value as 'money' | 'gems')}>
            <option value="money">Para</option>
            <option value="gems">Elmas</option>
          </select>
        </label>
        <label className="moderation-field">
          Tutar (− düşer)
          <input aria-label="Düzeltme tutarı" type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="moderation-field moderation-field-wide">
          Gerekçe (denetim günlüğüne yazılır)
          <input
            aria-label="Düzeltme gerekçesi"
            value={reason}
            maxLength={LIMITS.reasonMaxLength}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button type="button" className="moderation-danger" disabled={busy || !valid} onClick={() => void submit()}>
          Uygula
        </button>
      </div>
      <p className="session-meta">
        Mutlak tutar en fazla {formatCurrency(currency, LIMITS.maxAbsAmount[currency])}; bakiye eksiye düşürülemez.
      </p>
      {error ? <p className="moderation-error">{error}</p> : null}
    </>
  );
}
