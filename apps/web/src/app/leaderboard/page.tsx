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

import { useEffect, useState } from 'react';
import type { LeaderboardRowView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

/** Podyum renkleri — 1./2./3. sıra görsel olarak ayrışsın diye. */
const PODIUM_COLORS: Record<number, string> = {
  1: 'var(--color-accent-gold)',
  2: 'var(--color-text-secondary)',
  3: 'var(--color-accent-gold)',
};

export default function LeaderboardPage(): React.ReactElement {
  const { player } = usePlayer();
  const [rows, setRows] = useState<LeaderboardRowView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // `player` bağımlılık DEĞİL: uç nokta herkese aynı küresel tabloyu
    // döner. Oyuncu bağımlılığı eklemek, giriş yapıldığında aynı veriyi
    // gereksiz yere İKİNCİ kez çekerdi.
    let cancelled = false;
    void apiClient
      .getLeaderboard()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Sıralama yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Sıralama</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Bitirilmiş yarışlardan biriken küresel puan tablosu.
      </p>

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {rows === null && !error ? <p style={{ color: 'var(--color-text-muted)' }}>Sıralama yükleniyor…</p> : null}

      {rows && rows.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 0 }}>
            Henüz bitirilmiş yarış yok. İlk yarışını koşturan sporcu bu tabloya girer.
          </p>
        </GlassPanel>
      ) : null}

      {rows && rows.length > 0 ? (
        <GlassPanel style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headerCellStyle('56px')}>#</th>
                <th style={headerCellStyle(undefined, 'left')}>Sporcu</th>
                <th style={headerCellStyle('96px', 'right')}>Puan</th>
                <th style={headerCellStyle('96px', 'right')}>Yarış</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <LeaderboardRow key={row.playerId} row={row} isCurrentPlayer={player?.id === row.playerId} />
              ))}
            </tbody>
          </table>
        </GlassPanel>
      ) : null}

      {rows && rows.length > 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-md)' }}>
          İlk {rows.length} sporcu gösteriliyor. Puanlar her yarışta birikir (galibiyet ve ilk üç derece ek puan kazandırır).
        </p>
      ) : null}
    </main>
  );
}

/**
 * Tek satır. `isCurrentPlayer` YALNIZCA görsel vurgudur — sunucudan gelen
 * hiçbir sayıyı değiştirmez, sıralamayı yeniden hesaplamaz.
 */
function LeaderboardRow({ row, isCurrentPlayer }: { row: LeaderboardRowView; isCurrentPlayer: boolean }): React.ReactElement {
  return (
    <tr
      style={{
        borderTop: '1px solid var(--color-border)',
        backgroundColor: isCurrentPlayer ? 'var(--color-bg-surface-elevated)' : 'transparent',
      }}
    >
      <td style={{ ...bodyCellStyle('56px'), color: PODIUM_COLORS[row.rank] ?? 'var(--color-text-muted)', fontWeight: 700 }}>
        {row.rank}
      </td>
      <td style={bodyCellStyle(undefined, 'left')}>
        <span style={isCurrentPlayer ? currentPlayerNameStyle : nameStyle}>
          {row.displayName}
        </span>
        {isCurrentPlayer ? <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}> (sen)</span> : null}
      </td>
      <td style={{ ...bodyCellStyle('96px', 'right'), color: 'var(--color-text-primary)', fontWeight: 600 }}>
        {row.score.toLocaleString('tr-TR')}
      </td>
      <td style={{ ...bodyCellStyle('96px', 'right'), color: 'var(--color-text-secondary)' }}>
        {row.raceCount.toLocaleString('tr-TR')}
      </td>
    </tr>
  );
}

/** Kendi satırı vurgulanırken sporcu adı kalınlaşır (bkz. `LeaderboardRow`). */
const nameStyle: React.CSSProperties = { color: 'var(--color-text-primary)' };
const currentPlayerNameStyle: React.CSSProperties = { color: 'var(--color-accent-gold)', fontWeight: 'bold' };

function headerCellStyle(width: string | undefined, align: 'left' | 'right' = 'right'): React.CSSProperties {
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

function bodyCellStyle(width: string | undefined, align: 'left' | 'right' = 'right'): React.CSSProperties {
  return { width, textAlign: align, padding: 'var(--space-md)', fontSize: '14px' };
}
