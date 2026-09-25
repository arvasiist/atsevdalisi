'use client';

/**
 * Online (PvP) — daha önce dürüst bir "yakında" placeholder'ıydı, ama
 * backend (`MatchmakingModule`, `domain/online/{matchmaking,elo,
 * race-room}.ts`) FAZ 1 wiring'in on dördüncü diliminden beri TAM
 * ÇALIŞIR durumdaydı — `claude/hizli-bitirme-plani.md` madde 3: yeni
 * backend YAZILMADI, yalnızca zaten var olan `POST`/`DELETE /matchmaking/
 * queue` uç noktalarına gerçek bir arayüz eklendi.
 *
 * ÖNEMLİ, DÜRÜST SINIRLAMA (bkz. `join-matchmaking-queue.use-case.ts` doc
 * yorumu): eşleştirme TAMAMEN SENKRONDUR — bir rakip ANINDA bulunursa
 * maç sonucu hemen döner, bulunamazsa oyuncu kuyruğa girer.
 *
 * `lobby.update` frontend entegrasyonu (bu turda EKLENDİ — bkz.
 * `race.gateway.ts`'in "`lobby.update`" doc bölümü, `lobby-socket.ts`):
 * ÖNCEDEN, kuyrukta bekleyen bir oyuncu sonradan biri onunla eşleştiğinde
 * bunu KENDİLİĞİNDEN HİÇ öğrenemiyordu. Şimdi `queuedHorseId` set
 * edildiğinde (kuyruğa girildiğinde) bu sayfa `/races` namespace'ine
 * bağlanır ve `lobby.update` olayını dinler — sayfa AÇIK/bağlıyken bir
 * rakip bulunursa sonuç CANLI olarak görünür. AMA bu hâlâ BEST-EFFORT'tur
 * (bkz. aşağıdaki `GlassPanel` uyarı metni ve `lobby-socket.ts` doc
 * yorumu): sekme kapatılırsa/bağlantı yoksa oyuncu HÂLÂ öğrenemez, bu
 * durumda hâlâ kuyruktan çıkıp tekrar denemesi gerekir — sahte bir
 * "her koşulda çalışır" garantisi UYDURULMAZ.
 */

import { useEffect, useState } from 'react';
import type { JoinMatchmakingQueueResult, PublicHorse } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HorseAvatar } from '../../components/ui/HorseAvatar';
import { connectLobbySocket } from '../../features/matchmaking/lobby-socket';
import { API_BASE_URL, apiClient, getAuthToken } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

type MatchResult = Extract<JoinMatchmakingQueueResult, { matched: true }>['match'];

export default function OnlinePage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [horsesError, setHorsesError] = useState<string | null>(null);
  const [selectedHorseId, setSelectedHorseId] = useState<string | null>(null);
  const [queuedHorseId, setQueuedHorseId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!player) {
      return;
    }
    let cancelled = false;
    void apiClient
      .getHorsesByOwner(player.id)
      .then((data) => {
        if (!cancelled) {
          setHorses(data);
          setSelectedHorseId((current) => current ?? data.find((h) => h.status === 'active')?.id ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setHorsesError(err instanceof Error ? err.message : 'Atlar yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
    // NOT: bu repo'nun kök `.eslintrc.cjs`'inde `eslint-plugin-react-hooks`
    // KURULU DEĞİL (bkz. `market/page.tsx` doc yorumundaki AYNI ders) — bir
    // `eslint-disable` yorumu bilerek YAZILMAZ.
  }, [player?.id]);

  // `lobby.update` (bu turda EKLENDİ) — bkz. dosya başı doc yorumu.
  // `queuedHorseId` yalnızca `matched: false` döndüğünde set edilir (bkz.
  // `handleJoin`) — yani bu efekt TAM OLARAK "kuyrukta bekliyoruz" durumunda
  // çalışır. Token yoksa (oyuncu henüz yüklenmediyse) bağlanmaz.
  // `LiveRaceViewer.tsx`'in `useEffect` temizlik deseniyle AYNI: `queuedHorseId`
  // `null` olduğunda (eşleşme bulundu YA DA `handleLeave` çağrıldı) VEYA
  // bileşen unmount olduğunda soket `disconnect()` edilir — bu ikisi de
  // AYNI `return` temizliği ile kapsanır, ayrı bir kod YOLU GEREKMEZ.
  useEffect(() => {
    if (!queuedHorseId) {
      return;
    }
    const token = getAuthToken();
    if (!token) {
      return;
    }
    const socket = connectLobbySocket(API_BASE_URL, token, {
      onMatched: (result) => {
        setMatchResult(result);
        setQueuedHorseId(null);
        setMessage(null);
      },
      onConnectError: (msg) => {
        // Bağlantı kurulamazsa sessizce yutulmaz ama akışı da BLOKLAMAZ —
        // oyuncu hâlâ normal şekilde `Kuyruktan Ayrıl`/tekrar `join`
        // deneyebilir (bkz. dosya başı doc yorumu "BEST-EFFORT").
        setMessage(`Canlı bildirim bağlantısı kurulamadı (${msg}) — kuyrukta bekliyorsun, ama eşleşme bulunursa bunu görmek için sayfayı yenilemen gerekebilir.`);
      },
    });

    return () => {
      socket.disconnect();
    };
    // NOT: bu repo'nun kök `.eslintrc.cjs`'inde `eslint-plugin-react-hooks`
    // KURULU DEĞİL (bkz. yukarıdaki AYNI ders) — bir `eslint-disable`
    // yorumu bilerek YAZILMAZ.
  }, [queuedHorseId]);

  const selectedHorse = horses?.find((horse) => horse.id === selectedHorseId) ?? null;

  const handleJoin = async () => {
    if (!selectedHorse) {
      return;
    }
    setIsBusy(true);
    setMessage(null);
    setMatchResult(null);
    try {
      const result = await apiClient.joinMatchmakingQueue(selectedHorse.id);
      if (result.matched) {
        setMatchResult(result.match);
        setQueuedHorseId(null);
      } else {
        setQueuedHorseId(selectedHorse.id);
        setMessage('Kuyruğa katıldın — uygun bir rakip bulununca yarış anında simüle edilecek.');
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Kuyruğa katılamadı');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!queuedHorseId) {
      return;
    }
    setIsBusy(true);
    setMessage(null);
    try {
      await apiClient.leaveMatchmakingQueue(queuedHorseId);
      setQueuedHorseId(null);
      setMessage('Kuyruktan ayrıldın.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Kuyruktan ayrılamadı');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Online (PvP)</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-md)' }}>
        Bir at seç, eşleştirme kuyruğuna katıl — uygun bir rakip bulununca yarış gerçek Race Engine ile anında simüle edilir.
      </p>

      <GlassPanel style={{ marginBottom: 'var(--space-lg)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
        Not: eşleştirme şu an tamamen senkron. Rakip bulunursa sonucu hemen görürsün; bulunamazsa kuyrukta beklersin —
        bu sayfa AÇIK kaldığı sürece biri seninle sonradan eşleşirse bunu artık canlı bildirimle görürsün. Ama bu
        garanti değil: sekmeyi kapatırsan veya bağlantın koparsa hâlâ öğrenemezsin, bu durumda kuyruktan çıkıp tekrar
        katılman gerekir — bu, dürüstçe belirtilmiş bilinen bir sınırlama.
      </GlassPanel>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            PvP oynayabilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {horsesError ? <p style={{ color: 'var(--color-status-critical)' }}>{horsesError}</p> : null}

      {player && horses === null && !horsesError ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Atlar yükleniyor…</p>
      ) : null}

      {player && horses && horses.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>PvP'ye sokabileceğin bir at bulunamıyor.</p>
        </GlassPanel>
      ) : null}

      {player && horses && horses.length > 0 ? (
        <GlassPanel>
          <h2 style={{ fontSize: '15px', color: 'var(--color-text-primary)', marginTop: 0 }}>At Seç</h2>
          <div style={{ display: 'grid', gap: '8px', marginBottom: 'var(--space-lg)' }}>
            {horses.map((horse) => (
              <button
                key={horse.id}
                type="button"
                disabled={queuedHorseId !== null}
                onClick={() => setSelectedHorseId(horse.id)}
                style={horseRowStyle(horse.id === selectedHorseId)}
              >
                <HorseAvatar horseId={horse.id} size={40} />
                <div style={{ display: 'grid', gap: '2px', textAlign: 'left', flex: 1 }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{horse.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {horse.status === 'active' ? 'Hazır' : horse.status === 'injured' ? 'Sakat' : horse.status === 'retired' ? 'Emekli' : 'Dinleniyor'}
                  </span>
                </div>
                {horse.id === queuedHorseId ? (
                  <span style={{ fontSize: '11px', color: 'var(--color-accent-gold)' }}>Kuyrukta</span>
                ) : null}
              </button>
            ))}
          </div>

          {queuedHorseId ? (
            <button type="button" disabled={isBusy} onClick={() => void handleLeave()} style={secondaryButtonStyle(isBusy)}>
              {isBusy ? 'İşleniyor…' : 'Kuyruktan Ayrıl'}
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy || !selectedHorse || selectedHorse.status !== 'active'}
              onClick={() => void handleJoin()}
              style={primaryButtonStyle(isBusy || !selectedHorse || selectedHorse.status !== 'active')}
            >
              {isBusy ? 'Eşleştiriliyor…' : 'Kuyruğa Katıl'}
            </button>
          )}

          {message ? <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-text-primary)' }}>{message}</p> : null}

          {matchResult ? <MatchResultCard result={matchResult} /> : null}
        </GlassPanel>
      ) : null}
    </main>
  );
}

function MatchResultCard({ result }: { result: MatchResult }): React.ReactElement {
  const outcome = result.winnerId === null ? 'draw' : result.ownFinishPosition === 1 ? 'win' : 'loss';
  const outcomeLabel = outcome === 'draw' ? 'Berabere' : outcome === 'win' ? 'Kazandın!' : 'Kaybettin';
  const outcomeColor =
    outcome === 'draw' ? 'var(--color-status-warning)' : outcome === 'win' ? 'var(--color-status-positive)' : 'var(--color-status-critical)';
  const ratingDelta = result.ownRatingAfter - result.ownRatingBefore;

  return (
    <div
      style={{
        marginTop: 'var(--space-lg)',
        paddingTop: 'var(--space-md)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: outcomeColor }}>{outcomeLabel}</h3>
      <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        <span>Senin derecen: {formatMs(result.ownFinishTimeMs)} ({result.ownFinishPosition}.)</span>
        <span>Rakip derecesi: {formatMs(result.opponentFinishTimeMs)} ({result.opponentFinishPosition}.)</span>
        <span style={{ color: 'var(--color-text-primary)' }}>
          Reyting: {result.ownRatingBefore} → {result.ownRatingAfter} ({ratingDelta >= 0 ? '+' : ''}
          {ratingDelta})
        </span>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  return `${totalSeconds.toFixed(2)} sn`;
}

function horseRowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${selected ? 'var(--color-accent-gold)' : 'var(--color-border)'}`,
    background: selected ? 'rgba(227, 179, 65, 0.1)' : 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  };
}

function primaryButtonStyle(disabled = false): React.CSSProperties {
  return {
    // AUDIT_REPORT.md F1: minHeight eklendi - 44px dokunma hedefi kuralini garanti eder.
    minHeight: '44px',
    padding: '12px 24px',
    background: disabled ? 'var(--color-bg-surface-elevated)' : 'var(--color-accent-gold)',
    color: disabled ? 'var(--color-text-muted)' : '#1a1405',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function secondaryButtonStyle(disabled = false): React.CSSProperties {
  return {
    // AUDIT_REPORT.md F1: minHeight eklendi - 44px dokunma hedefi kuralini garanti eder.
    minHeight: '44px',
    padding: '12px 24px',
    background: 'transparent',
    color: disabled ? 'var(--color-text-muted)' : 'var(--color-status-critical)',
    border: `1px solid ${disabled ? 'var(--color-border)' : 'var(--color-status-critical)'}`,
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
