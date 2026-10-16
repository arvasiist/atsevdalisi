'use client';

/**
 * ÖDEMELER (07.10.2026, Faz 12) — yalnızca yönetici. "İade iste" sağlayıcıya
 * bir TALEPTİR: elmas geri alma, sağlayıcının iade bildirimi gelince olur.
 * Sağlayıcı oturum/ödeme kimliği sunucudan hiç gelmez.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AdminPaymentOrderView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { PAYMENT_STATUS_LABELS, formatPrice } from '../store/store-labels';

export function PaymentsAdmin({ onChanged }: { onChanged: (message: string) => void }): React.ReactElement {
  const [rows, setRows] = useState<AdminPaymentOrderView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient
      .listAdminPayments()
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Liste yüklenemedi.'));
  }, []);

  useEffect(load, [load]);

  const refund = async (orderId: string) => {
    setBusy(orderId);
    setError(null);
    try {
      await apiClient.requestPaymentRefund(orderId);
      onChanged('İade talebi sağlayıcıya iletildi; sonuç bildirimle gelecek.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İade talebi gönderilemedi.');
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="moderation-error">{error}</p>;
  if (!rows) return <p className="session-meta">Yükleniyor…</p>;
  if (rows.length === 0) return <p className="session-meta">Henüz ödeme yok.</p>;
  return (
    <ul className="session-list" data-testid="payments-admin">
      {rows.map((row) => (
        <li key={row.id}>
          <strong>{row.username}</strong> · {row.chips > 0 ? `${row.chips} çip` : `${row.gems} elmas`} · {formatPrice(row.amountMinor, row.currency)} ·{' '}
          {PAYMENT_STATUS_LABELS[row.status]}
          {row.failureCode ? ` (${row.failureCode})` : ''}
          {row.clawbackShortfallGems > 0 ? ` · geri alınamayan ${row.clawbackShortfallGems} elmas — incele` : ''}
          {row.clawbackShortfallChips > 0 ? ` · geri alınamayan ${row.clawbackShortfallChips} çip — incele` : ''} ·{' '}
          {new Date(row.createdAt).toLocaleString('tr-TR')}
          {row.status === 'paid' ? (
            <button type="button" disabled={busy !== null} onClick={() => void refund(row.id)} style={{ marginLeft: 8 }}>
              İade iste
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
