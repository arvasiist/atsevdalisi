'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { FriendGiftBoardView, FriendGiftRecipientResult } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import {
  canCollect,
  canSendToAll,
  collectHint,
  describeCollect,
  describeSendAll,
  friendMilestones,
  nextSendCost,
  sendAllHint,
  type FriendMilestone,
} from './friend-gift';

const RECIPIENT_STATUS_LABEL: Record<FriendGiftRecipientResult['status'], string> = {
  sent: 'gönderildi',
  already_sent: 'bugün zaten gönderilmişti',
  budget_exhausted: 'günlük bütçe doldu',
  insufficient_funds: 'bakiye yetmedi',
};

/**
 * DOSTLUK HEDİYESİ (08.10.2026) — "tek tuşla bütün arkadaşlarına cüzi bir
 * çip gönder" + "gelenleri topla". 16.10.2026 (brief §6.3–6.5): GÖNDEREN ÖDER;
 * kime gideceği ve ne kadar düşeceği basmadan önce sunucunun önizlemesiyle
 * gösterilir, sonuç kişi başı listelenir. Arkadaş başarımları (kazanılmış /
 * alınmış) aynı panelde. `refreshKey` arkadaş listesi değişince panoyu
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
  const [lastSend, setLastSend] = useState<FriendGiftRecipientResult[] | null>(null);
  const [milestones, setMilestones] = useState<FriendMilestone[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [gifts, achievements] = await Promise.all([apiClient.getFriendGifts(), apiClient.getAchievements()]);
      setBoard(gifts);
      setMilestones(friendMilestones(achievements.achievements));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dostluk hediyeleri yüklenemedi');
    }
  }, []);

  const claimMilestone = async (key: string): Promise<void> => {
    setClaiming(key);
    setError(null);
    try {
      const result = await apiClient.claimAchievement(key);
      setNotice(`🤝 Arkadaş başarımı ödülü alındı: +${result.rewardMoney} çip.`);
      await load();
      await onBalanceChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ödül alınamadı');
    } finally {
      setClaiming(null);
    }
  };

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const sendAll = async (): Promise<void> => {
    setBusy('send');
    setError(null);
    try {
      const result = await apiClient.sendFriendGiftsToAll();
      setNotice(describeSendAll(result));
      setLastSend(result.recipients);
      await load();
      await onBalanceChanged();
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
    return error ? (
      <p className="friend-gift-error">{error}</p>
    ) : (
      <p className="friend-gift-hint" data-testid="friend-gift-loading">
        Dostluk hediyeleri yükleniyor…
      </p>
    );
  }

  const cost = nextSendCost(board);
  const nextMilestone = milestones?.find((milestone) => milestone.state === 'locked') ?? null;
  return (
    <section className="friend-gift" data-testid="friend-gift">
      <div className="friend-gift-row">
        <div>
          <strong className="friend-gift-title">🎁 Dostluk Hediyesi</strong>
          <p className="friend-gift-hint" data-testid="friend-gift-send-hint">
            {sendAllHint(board)}
          </p>
          {board.nextRecipients.length > 0 ? (
            <p className="friend-gift-senders" data-testid="friend-gift-next-recipients">
              Gidecek: {board.nextRecipients.map((friend) => friend.displayName).join(', ')}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn-gold"
          disabled={busy !== null || !canSendToAll(board)}
          onClick={() => void sendAll()}
        >
          {busy === 'send' ? 'Gönderiliyor…' : cost > 0 ? `Hepsine Gönder (−${cost} çip)` : 'Hepsine Gönder'}
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
      {lastSend !== null && lastSend.length > 0 ? (
        <ul className="friend-gift-results" data-testid="friend-gift-results">
          {lastSend.map((recipient) => (
            <li key={recipient.playerId} data-status={recipient.status}>
              {recipient.displayName}: {RECIPIENT_STATUS_LABEL[recipient.status]}
            </li>
          ))}
        </ul>
      ) : null}
      {milestones !== null && milestones.length > 0 ? (
        <div className="friend-gift-milestones" data-testid="friend-milestones">
          <strong>🤝 Arkadaş Çevreni Genişlet</strong>
          <p className="friend-gift-hint">
            {board.friendCount} geçerli arkadaş
            {nextMilestone
              ? ` · sonraki ödüle ${Math.max(0, nextMilestone.target - board.friendCount)} arkadaş kaldı (${nextMilestone.target} → ${nextMilestone.rewardMoney} çip)`
              : ' · bütün eşikler tamam'}
          </p>
          <ul>
            {milestones.map((milestone) => (
              <li key={milestone.key} data-testid={`friend-milestone-${milestone.target}`} data-state={milestone.state}>
                {milestone.target} arkadaş — {milestone.rewardMoney} çip:{' '}
                {milestone.state === 'claimed' ? (
                  <span>alındı ✓</span>
                ) : milestone.state === 'claimable' ? (
                  <button
                    type="button"
                    className="btn-gold"
                    disabled={claiming !== null}
                    onClick={() => void claimMilestone(milestone.key)}
                  >
                    {claiming === milestone.key ? 'Alınıyor…' : 'Ödülü al'}
                  </button>
                ) : (
                  <span>{Math.min(board.friendCount, milestone.target)}/{milestone.target}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="friend-gift-hint">
            Yalnızca iki tarafın kabul ettiği arkadaşlık sayılır; engellenen ve silinen hesaplar sayılmaz. Her
            eşik bir kez ödenir. Tüm başarımlar: <Link href="/quests">Görevler</Link>
          </p>
        </div>
      ) : null}
      {notice ? <p className="friend-gift-notice">{notice}</p> : null}
      {error ? <p className="friend-gift-error">{error}</p> : null}
    </section>
  );
}
