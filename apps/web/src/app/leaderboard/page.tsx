'use client';

/**
 * Sıralama — brief §43 "Sıralamalar" (bu turda GERÇEKTEN BAĞLANDI).
 *
 * ÖNCEDEN: bu rota `ComingSoon` yer tutucusuydu ve dosya başındaki not
 * "hiçbir HTTP controller'ı yok" diyordu. O not DOĞRUYDU — `LeaderboardEntry`/
 * `RankedLeaderboardEntry` türleri ve `domain/ranking/leaderboard.ts` saf
 * mantığı brief §43'ten beri VARDI ama bunları dışa açan bir uç nokta
 * yoktu. Bu turda `GET /leaderboard` eklendi (bkz. `leaderboard.controller.ts`,
 * `get-leaderboard.use-case.ts`) ve bu ekran ona bağlandı.
 *
 * Bu bileşen HİÇBİR PUAN HESAPLAMAZ. Puanlama formülü (`calculateRankingScore`)
 * ve sıralama (`buildLeaderboard`) sunucuda, `domain/ranking/`'de koşar
 * (CLAUDE.md "SUNUCU OTORİTESİ"). İstemci yalnızca gelen `rank`/`score`/
 * `raceCount` alanlarını GÖSTERİR; sıralamayı yeniden türetmez, kırpmaz.
 *
 * Uç nokta `@Public()`'tir — kişiye özel veri taşımaz, bu yüzden oturum
 * açmamış bir ziyaretçi de panoyu görebilir. `usePlayer()` yalnızca
 * KENDİ SATIRINI vurgulamak için kullanılır; oyuncu yokken de tablo dolar.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { LeaderboardRowView, SeasonView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { formatTimeUntil } from '../../lib/format-time';
import { usePlayer } from '../../lib/player-context';

/** Podyum renkleri — 1./2./3. sıra görsel olarak ayrışsın diye. */
const PODIUM_COLORS: Record<number, string> = {
  1: 'var(--color-accent-gold)',
  2: 'var(--color-text-secondary)',
  3: 'var(--color-accent-gold)',
};

export default function LeaderboardPage(): React.ReactElement {
  const { player } = usePlayer();
  const [globalRows, setGlobalRows] = useState<LeaderboardRowView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 01.10.2026 — Genel / Sezon sekmesi. Sezon ucu oturum ister; oyuncu yoksa sekme gösterilmez. */
  const [tab, setTab] = useState<'global' | 'season'>('global');
  const [season, setSeason] = useState<SeasonView | null>(null);
  const rows = tab === 'season' ? (season?.standings ?? null) : globalRows;
  /** Satır bazlı "istek gönderiliyor" durumu — tek bir satır TÜM tabloyu kilitlemez. */
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  /** Bu oturumda istek gönderilen oyuncular (`Arkadaş Ekle` → `İstek Gönderildi`). */
  const [requested, setRequested] = useState<readonly string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * Arkadaşlık isteği gönderir (proje sahibinin talebi, 27.09.2026).
   *
   * **NEDEN BURADA:** sıralama tablosu, başka oyuncuların kimliğini
   * (`playerId`) GÖREN keşif yüzeyidir — `LeaderboardRowView` `playerId`,
   * `username` ve `displayName` taşır (bkz. `packages/shared-types/src/
   * online.ts`). Ayrı bir "oyuncu ara" uç noktası İCAT EDİLMEDİ: öyle bir
   * uç nokta, tüm görünen adları numaralandırmaya (enumeration) açık yeni
   * bir yüzey olurdu. Mevcut `@Public()` sıralama tablosu zaten herkese
   * açık olan veriyi kullanır.
   *
   * (29.09.2026) Sıralama tablosu artık keşfin TEK yüzeyi DEĞİLDİR: satır
   * adı `/profile/:username`e bağlanır ve oradan da arkadaşlık/engel
   * işlemleri yapılabilir. "Tek yüzey" ifadesi bu yüzden kaldırıldı —
   * bayat bir yorum, olmayan bir kısıtı anlatır.
   *
   * `Idempotency-Key` YOKTUR — bu uç nokta para/mülkiyet değiştirmez
   * (bkz. `SocialController` doc yorumu). Spam savunması sunucudaki
   * `@RateLimit`'tir (20 istek/dk) ve bekleyen istek tavanıdır
   * (`SOCIAL_LIMIT_REACHED`).
   */
  const addFriend = useCallback(
    async (targetId: string): Promise<void> => {
      if (!player) return;
      setPendingPlayerId(targetId);
      setActionError(null);
      try {
        await apiClient.sendFriendRequest(player.id, targetId);
        setRequested((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'İstek gönderilemedi');
      } finally {
        setPendingPlayerId(null);
      }
    },
    [player],
  );

  useEffect(() => {
    // `player` bağımlılık DEĞİL: uç nokta herkese aynı küresel tabloyu
    // döner. Oyuncu bağımlılığı eklemek, giriş yapıldığında aynı veriyi
    // gereksiz yere İKİNCİ kez çekerdi.
    let cancelled = false;
    void apiClient
      .getLeaderboard()
      .then((data) => {
        if (!cancelled) setGlobalRows(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Sıralama yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== 'season' || !player || season) return;
    apiClient
      .getCurrentSeason()
      .then(setSeason)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Sezon yüklenemedi'));
  }, [tab, player, season]);

  return (
    <main className="page-container">
      <h1 className="page-title">Sıralama</h1>
      <p
        style={{
          color: 'var(--color-text-secondary)',
          marginTop: 4,
          marginBottom: 'var(--space-md)',
        }}
      >
        {tab === 'season'
          ? 'Yalnızca bu sezon koşulan yarışların puanı. Sezon bitince ilk sıralar çip ödülü alır.'
          : 'Bitirilmiş yarışlardan biriken küresel puan tablosu.'}
      </p>

      {player ? (
        <div
          className="tabs"
          role="tablist"
          aria-label="Sıralama türü"
          style={{ marginBottom: 'var(--space-md)' }}
        >
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'global'}
            onClick={() => setTab('global')}
          >
            Genel
          </button>
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'season'}
            onClick={() => setTab('season')}
          >
            Sezon
          </button>
        </div>
      ) : null}

      {tab === 'season' && season ? <SeasonHeader season={season} /> : null}

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}
      {actionError ? <p style={{ color: 'var(--color-status-critical)' }}>{actionError}</p> : null}

      {rows === null && !error ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Sıralama yükleniyor…</p>
      ) : null}

      {rows && rows.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 0 }}>
            {tab === 'season'
              ? 'Bu sezon henüz yarış koşulmadı — ilk yarışını koşturan zirveye oturur.'
              : 'Henüz bitirilmiş yarış yok. İlk yarışını koşturan sporcu bu tabloya girer.'}
          </p>
        </GlassPanel>
      ) : null}

      {rows && rows.length > 0 ? (
        <GlassPanel style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headerCellStyle('56px')}>#</th>
                <th style={headerCellStyle(undefined, 'left')}>Sporcu</th>
                <th style={headerCellStyle('96px', 'right')}>Puan</th>
                <th style={headerCellStyle('96px', 'right')}>Yarış</th>
                <th style={headerCellStyle('128px', 'right')}>Arkadaş</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <LeaderboardRow
                  key={row.playerId}
                  row={row}
                  isCurrentPlayer={player?.id === row.playerId}
                  canAddFriend={player !== null && player.id !== row.playerId}
                  isRequested={requested.includes(row.playerId)}
                  isPending={pendingPlayerId === row.playerId}
                  onAddFriend={addFriend}
                />
              ))}
            </tbody>
          </table>
        </GlassPanel>
      ) : null}

      {rows && rows.length > 0 ? (
        <p
          style={{
            color: 'var(--color-text-muted)',
            fontSize: '13px',
            marginTop: 'var(--space-md)',
          }}
        >
          İlk {rows.length} sporcu gösteriliyor. Puanlar her yarışta birikir (galibiyet ve ilk üç
          derece ek puan kazandırır).
        </p>
      ) : null}
    </main>
  );
}

/**
 * Tek satır. `isCurrentPlayer` YALNIZCA görsel vurgudur — sunucudan gelen
 * hiçbir sayıyı değiştirmez, sıralamayı yeniden hesaplamaz.
 */
function LeaderboardRow({
  row,
  isCurrentPlayer,
  canAddFriend,
  isRequested,
  isPending,
  onAddFriend,
}: {
  row: LeaderboardRowView;
  isCurrentPlayer: boolean;
  canAddFriend: boolean;
  isRequested: boolean;
  isPending: boolean;
  onAddFriend: (playerId: string) => void;
}): React.ReactElement {
  return (
    <tr
      style={{
        borderTop: '1px solid var(--color-border)',
        backgroundColor: isCurrentPlayer ? 'var(--color-bg-surface-elevated)' : 'transparent',
      }}
    >
      <td
        style={{
          ...bodyCellStyle('56px'),
          color: PODIUM_COLORS[row.rank] ?? 'var(--color-text-muted)',
          fontWeight: 700,
        }}
      >
        {row.rank}
      </td>
      <td style={bodyCellStyle(undefined, 'left')}>
        {/*
          Ad artık BAŞKA BİR OYUNCUNUN PROFİLİNE giden yoldur (29.09.2026).
          Bunu mümkün kılan şey `LeaderboardRowView.username`dir — görünen
          ad bir URL olamaz (boşluk/aksak karakter). Bağlantı SUNUCUDAN
          gelen `username`i olduğu gibi kullanır; istemci bir slug
          ÜRETMEZ (türetilen bir slug, profil ucunun 404 vermesine yol
          açardı ve bu hiçbir yerde hata üretmezdi).
        */}
        <Link
          href={`/profile/${row.username}`}
          style={isCurrentPlayer ? currentPlayerNameLinkStyle : nameLinkStyle}
        >
          {row.displayName}
        </Link>
        {isCurrentPlayer ? (
          <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}> (sen)</span>
        ) : null}
      </td>
      <td
        style={{
          ...bodyCellStyle('96px', 'right'),
          color: 'var(--color-text-primary)',
          fontWeight: 600,
        }}
      >
        {row.score.toLocaleString('tr-TR')}
      </td>
      <td style={{ ...bodyCellStyle('96px', 'right'), color: 'var(--color-text-secondary)' }}>
        {row.raceCount.toLocaleString('tr-TR')}
      </td>
      <td style={bodyCellStyle('128px', 'right')}>
        {canAddFriend ? (
          <button
            type="button"
            onClick={() => onAddFriend(row.playerId)}
            disabled={isPending || isRequested}
            style={addFriendButtonStyle(isPending || isRequested)}
          >
            {isRequested ? 'İstek Gönderildi' : isPending ? 'Gönderiliyor…' : 'Arkadaş Ekle'}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * "Arkadaş Ekle" düğmesi — tribündeki `Bilet Al` ile AYNI desen: istek
 * sürerken ve gönderildikten sonra devre dışı kalır (çift tıklama
 * `FRIENDSHIP_ALREADY_EXISTS` 409'u üretmesin).
 */
function addFriendButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: 'transparent',
    color: 'var(--color-accent-gold)',
    border: '1px solid var(--color-accent-gold)',
    borderRadius: 'var(--radius-md)',
    fontSize: '12px',
    fontWeight: 600,
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  };
}

/** Kendi satırı vurgulanırken sporcu adı kalınlaşır (bkz. `LeaderboardRow`). */
/**
 * Ad bağlantısı. `textDecoration: 'none'` BİLİNÇLİDİR: tablonun tamamı
 * bağlantı olsaydı okunaksız görünürdü; bağlantı olduğu yalnızca fareyle
 * üzerine gelindiğinde (`hover` rengi CSS'te `a` için tanımlıdır) belli
 * olur. Renkler eski `nameStyle`/`currentPlayerNameStyle` ile AYNIdır —
 * bu değişiklik yalnızca tıklanabilirlik ekler, görünümü değiştirmez.
 */
const nameLinkStyle: React.CSSProperties = {
  color: 'var(--color-text-primary)',
  textDecoration: 'none',
};
const currentPlayerNameLinkStyle: React.CSSProperties = {
  color: 'var(--color-accent-gold)',
  fontWeight: 'bold',
  textDecoration: 'none',
};

function headerCellStyle(
  width: string | undefined,
  align: 'left' | 'right' = 'right',
): React.CSSProperties {
  return {
    width,
    textAlign: align,
    padding: 'var(--space-md)',
    color: 'var(--color-text-muted)',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
}

function bodyCellStyle(
  width: string | undefined,
  align: 'left' | 'right' = 'right',
): React.CSSProperties {
  return { width, textAlign: align, padding: 'var(--space-md)', fontSize: '14px' };
}

/**
 * Sezon başlığı (01.10.2026): kalan süre, oyuncunun sırası ve olası ödülü,
 * ödül tablosu ve önceki sezonun podyumu. Bütün sayılar sunucudan gelir.
 */
function SeasonHeader({ season }: { season: SeasonView }): React.ReactElement {
  const muted: React.CSSProperties = { color: 'var(--color-text-secondary)', fontSize: 13 };
  return (
    <GlassPanel style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-md)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'baseline',
        }}
      >
        <h2 className="section-title" style={{ margin: 0 }}>
          {season.season.name}
        </h2>
        <span style={{ ...muted, color: 'var(--color-accent-gold)' }}>
          Bitişe {formatTimeUntil(season.season.endsAt)}
        </span>
      </div>
      <p style={{ ...muted, margin: 'var(--space-sm) 0' }}>
        {season.me
          ? `Sıran: ${season.me.rank}. · ${season.me.score.toLocaleString('tr-TR')} puan · ${season.me.raceCount} yarış${
              season.me.reward > 0
                ? ` · şu an ${formatCurrency('money', season.me.reward)} ödül sırasındasın`
                : ''
            }`
          : 'Bu sezon henüz yarışmadın — bir yarış koş, tabloya gir.'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {season.rewardsByRank.map((amount, index) => (
          <span
            key={index}
            style={{
              fontSize: 12,
              padding: '3px 8px',
              borderRadius: 999,
              border: '1px solid var(--color-border-gold, rgba(212,175,55,0.35))',
              color: index < 3 ? 'var(--color-accent-gold)' : 'var(--color-text-secondary)',
            }}
          >
            {index + 1}. {formatCurrency('money', amount)}
          </span>
        ))}
      </div>
      {season.previous && season.previous.podium.length > 0 ? (
        <p style={{ ...muted, marginBottom: 0, marginTop: 'var(--space-sm)' }}>
          {season.previous.season.name} şampiyonları:{' '}
          {season.previous.podium.map((row) => `${row.rank}. ${row.displayName}`).join(' · ')}
        </p>
      ) : null}
    </GlassPanel>
  );
}
