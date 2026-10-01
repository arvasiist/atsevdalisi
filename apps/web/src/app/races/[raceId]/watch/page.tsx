'use client';

/**
 * `/races/[raceId]/watch` — TRIBÜN İZLEME EKRANI (brief §27, §42 PHASE 7.5
 * — 29.09.2026).
 *
 * ## Neden ayrı bir sayfa (ve `/replays/[raceId]` neden YETMİYOR)
 *
 * `/replays/[raceId]` yarışı `GET /races/:id/timeline` ile **statik** bir
 * tekrar olarak oynatır: HTTP, tek seferlik, soket YOK. Bu, katılımcının
 * kendi tekrarı için doğrudur ama TRIBÜN için bir eksiği vardır —
 * `race.gateway.ts`'in **`race:${raceId}` odası** hiç dolmaz, yani
 * (1) `race.spectators` sayısı izleyiciyi HİÇ görmez, (2) tribün sohbeti
 * (`chat.history`/`chat.message`) çalışmaz. Yani "izleyici" kavramı
 * sunucuda var, istemcide YOKTU.
 *
 * Bu sayfa tam olarak o boşluğu kapatır: `LiveRaceViewer`'ı mount eder,
 * o da `race.subscribe` gönderir — yani izleyici GERÇEKTEN odaya girer,
 * sayıya dahil olur ve sohbet edebilir. **Yetki kapısı YENİDEN
 * YAZILMADI:** `race.subscribe` sunucuda `GetRaceTimelineUseCase.execute
 * (raceId, playerId)` çağırır (bkz. `race.gateway.ts` → `handleSubscribe`),
 * yani `GET /races/:id/timeline` ile **AYNI** kapıdır — bilet sahibi olmak
 * o kapıyı açar, olmamak `race.error` ile `RACE_TICKET_REQUIRED` mesajını
 * döner ve `LiveRaceViewer` bunu ekranda gösterir.
 *
 * ## Neden `GET /races/:id` ÇAĞRILMIYOR
 *
 * Çağrılmıyor çünkü **öyle bir uç nokta YOK** ve `CLAUDE.md` bunu açıkça
 * yasaklar ("`/races/:id` ve `/races/:id/spectate` — ikisi de var olmayan
 * bir uç noktaya bağlıdır ... uydurulmamalı"). Bu sayfa hiçbir yeni HTTP
 * uç noktası gerektirmez: yarış adı/mesafesi gibi bağlam bilgisi sohbet
 * panelinin ve HUD'un İÇİNDE zaten gelir (`race.roster`), ve sayfa
 * yalnızca `raceId`'yi yoldan alır.
 *
 * ## `ownHorseId` NEDEN GEÇİRİLMİYOR
 *
 * İzleyicinin bu yarışta atı YOKTUR. `LiveRaceViewer`'ın `ownHorseId`
 * alanı bu yüzden opsiyoneldir ve boş bırakıldığında kamera/hud odağı
 * lidere düşer (bkz. o prop'un doc yorumu). Uydurma bir `horseId`
 * geçirmek, olmayan bir atı "benim atım" gibi gösterme riski taşırdı.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { InteractiveRaceView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../../../components/ui/GlassPanel';
import { LiveRaceViewer } from '../../../../features/race-viewer/LiveRaceViewer';
import { InteractiveRaceViewer } from '../../../../features/ride/InteractiveRaceViewer';
import { API_BASE_URL, ApiError, apiClient, getAuthToken } from '../../../../lib/api-client';
import { usePlayer } from '../../../../lib/player-context';

/** Kontrollü yarışın canlı tribününü arama aralığı (yarış kilitlenince açılır). */
const LIVE_SPECTATE_POLL_MS = 5000;

interface WatchRacePageProps {
  params: { raceId: string };
}

export default function WatchRacePage({ params }: WatchRacePageProps): React.ReactElement {
  const { raceId } = params;
  // `races/page.tsx`'teki AYNI desen: `getAuthToken()`'ın GERÇEK
  // sözleşmesi `null` dönebilir, bu yüzden `!` ile ZORLAMAK yerine açıkça
  // kontrol edilip dürüst bir durum gösterilir.
  // 01.10.2026 — token oturum yüklendikten SONRA okunur. Eskiden ilk
  // render'da bir kez okunuyordu; sayfa doğrudan açılınca (yenileme, paylaşılan
  // bağlantı) oturum henüz yüklenmemiş olduğundan girişli oyuncuya da "hesap
  // oluştur" deniyordu.
  const { player, isLoading } = usePlayer();
  const authToken = useMemo(() => (player ? getAuthToken() : null), [player]);
  // CANLI TRİBÜN (01.10.2026): kontrollü yarış koşarken sürüş ekranı tribün
  // modunda açılır; yarış kilitlenene kadar yoklanır. Kapatılınca (ya da
  // yarış kontrollü değilse) soket oynatması (`LiveRaceViewer`) gösterilir.
  const [liveView, setLiveView] = useState<InteractiveRaceView | null>(null);
  const [liveDismissed, setLiveDismissed] = useState(false);

  useEffect(() => {
    if (!authToken || liveDismissed || liveView !== null) return undefined;
    let stopped = false;
    const probe = (): void => {
      apiClient
        .getLiveLobbyRaceSpectate(raceId)
        .then((view) => {
          if (stopped) return;
          if (view.status === 'running') {
            setLiveView(view);
          } else {
            stopped = true; // bitmiş: tekrar oynatma soketten
          }
        })
        .catch((cause: unknown) => {
          // 403 (bilet yok) kalıcıdır; 404 yarış henüz kilitlenmemiş olabilir.
          if (cause instanceof ApiError && cause.status === 403) stopped = true;
        });
    };
    probe();
    const timer = window.setInterval(() => {
      if (!stopped) probe();
    }, LIVE_SPECTATE_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [authToken, raceId, liveDismissed, liveView]);

  if (isLoading) {
    return (
      <main className="page-container">
        <BackLink />
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)', marginTop: 'var(--space-md)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Oturum yükleniyor…</p>
        </GlassPanel>
      </main>
    );
  }

  if (!authToken) {
    return (
      <main className="page-container">
        <BackLink />
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)', marginTop: 'var(--space-md)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Tribünden izlemek için önce bir seyis/jokey hesabı oluştur.
          </p>
        </GlassPanel>
      </main>
    );
  }

  return (
    <main className="viewer-page" style={{ width: '100%', height: '100%', background: '#0b1220', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          left: 'var(--space-sm)',
          zIndex: 10,
          // Canlı tribünde sol üst köşe sürüş rozetinindir.
          ...(liveView !== null && !liveDismissed
            ? { bottom: 'var(--space-sm)' }
            : { top: 'var(--space-sm)' }),
        }}
      >
        <BackLink />
      </div>
      {/*
        Yükseklik AÇIKÇA verilir: `LiveRaceViewer` `height: '100%'`e
        güvenir ve `main`in kendi yüksekliği App Router kabuğuna bağlıdır —
        sabit bir taban yükseklik olmadan sahne 0px'e çökebilir
        (`races/page.tsx`'teki 420px'lik kap ile AYNI gerekçe).
      */}
      <div style={{ width: '100%', height: '100%', minHeight: '520px', position: 'relative' }}>
        {liveView !== null && !liveDismissed ? (
          <InteractiveRaceViewer
            key={liveView.raceId}
            initialView={liveView}
            horseName="Canlı Tribün"
            onClose={() => setLiveDismissed(true)}
          />
        ) : (
          <LiveRaceViewer key={raceId} apiBaseUrl={API_BASE_URL} token={authToken} raceId={raceId} />
        )}
      </div>
    </main>
  );
}

function BackLink(): React.ReactElement {
  return (
    <Link
      href="/grandstand"
      style={{
        display: 'inline-block',
        fontSize: '13px',
        color: 'var(--color-accent-focus)',
        textDecoration: 'none',
        background: 'rgba(18, 27, 46, 0.72)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 12px',
      }}
    >
      ← Tribün
    </Link>
  );
}
