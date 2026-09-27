'use client';

/**
 * `/grandstand` — TRIBÜN (proje sahibinin açık talebi, 27.09.2026):
 * "yarış yapılan yerlerde tribüne ücretli girişler olsun insanlar
 * yarışları izleyebilsin".
 *
 * **`/replays`'ten FARKI:** orası YALNIZCA kendi koştuğun yarışları
 * gösterir (`GET /players/:id/recent-races` — katılım şartı). Burası
 * BAŞKALARININ bitmiş yarışlarını gösterir ve izlemek için bilet gerekir
 * (`GET /races/watchable` — kendi yarışların sunucu tarafında ZATEN
 * hariç tutulur, bkz. `assertRaceWatchable` OWN_RACE kuralı).
 *
 * **İzleme nereye gider:** satır, bilet ALINDIKTAN sonra `/replays/
 * [raceId]`'e bağlanır. AYRI bir seyirci izleyicisi İCAT EDİLMEDİ: o
 * sayfa zaten tam alan replay'ini `RaceViewer` (kamera yönetmeni, toz
 * VFX'i, photo finish) ile oynatıyor ve yetki kapısı `GetRaceTimeline
 * UseCase`'in KENDİSİDİR — yani bilet sahibi olmak o kapıyı AÇAR
 * (bkz. o use-case'in doc yorumu). Sunucuda yarış ANINDA tamamlandığından
 * (gerçek zamanlı simülasyon DEĞİL, paced replay — bkz. `race.gateway.ts`)
 * "canlı" ile "tekrar" arasında zaten veri farkı YOKTUR.
 *
 * **`hasTicket` neden satırda geliyor:** liste uç noktası her yarış için
 * "bu oyuncunun bileti var mı" bilgisini AYNI satırda döner; bu sayfa
 * "Bilet Al" ile "İzle" arasında seçim yapmak için satır BAŞINA ikinci
 * bir istek ATMAZ (bkz. `WatchableRaceView` doc yorumu).
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { RaceTicketView, WatchableRaceView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCost } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

export default function GrandstandPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [races, setRaces] = useState<WatchableRaceView[] | null>(null);
  const [tickets, setTickets] = useState<RaceTicketView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Satır bazlı "işleniyor" durumu — bir yarışa bilet alınırken TÜM liste kilitlenmez. */
  const [pendingRaceId, setPendingRaceId] = useState<string | null>(null);
  /** Sunucudan dönen son bakiye — `usePlayer` önbelleğini elle tazelemek yerine gösterilir. */
  const [balanceOverride, setBalanceOverride] = useState<{ money: number; gems: number } | null>(null);

  const loadAll = useCallback(async (playerId: string) => {
    const [watchable, myTickets] = await Promise.all([
      apiClient.getWatchableRaces(),
      apiClient.getMyTickets(playerId),
    ]);
    return { watchable, myTickets };
  }, []);

  useEffect(() => {
    if (!player) {
      return;
    }
    let cancelled = false;
    setRaces(null);
    setTickets(null);
    setError(null);
    void loadAll(player.id)
      .then(({ watchable, myTickets }) => {
        if (cancelled) return;
        setRaces(watchable);
        setTickets(myTickets);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Tribün yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [player, loadAll]);

  /**
   * Bilet satın alma. `Idempotency-Key` ÇAĞIRAN tarafından üretilir ve
   * yalnızca bu TEK mantıksal istek için geçerlidir — ağ hatasında
   * kullanıcı düğmeye yeniden bastığında YENİ bir anahtar üretilir, ki bu
   * doğrudur: kullanıcı YENİ bir istek başlatmıştır. (Aynı isteği
   * otomatik yeniden deneyen bir katman YOK; olsaydı anahtar dışarıdan
   * verilmeliydi.)
   */
  const buyTicket = async (race: WatchableRaceView): Promise<void> => {
    setPendingRaceId(race.raceId);
    setError(null);
    try {
      const result = await apiClient.buyRaceTicket(race.raceId, crypto.randomUUID());
      setBalanceOverride(result.newBalance);
      // Liste + biletler tazelenir: `hasTicket` artık `true` döner.
      if (player) {
        const { watchable, myTickets } = await loadAll(player.id);
        setRaces(watchable);
        setTickets(myTickets);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bilet alınamadı');
    } finally {
      setPendingRaceId(null);
    }
  };

  const money = balanceOverride?.money ?? player?.money ?? 0;

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Tribün</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Başkalarının koştuğu yarışları tribünden izle. Bilet, o yarışın tam alan tekrarını açar — katılım değildir,
        sonucu etkilemez.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Tribüne girebilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {player && races === null && !error ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Tribün hazırlanıyor…</p>
      ) : null}

      {races && races.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Şu an tribünden izlenebilecek bir yarış yok. Yeni yarışlar bittiğinde burada listelenir.
          </p>
        </GlassPanel>
      ) : null}

      {races && races.length > 0 ? (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-sm)' }}>
          {races.map((race) => {
            const isPending = pendingRaceId === race.raceId;
            const canAfford = money >= race.ticketPrice.amount;
            return (
              <li key={race.raceId}>
                <GlassPanel
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    padding: 'var(--space-md)',
                    border: race.hasTicket
                      ? '1px solid var(--color-accent-gold)'
                      : '1px solid var(--color-border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                      {race.raceName}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {race.distanceMeters}m · {surfaceLabel(race.surface)} · {race.entrantCount} katılımcı ·{' '}
                      {formatRelativeDate(race.finishedAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      Bilet: {formatCost(race.ticketPrice)}
                    </span>
                    {race.hasTicket ? (
                      <Link
                        href={`/replays/${race.raceId}`}
                        style={{ ...primaryButtonStyle(), display: 'inline-block', textDecoration: 'none' }}
                      >
                        İzle
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void buyTicket(race)}
                        disabled={isPending || !canAfford}
                        title={canAfford ? undefined : 'Bakiyen bu bileti almaya yetmiyor'}
                        style={{
                          ...primaryButtonStyle(),
                          opacity: isPending || !canAfford ? 0.55 : 1,
                          cursor: isPending || !canAfford ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isPending ? 'Alınıyor…' : 'Bilet Al'}
                      </button>
                    )}
                  </div>
                </GlassPanel>
              </li>
            );
          })}
        </ol>
      ) : null}

      {tickets && tickets.length > 0 ? (
        <>
          <h2
            style={{
              fontSize: '18px',
              color: 'var(--color-text-primary)',
              marginTop: 'var(--space-xl)',
              marginBottom: 'var(--space-sm)',
            }}
          >
            Biletlerim
          </h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-sm)' }}>
            {tickets.map((ticket) => (
              <li key={ticket.ticketId}>
                <Link href={`/replays/${ticket.raceId}`} style={{ textDecoration: 'none' }}>
                  <GlassPanel
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 'var(--space-sm)',
                      padding: 'var(--space-sm) var(--space-md)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      {ticket.raceName}
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {' '}
                        · {formatRelativeDate(ticket.purchasedAt)} alındı
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {formatCost({ currency: ticket.currency, amount: ticket.price })}
                    </span>
                  </GlassPanel>
                </Link>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </main>
  );
}

function surfaceLabel(surface: string): string {
  switch (surface) {
    case 'grass':
      return 'Çim';
    case 'dirt':
      return 'Toprak';
    case 'synthetic':
      return 'Sentetik';
    default:
      return surface;
  }
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < MS_PER_MINUTE) return 'az önce';
  if (diffMs < MS_PER_HOUR) return `${Math.floor(diffMs / MS_PER_MINUTE)} dk önce`;
  if (diffMs < MS_PER_DAY) return `${Math.floor(diffMs / MS_PER_HOUR)} sa önce`;
  return `${Math.floor(diffMs / MS_PER_DAY)} gün önce`;
}

function primaryButtonStyle(): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '12px 24px',
    background: 'var(--color-accent-gold)',
    color: '#1a1405',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
  };
}
