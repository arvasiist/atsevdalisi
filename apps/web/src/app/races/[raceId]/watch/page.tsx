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
import { useMemo } from 'react';
import { GlassPanel } from '../../../../components/ui/GlassPanel';
import { LiveRaceViewer } from '../../../../features/race-viewer/LiveRaceViewer';
import { API_BASE_URL, getAuthToken } from '../../../../lib/api-client';

interface WatchRacePageProps {
  params: { raceId: string };
}

export default function WatchRacePage({ params }: WatchRacePageProps): React.ReactElement {
  const { raceId } = params;
  // `races/page.tsx`'teki AYNI desen: `getAuthToken()`'ın GERÇEK
  // sözleşmesi `null` dönebilir, bu yüzden `!` ile ZORLAMAK yerine açıkça
  // kontrol edilip dürüst bir durum gösterilir.
  const authToken = useMemo(() => getAuthToken(), []);

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
      <div style={{ position: 'absolute', top: 'var(--space-sm)', left: 'var(--space-sm)', zIndex: 10 }}>
        <BackLink />
      </div>
      {/*
        Yükseklik AÇIKÇA verilir: `LiveRaceViewer` `height: '100%'`e
        güvenir ve `main`in kendi yüksekliği App Router kabuğuna bağlıdır —
        sabit bir taban yükseklik olmadan sahne 0px'e çökebilir
        (`races/page.tsx`'teki 420px'lik kap ile AYNI gerekçe).
      */}
      <div style={{ width: '100%', height: '100%', minHeight: '520px', position: 'relative' }}>
        <LiveRaceViewer key={raceId} apiBaseUrl={API_BASE_URL} token={authToken} raceId={raceId} />
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
