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
 * **İzleme nereye gider (PHASE 7.5'te DEĞİŞTİ, 29.09.2026):** satır artık
 * `/races/[raceId]/watch`'a bağlanır, `/replays/[raceId]`'e DEĞİL. Eski
 * hedef statik bir HTTP tekrarıydı (`RaceViewer`, soket yok) ve bu, sunucuda
 * var olan "izleyici" kavramını istemcide ÖLÜ bırakıyordu: `race:${raceId}`
 * odası hiç dolmuyordu, yani `race.spectators` sayısı izleyiciyi GÖRMÜYOR
 * ve tribün sohbeti çalışmıyordu. Yeni hedef `LiveRaceViewer`'ı mount eder
 * → `race.subscribe` gönderir → izleyici gerçekten odaya girer. **Yetki
 * kapısı DEĞİŞMEDİ ve İKİNCİ KEZ YAZILMADI:** `race.subscribe` sunucuda
 * `GetRaceTimelineUseCase.execute` çağırır, yani `GET /races/:id/timeline`
 * ile AYNI kapıdır (bkz. `race.gateway.ts` → `handleSubscribe`).
 * `/replays/[raceId]` KATILIMCININ kendi tekrarı olarak KALIR.
 *
 * **`hasTicket` neden satırda geliyor:** liste uç noktası her yarış için
 * "bu oyuncunun bileti var mı" bilgisini AYNI satırda döner; bu sayfa
 * "Bilet Al" ile "İzle" arasında seçim yapmak için satır BAŞINA ikinci
 * bir istek ATMAZ (bkz. `WatchableRaceView` doc yorumu).
 *
 * **PHASE 7.4 (29.09.2026) — üç eksik kapatıldı:**
 *  1. **Ücretsiz tribün.** `ticketPrice.amount === 0` ise (lobi sahibi
 *     `tribuneFeeOptions`'tan `0` seçtiyse) bilet GEREKMEZ ve satın alma
 *     ucu 409 `RACE_TRIBUNE_FREE` döner. Eski ekran bu satırda da "Bilet
 *     Al" gösteriyordu — yani sunucunun reddedeceği bir düğme. Artık
 *     doğrudan "İzle" gösterilir.
 *  2. **Kalan koltuk.** `spectatorCapacity - ticketsSold` satırda
 *     gösterilir; kapasite dolduysa düğme kilitlenir (kararı SUNUCU verir,
 *     `409 RACE_TRIBUNE_FULL` — buradaki yalnızca düğme durumudur).
 *     **Ücretsiz tribünde gösterilmez:** bilet alınmadığı için
 *     `assertTribuneHasRoom` hiç çalışmaz, yani orada bir kapasite sınırı
 *     YOKTUR ve "500 koltuk kaldı" yazmak uydurma bir sınır olurdu.
 *  3. **İade.** "Biletlerim" satırında iade düğmesi
 *     (`DELETE /races/:id/tickets`). Tutarı sunucu biletin kendi
 *     `price`'ından okur; ekran yalnızca dönen yeni bakiyeyi gösterir.
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
  /** İade işlenirken kilitlenen bilet — satın almadan AYRI tutulur, ikisi aynı anda olmaz. */
  const [refundingTicketId, setRefundingTicketId] = useState<string | null>(null);
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

  /**
   * Bilet iadesi ("tribünden ayrıl"). `Idempotency-Key` her basışta YENİ
   * üretilir — `buyTicket` ile AYNI sınıf ve BİLİNÇLİ: bu bir GELİR
   * yoludur, yani anahtarın kaybolması hâlinde oluşacak ikinci istek
   * sunucuda `DELETE ... RETURNING`in 0 satır dönmesiyle 404'e düşer
   * (çift iade imkânsız). `wallet/page.tsx`'in "anahtarı başarısızlıkta
   * sakla" kuralı oradaki risk İKİNCİ BİR PARA GİRİŞİ olduğu içindir;
   * burada öyle bir risk yok.
   */
  const refundTicket = async (ticket: RaceTicketView): Promise<void> => {
    setRefundingTicketId(ticket.ticketId);
    setError(null);
    try {
      const result = await apiClient.refundRaceTicket(ticket.raceId, crypto.randomUUID());
      setBalanceOverride(result.newBalance);
      // Liste + biletler tazelenir: satır artık "Bilet Al" gösterir.
      if (player) {
        const { watchable, myTickets } = await loadAll(player.id);
        setRaces(watchable);
        setTickets(myTickets);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bilet iade edilemedi');
    } finally {
      setRefundingTicketId(null);
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
            // PHASE 7.4 — ücretsiz tribün (bkz. dosya başı doc yorumu).
            const isFree = race.ticketPrice.amount === 0;
            const canAfford = money >= race.ticketPrice.amount;
            // Kalan koltuk yalnızca ÜCRETLİ tribünde anlamlıdır: ücretsizde
            // bilet alınmadığı için `assertTribuneHasRoom` hiç çalışmaz.
            const seatsLeft = Math.max(0, race.spectatorCapacity - race.ticketsSold);
            const isFull = !race.hasTicket && !isFree && seatsLeft === 0;
            const canBuy = !isPending && !isFull && canAfford;
            const buyBlockReason = isFull
              ? 'Tribün doldu'
              : canAfford
                ? undefined
                : 'Bakiyen bu bileti almaya yetmiyor';
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
                      {/* Ücretsiz tribünde koltuk sayısı GÖSTERİLMEZ (bkz. dosya başı doc yorumu madde 2). */}
                      {isFree ? null : ` · ${seatsLeft} koltuk kaldı`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      {isFree ? 'Ücretsiz' : `Bilet: ${formatCost(race.ticketPrice)}`}
                    </span>
                    {race.hasTicket || isFree ? (
                      <Link
                        href={`/races/${race.raceId}/watch`}
                        style={{ ...primaryButtonStyle(), display: 'inline-block', textDecoration: 'none' }}
                      >
                        İzle
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void buyTicket(race)}
                        disabled={!canBuy}
                        title={buyBlockReason}
                        style={{
                          ...primaryButtonStyle(),
                          opacity: canBuy ? 1 : 0.55,
                          cursor: canBuy ? 'pointer' : 'not-allowed',
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
            {tickets.map((ticket) => {
              const isRefunding = refundingTicketId === ticket.ticketId;
              return (
                <li key={ticket.ticketId}>
                  <GlassPanel
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 'var(--space-sm)',
                      padding: 'var(--space-sm) var(--space-md)',
                    }}
                  >
                    <Link
                      href={`/races/${ticket.raceId}/watch`}
                      style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}
                    >
                      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        {ticket.raceName}
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {' '}
                          · {formatRelativeDate(ticket.purchasedAt)} alındı
                        </span>
                      </div>
                    </Link>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {formatCost({ currency: ticket.currency, amount: ticket.price })}
                    </span>
                    <button
                      type="button"
                      onClick={() => void refundTicket(ticket)}
                      disabled={isRefunding}
                      title="Bileti iade et — ücret bakiyene geri döner"
                      style={{
                        ...secondaryButtonStyle(),
                        opacity: isRefunding ? 0.55 : 1,
                        cursor: isRefunding ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isRefunding ? 'İade ediliyor…' : 'İade Et'}
                    </button>
                  </GlassPanel>
                </li>
              );
            })}
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

/**
 * İade düğmesi için İKİNCİL stil — birincil (altın) düğme satın almayı
 * temsil eder; iade yıkıcı/geri alıcı bir işlemdir ve aynı görsel ağırlıkta
 * olmamalıdır (kullanıcı yanlışlıkla basmasın).
 */
function secondaryButtonStyle(): React.CSSProperties {
  return {
    minHeight: '36px',
    padding: '8px 16px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 600,
    fontSize: '12px',
    cursor: 'pointer',
  };
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
