// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminPlayerAccountView } from '@at-sevdalisi/shared-types';
import { BalanceAdjustmentForm } from '../../../src/features/admin/BalanceAdjustmentForm';
import { apiClient } from '../../../src/lib/api-client';

const player = { playerId: 'p1', displayName: 'Hedef', username: 'hedef' } as unknown as AdminPlayerAccountView;

describe('BalanceAdjustmentForm — Idempotency-Key (para yolu)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('başarısız denemede AYNI anahtar tekrar kullanılır, başarıdan sonra yenisi üretilir', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const spy = vi
      .spyOn(apiClient, 'adjustPlayerBalance')
      .mockRejectedValueOnce(new Error('ağ hatası'))
      .mockResolvedValue({ transactionId: 't', auditId: 'a', currency: 'money', amount: 100, balanceBefore: 0, balanceAfter: 100 });
    const onDone = vi.fn();
    render(<BalanceAdjustmentForm player={player} onDone={onDone} />);
    const fill = () => {
      fireEvent.change(screen.getByLabelText('Düzeltme tutarı'), { target: { value: '100' } });
      fireEvent.change(screen.getByLabelText('Düzeltme gerekçesi'), { target: { value: 'Destek talebi telafisi' } });
    };
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }));
    await screen.findByText('ağ hatası');
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![2]).toBe(spy.mock.calls[1]![2]);

    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    expect(spy.mock.calls[2]![2]).not.toBe(spy.mock.calls[1]![2]);
  });

  it('geçersiz tutar/gerekçede düğme kapalı', () => {
    render(<BalanceAdjustmentForm player={player} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Düzeltme tutarı'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Düzeltme gerekçesi'), { target: { value: 'Destek talebi telafisi' } });
    expect((screen.getByRole('button', { name: 'Uygula' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
