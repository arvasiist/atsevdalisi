'use client';

/**
 * ARKADAŞ DAVETİ (16.10.2026, sosyal brief §7). Davet kodu + bağlantı
 * (kopyala / WhatsApp / paylaş), koşullar, davet ettiklerinin ilerlemesi ve
 * ödülleri. Kod, koşul, tavan ve ödül SUNUCUDAN gelir; "Ödülleri al" yalnızca
 * bir istektir — sunucu koşulları kilit altında yeniden denetler.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReferralOverviewView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { describeReferralStatus, referralLink, whatsappShareUrl } from '../../features/social/referral';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

export default function InvitePage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, refresh: refreshPlayer } = usePlayer();
  const [view, setView] = useState<ReferralOverviewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [origin, setOrigin] = useState('');

  const load = useCallback(async () => {
    try {
      setView(await apiClient.getReferrals());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Davet bilgileri yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (player) void load();
  }, [player, load]);

  const run = async (work: () => Promise<string>): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  if (!player) {
    return (
      <main className="invite-page">
        <GlassPanel>
          <p>{isPlayerLoading ? 'Yükleniyor…' : 'Arkadaşlarını davet etmek için önce oyuna giriş yap.'}</p>
        </GlassPanel>
      </main>
    );
  }

  const link = view && origin !== '' ? referralLink(origin, view.code) : null;
  const share = async (): Promise<void> => {
    if (link === null) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'At Sevdalısı', text: 'Benimle At Sevdalısı oyna!', url: link }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    setNotice('Bağlantı kopyalandı.');
  };

  return (
    <main className="invite-page" data-testid="invite-page">
      <h1>Arkadaş Davet Et</h1>
      {error ? (
        <p className="friend-gift-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="friend-gift-notice" role="status">
          {notice}
        </p>
      ) : null}
      {view === null && !error ? <p className="friend-gift-hint">Yükleniyor…</p> : null}

      {view ? (
        <>
          <GlassPanel>
            <h2>Davet bağlantın</h2>
            <p className="invite-code" data-testid="invite-code">
              {view.code}
            </p>
            {link ? <p className="invite-link">{link}</p> : null}
            <div className="friend-gift-row">
              <button
                type="button"
                className="btn-gold"
                disabled={link === null}
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(link ?? '')
                    .then(() => setNotice('Bağlantı kopyalandı.'))
                    .catch(() => setError('Kopyalanamadı; bağlantıyı elle seç.'))
                }
              >
                Bağlantıyı kopyala
              </button>
              {link ? (
                <a className="btn-outline" href={whatsappShareUrl(link)} target="_blank" rel="noopener noreferrer">
                  WhatsApp ile paylaş
                </a>
              ) : null}
              <button type="button" className="btn-outline" disabled={link === null} onClick={() => void share()}>
                Paylaş
              </button>
            </div>
            <p className="friend-gift-hint">
              Arkadaşın bu bağlantıyla yeni hesap açıp
              {view.conditions.requireEmailVerified ? ' e-postasını doğrulayınca ve ' : ' '}
              {view.conditions.minFinishedRaces} yarış tamamlayınca sen {formatCurrency('money', view.rewards.inviter)}, o{' '}
              {formatCurrency('money', view.rewards.invitee)} kazanır. Günde en fazla {view.maxRewardedPerInviterPerDay}, toplam{' '}
              {view.maxRewardedPerInviter} davet ödüllendirilir. Davetle gelen arkadaşınla birlikte yarışmadan da arkadaş olabilirsin.
            </p>
          </GlassPanel>

          <GlassPanel>
            <div className="friend-gift-row">
              <h2>Davet ettiklerin ({view.referrals.length})</h2>
              <button
                type="button"
                className="btn-gold"
                disabled={busy || view.claimableCount === 0}
                onClick={() =>
                  void run(async () => {
                    const result = await apiClient.claimReferralRewards();
                    await refreshPlayer();
                    return result.claimed > 0
                      ? `${result.claimed} davet ödülü alındı: +${formatCurrency('money', result.amount)}.`
                      : 'Şu an alınacak ödül yok.';
                  })
                }
              >
                {view.claimableCount > 0 ? `Ödülleri al (${view.claimableCount})` : 'Alınacak ödül yok'}
              </button>
            </div>
            <p className="friend-gift-hint">
              Alınan ödül: {view.rewardedCount}/{view.maxRewardedPerInviter} · bugün {view.rewardedToday}/
              {view.maxRewardedPerInviterPerDay}
            </p>
            {view.referrals.length === 0 ? (
              <p className="friend-gift-hint" data-testid="invite-empty">
                Henüz davetinle gelen yok. Bağlantını paylaş!
              </p>
            ) : (
              <ul className="invite-list">
                {view.referrals.map((row) => (
                  <li key={row.referralId} data-status={row.status}>
                    <Link href={`/profile/${row.invitee.username}`}>{row.invitee.displayName}</Link>
                    <span>{describeReferralStatus(row)}</span>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>

          <GlassPanel>
            <h2>Seni davet eden</h2>
            {view.invitedBy ? (
              <p>
                <Link href={`/profile/${view.invitedBy.username}`}>{view.invitedBy.displayName}</Link> ·{' '}
                {view.invitedBy.rewarded
                  ? `hoş geldin ödülün (${formatCurrency('money', view.rewards.invitee)}) alındı`
                  : 'koşulları tamamlayınca hoş geldin ödülün hesabına geçer'}
              </p>
            ) : view.canAttach ? (
              <div className="friend-gift-row">
                <input
                  className="social-search-input"
                  placeholder="Davet kodu"
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value)}
                  aria-label="Davet kodu"
                />
                <button
                  type="button"
                  className="btn-gold"
                  disabled={busy || codeInput.trim() === ''}
                  onClick={() =>
                    void run(async () => {
                      const result = await apiClient.attachReferral(codeInput.trim());
                      return `${result.inviter.displayName} kişisinin davetine bağlandın.`;
                    })
                  }
                >
                  Kodu gir
                </button>
              </div>
            ) : (
              <p className="friend-gift-hint">Davet kodu yalnızca hesap açıldıktan kısa süre sonra girilebilir.</p>
            )}
          </GlassPanel>
        </>
      ) : null}
    </main>
  );
}
