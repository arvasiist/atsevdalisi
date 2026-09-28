'use client';

/**
 * CÜZDAN EKRANI — brief §20 "WALLET SYSTEM", §22 "TRANSACTION LOG",
 * §35 `/wallet`, §42 PHASE 4 (28.09.2026).
 *
 * ## Backend ZATEN VARDI; eksik olan yalnızca tüketiciydi
 *
 * `apps/api/src/api/economy/economy.controller.ts` üç uç nokta sunar ve
 * üçünün de istemci tüketicisi YOKTU:
 *
 *   - `GET  /players/:id/wallet`         → bakiye + işlem geçmişi
 *   - `POST /players/:id/wallet/deposit` → sanal para yükleme
 *   - `POST /players/:id/daily-reward`   → günlük ödül
 *
 * Bu sayfa yalnızca onları bağlar; hiçbir finansal hesap BURADA yapılmaz
 * (brief §22 "Tüm finansal hesaplamalar backend'de yapılmalı"). Bakiye
 * sunucunun döndürdüğü `newBalance`'tan okunur, istemci toplama/çıkarma
 * yapmaz.
 *
 * ## `mock_deposit` bir OYUNCAK değil, bir SINIRDIR
 *
 * Yükleme sanaldır (brief §41 "önce Virtual Coin / Mock Wallet", §21
 * "gerçek para entegrasyonunu doğrudan hard-code etme") ve `NODE_ENV=
 * production` altında uç nokta KAPALIDIR. Bu yüzden ekranda "gerçek para"
 * izlenimi veren hiçbir ifade yoktur; sağlayıcı adı (`providerId`) de
 * yanıttan okunur ve gösterilir — sunucu gerçek bir sağlayıcıya geçtiğinde
 * ekran kendiliğinden doğru adı yazar.
 *
 * ## SİHİRLİ SAYI YOK
 *
 * Alt/üst yükleme sınırı ve geçmiş sayfa boyutu `config/economy.config.json`
 * → `loadEconomyConfig()`'ten okunur. `100`/`50000` gibi değerleri buraya
 * gömmek, sunucu politikası değiştiğinde istemciyi yalancı duruma
 * düşürürdü (sunucu reddederken ekran "geçerli" derdi).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadEconomyConfig } from '@at-sevdalisi/game-config';
import type { ClaimDailyRewardResult, WalletTransaction, WalletView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { FEED_TYPE_LABELS } from '../../features/care/feed-labels';
import { describeLedgerType } from '../../features/wallet/ledger-labels';
import { apiClient } from '../../lib/api-client';
import { CURRENCY_LABELS, formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

const economyConfig = loadEconomyConfig();

/** Sunucunun varsayılan sayfa boyutu — istemci kendi boyutunu UYDURMAZ. */
const HISTORY_LIMIT = economyConfig.walletHistoryDefaultLimit;

/** Yükleme politikası: kill switch + aralık. Hepsi config'ten. */
const DEPOSIT = economyConfig.mockDeposit;

export default function WalletPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();

  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Son başarılı mutasyonun kullanıcıya gösterilen özeti. */
  const [notice, setNotice] = useState<string | null>(null);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [amountInput, setAmountInput] = useState<string>(String(DEPOSIT.minAmount));

  /**
   * ⚠️ `Idempotency-Key` BAŞARISIZ DENEMEDE ATILMAZ, SAKLANIR.
   *
   * Bu, `grandstand/page.tsx`'teki "her basışta yeni anahtar" kararından
   * BİLEREK AYRILIR. Orada zarar "ikinci bir bilet"ti; burada zarar
   * "ikinci bir PARA GİRİŞİ"dir ve senaryo gerçektir: sunucu yatırımı
   * yazıp yanıt ağda kaybolursa, kullanıcı düğmeye yeniden basar. Yeni bir
   * anahtar üretilseydi deftere İKİNCİ bir `mock_deposit` satırı düşerdi ve
   * bu hiçbir yerde hata üretmezdi.
   *
   * Kural: anahtar, TUTAR DEĞİŞTİĞİNDE ya da işlem BAŞARIYLA bittiğinde
   * bırakılır; başarısızlıkta yaşar. Böylece "aynı mantıksal isteğin
   * tekrarı" sunucuda aynı anahtarla karşılaşır ve tek satır yazılır.
   */
  const depositKeyRef = useRef<string | null>(null);

  const loadWallet = useCallback(async (playerId: string) => {
    return apiClient.getWallet(playerId, HISTORY_LIMIT);
  }, []);

  useEffect(() => {
    if (!player) {
      return;
    }
    let cancelled = false;
    setWallet(null);
    setError(null);
    void loadWallet(player.id)
      .then((data) => {
        if (!cancelled) setWallet(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Cüzdan yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [player, loadWallet]);

  /** Tutar değişince bekleyen anahtar bırakılır — yeni bir mantıksal istektir. */
  const onAmountChange = (value: string): void => {
    setAmountInput(value);
    depositKeyRef.current = null;
    setNotice(null);
  };

  const deposit = async (): Promise<void> => {
    if (!player) {
      return;
    }
    setIsDepositing(true);
    setError(null);
    setNotice(null);
    try {
      const parsed = Number(amountInput);
      if (depositKeyRef.current === null) {
        depositKeyRef.current = crypto.randomUUID();
      }
      const result = await apiClient.depositFunds(player.id, parsed, depositKeyRef.current);
      // Başarılı — anahtar TÜKENDİ. Yeni bir yatırma yeni bir anahtar alır.
      depositKeyRef.current = null;
      setNotice(
        `${formatCurrency(result.currency, result.amount)} yüklendi. İşlem no: ${result.transactionId} (sağlayıcı: ${result.providerId})`,
      );
      setWallet(await loadWallet(player.id));
    } catch (err: unknown) {
      // Anahtar BİLEREK korunur: kullanıcı yeniden denerse aynı mantıksal
      // istek olarak gider ve sunucu ikinci satırı yazmaz.
      setError(err instanceof Error ? err.message : 'Yükleme yapılamadı');
    } finally {
      setIsDepositing(false);
    }
  };

  const claimDailyReward = async (): Promise<void> => {
    if (!player) {
      return;
    }
    setIsClaiming(true);
    setError(null);
    setNotice(null);
    try {
      // `Idempotency-Key` GÖNDERİLMEZ: uç noktanın kendi tekrar koruması
      // vardır (günlük cooldown → 409). Bkz. `api-client.ts` doc yorumu.
      const result: ClaimDailyRewardResult = await apiClient.claimDailyReward(player.id);
      // Ham `FeedType` (`havuc`) oyuncuya gösterilmez — ortak etiket
      // haritası kullanılır (`features/care/feed-labels.ts`, ikinci
      // tüketici olduğu için oraya taşındı).
      const feed = result.grantedFeed
        .map((item) => `${item.count} adet ${FEED_TYPE_LABELS[item.type]}`)
        .join(', ');
      setNotice(
        `Günlük ödül alındı: ${formatCurrency(result.currency, result.amount)}${feed.length > 0 ? ` + ${feed}` : ''}`,
      );
      setWallet(await loadWallet(player.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Günlük ödül alınamadı');
    } finally {
      setIsClaiming(false);
    }
  };

  const money = wallet?.money ?? player?.money ?? 0;
  const gems = wallet?.gems ?? player?.gems ?? 0;

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Cüzdan</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Bakiyen ve her para hareketinin kaydı. Tutarlar sunucudan gelir; bu ekran hiçbir hesabı kendisi yapmaz.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Cüzdanı görebilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}
      {notice ? <p style={{ color: 'var(--color-accent-gold)' }}>{notice}</p> : null}

      {player ? (
        <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
          <GlassPanel style={{ padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
              <BalanceBox label={CURRENCY_LABELS.money} value={money} />
              <BalanceBox label={CURRENCY_LABELS.gems} value={gems} />
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', margin: 'var(--space-sm) 0 0' }}>
              Çip ve Elmas AYRI bakiyelerdir ve birbirine çevrilemez (brief §14).
            </p>
          </GlassPanel>

          <GlassPanel style={{ padding: 'var(--space-lg)' }}>
            <h2 style={sectionTitleStyle}>Günlük Ödül</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: 0 }}>
              Günde bir kez. Tekrar denerseniz sunucu reddeder — bu düğme ikinci bir ödül üretmez.
            </p>
            <button
              type="button"
              onClick={() => void claimDailyReward()}
              disabled={isClaiming}
              style={primaryButtonStyle}
            >
              {isClaiming ? 'Alınıyor…' : 'Günlük Ödülü Al'}
            </button>
          </GlassPanel>

          {DEPOSIT.enabled ? (
            <GlassPanel style={{ padding: 'var(--space-lg)' }}>
              <h2 style={sectionTitleStyle}>Sanal Para Yükle</h2>
              {/* ⚠️ Bu bir SANAL yatırmadır ve ekran bunu gizlemez. Üretimde
                  uç nokta kapalıdır (NODE_ENV=production); `providerId`
                  yanıttan okunup yukarıdaki bildirimde gösterilir. */}
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: 0 }}>
                Bu bir <strong>oyun içi (sanal)</strong> yüklemedir; gerçek para karşılığı yoktur. Tek işlemde{' '}
                {formatCurrency('money', DEPOSIT.minAmount)} – {formatCurrency('money', DEPOSIT.maxAmount)} arası.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                <label htmlFor="deposit-amount" style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Tutar
                </label>
                <input
                  id="deposit-amount"
                  type="number"
                  inputMode="numeric"
                  min={DEPOSIT.minAmount}
                  max={DEPOSIT.maxAmount}
                  step={1}
                  value={amountInput}
                  onChange={(event) => onAmountChange(event.target.value)}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => void deposit()}
                  disabled={isDepositing}
                  style={primaryButtonStyle}
                >
                  {isDepositing ? 'Yükleniyor…' : 'Yükle'}
                </button>
              </div>
            </GlassPanel>
          ) : (
            <GlassPanel style={{ padding: 'var(--space-lg)' }}>
              <h2 style={sectionTitleStyle}>Sanal Para Yükle</h2>
              <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '13px' }}>
                Bu sunucuda para yükleme kapalıdır. Var olan bakiyenle oynamaya devam edebilirsin.
              </p>
            </GlassPanel>
          )}

          <GlassPanel style={{ padding: 'var(--space-lg)' }}>
            <h2 style={sectionTitleStyle}>İşlem Geçmişi</h2>
            {wallet === null && !error ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Yükleniyor…</p>
            ) : null}
            {wallet !== null && wallet.transactions.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '13px' }}>
                Henüz bir para hareketi yok.
              </p>
            ) : null}
            {wallet !== null && wallet.transactions.length > 0 ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-xs)' }}>
                {wallet.transactions.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </ul>
            ) : null}
            {wallet !== null && wallet.hasMore ? (
              /* `hasMore` SUNUCUDAN gelir (bkz. `WalletView` doc yorumu) —
                 "satır sayısı === limit" diye tahmin EDİLMEZ. */
              <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', margin: 'var(--space-sm) 0 0' }}>
                Yalnızca son {HISTORY_LIMIT} hareket gösteriliyor.
              </p>
            ) : null}
          </GlassPanel>
        </div>
      ) : null}
    </main>
  );
}

/**
 * Tek bir defter satırı. Yön (borç/alacak) `amount` İŞARETİNDEN okunur ve
 * `balanceAfter` ile BİRLİKTE gösterilir: oyuncunun "o an ne kadar vardı"
 * sorusunu cevaplayan tek alan sunucunun yazdığı bu değerdir.
 */
function TransactionRow({ transaction }: { transaction: WalletTransaction }): React.ReactElement {
  const isCredit = transaction.amount > 0;
  return (
    <li
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--space-sm)',
        padding: 'var(--space-xs) 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
          {describeLedgerType(transaction.type)}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {formatDateTime(transaction.createdAt)} · {transaction.canonicalType}
        </div>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: isCredit ? 'var(--color-status-positive)' : 'var(--color-status-critical)',
          }}
        >
          {isCredit ? '+' : '−'}
          {formatCurrency(transaction.currency, Math.abs(transaction.amount))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          kalan: {formatCurrency(transaction.currency, transaction.balanceAfter)}
        </div>
      </div>
    </li>
  );
}

function BalanceBox({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
        {value.toLocaleString('tr-TR')}
      </div>
    </div>
  );
}

/**
 * `Intl` yerine `toLocaleString` + sabit biçim: sunucu `tr-TR` bekliyor ve
 * tarih yalnızca okunurluk için — karşılaştırma/sıralama YAPILMAZ (sıra
 * sunucudan gelir).
 */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  color: 'var(--color-text-primary)',
  margin: '0 0 var(--space-xs)',
};

const inputStyle: React.CSSProperties = {
  minHeight: '36px',
  width: '140px',
  padding: '0 var(--space-sm)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-surface)',
  color: 'var(--color-text-primary)',
  fontSize: '13px',
};

const primaryButtonStyle: React.CSSProperties = {
  minHeight: '36px',
  padding: '0 var(--space-md)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-accent-gold)',
  background: 'transparent',
  color: 'var(--color-accent-gold)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};
