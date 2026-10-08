'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { FriendGiftBoardView } from '@at-sevdalisi/shared-types';
import { loadAchievementsConfig } from '@at-sevdalisi/game-config';
import { apiClient } from '../../lib/api-client';
import {
  canCollect,
  canSendToAll,
  collectHint,
  describeCollect,
  describeSendAll,
  nextFriendMilestone,
  sendAllHint,
} from './friend-gift';

const ACHIEVEMENTS = loadAchievementsConfig().achievements;

/**
 * DOSTLUK HEDİYESİ (08.10.2026) — "tek tuşla bütün arkadaşlarına cüzi bir
 * çip gönder" + "gelenleri topla". Gönderen ödemez; toplanan çip sunucuda
 * defter satırıyla girer. `refreshKey` arkadaş listesi değişince panoyu
 * yeniden yükler.
 */
export function FriendGiftPanel({
  refreshKey,
  onBalanceChanged,
}: {
  refreshKey: number;
  onBalanceChanged: () => void | Promise<void>;
}): React.ReactElement | null {
  const [board, setBoard] = useState<FriendGiftBoardView | null>(null);
  const [busy, setBusy] = useState<'send' | 'collect' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await apiClient.getFriendGifts());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dostluk hediyeleri yüklenemedi');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const sendAll = async (): Promise<void> => {
    setBusy('send');
    setError(null);
    try {
      setNotice(describeSendAll(await apiClient.sendFriendGiftsToAll()));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hediye gönderilemedi');
    } finally {
      setBusy(null);
    }
  };

  const collect = async (): Promise<void> => {
    setBusy('collect');
    setError(null);
    try {
      setNotice(describeCollect(await apiClient.collectFriendGifts()));
      await load();
      await onBalanceChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hediyeler toplanamadı');
    } finally {
      setBusy(null);
    }
  };

  if (!board) {
    return error ? <p className="friend-gift-error">{error}</p> : null;
  }

  const milestone = nextFriendMilestone(board.friendCount, ACHIEVEMENTS);
  return (
    <section className="friend-gift" data-testid="friend-gift">
      <div className="friend-gift-row">
        <div>
          <strong className="friend-gift-title">🎁 Dostluk Hediyesi</strong>
          <p className="friend-gift-hint">{sendAllHint(board)}</p>
        </div>
        <button
          type="button"
          className="btn-gold"
          disabled={busy !== null || !canSendToAll(board)}
          onClick={() => void sendAll()}
        >
          {busy === 'send' ? 'Gönderiliyor…' : 'Hepsine Gönder'}
        </button>
      </div>
      <div className="friend-gift-row">
        <div>
          <strong>
            Gelen hediyeler: {board.pendingCount}
            {board.pendingAmount > 0 ? ` (${board.pendingAmount} çip)` : ''}
          </strong>
          <p className="friend-gift-hint">{collectHint(board)}</p>
          {board.pending.length > 0 ? (
            <p className="friend-gift-senders">
              {board.pending
                .slice(0, 6)
                .map((gift) => gift.sender.displayName)
                .join(', ')}
              {board.pendingCount > 6 ? ` ve ${board.pendingCount - 6} kişi daha` : ''}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn-gold"
          disabled={busy !== null || !canCollect(board)}
          onClick={() => void collect()}
        >
          {busy === 'collect' ? 'Toplanıyor…' : 'Hepsini Topla'}
        </button>
      </div>
      {milestone ? (
        <p className="friend-gift-hint">
          🤝 Arkadaş başarımı: {Math.min(board.friendCount, milestone.target)}/{milestone.target} arkadaş →{' '}
          {milestone.rewardMoney} çip (<Link href="/quests">Görevler</Link>&apos;den al)
        </p>
      ) : null}
      {notice ? <p className="friend-gift-notice">{notice}</p> : null}
      {error ? <p className="friend-gift-error">{error}</p> : null}
    </section>
  );
}
