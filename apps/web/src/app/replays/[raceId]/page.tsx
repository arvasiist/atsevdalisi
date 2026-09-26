'use client';

/**
 * `/replays/[raceId]` — "AT SEVDALISI — Master Development Brief" §22
 * "PHASE 12 — REPLAY" (bu sayfa bu turda EKLENDİ, `/replays/page.tsx`
 * listesinin açtığı detay/tekrar ekranı — bkz. o dosyanın doc yorumu).
 *
 * Bu proje `next@14.2` kullanıyor (bkz. `apps/web/package.json`) — bu
 * sürümde App Router `params` bir Promise DEĞİL, sayfa bileşenine
 * DOĞRUDAN (senkron) bir prop olarak geçer; bu yüzden burada gereksiz bir
 * `useParams()` hook'u/ek import YOKTUR.
 *
 * Veri akışı: `GET /races/:id/timeline` (`apiClient.getRaceTimeline`) →
 * `RaceTimelineView` → `adaptRaceTimelineViewToReplayData` (bkz. o
 * dosyanın doc yorumu, şekil uyuşmazlığının TAM açıklaması orada) →
 * `RaceTimeline` + `horseNamesById` → `RaceViewer` (AYNI orkestratör,
 * `/races/demo`'nun ZATEN kullandığı — burada YENİDEN İCAT EDİLMEZ).
 *
 * Hata durumları GERÇEK backend davranışlarına karşılık gelir
 * (`GetRaceTimelineUseCase`): yarış yoksa 404 (`RaceNotFoundError`),
 * istek sahibi bu yarışa katılmadıysa 403 (`ForbiddenError`) —
 * `request()` (bkz. `api-client.ts`) ikisini de `Error(message)` olarak
 * fırlatır, burada `err.message` DOĞRUDAN gösterilir (backend zaten
 * Türkçe insan-okunur mesajlar döner, bkz. `docs/API.md`). Ayrıca
 * `adaptRaceTimelineViewToReplayData`'nın döndürebileceği "hiçbir
 * katılımcının bitiş verisi tam değil" boş-sonuç durumu AÇIKÇA ele
 * alınır — `RaceViewer` BOŞ bir `finalResult` ile ASLA mount edilmez
 * (bkz. adaptör dosyasının doc yorumu, bu tam olarak onun uyardığı şey).
 */

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { apiClient } from '../../../lib/api-client';
import { adaptRaceTimelineViewToReplayData, type ReplayTimelineData } from '../../../features/race-viewer/replay-adapter';

const RaceViewer = dynamic(
  () => import('../../../features/race-viewer/RaceViewer').then((mod) => mod.RaceViewer),
  { ssr: false, loading: () => <p style={{ color: '#fff', padding: '2rem' }}>3D Hipodrom yükleniyor...</p> },
);

interface ReplayDetailPageProps {
  params: { raceId: string };
}

export default function ReplayDetailPage({ params }: ReplayDetailPageProps): React.ReactElement {
  const { raceId } = params;
  const [replayData, setReplayData] = useState<ReplayTimelineData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReplayData(null);
    setError(null);
    void apiClient
      .getRaceTimeline(raceId)
      .then((view) => {
        if (cancelled) return;
        const adapted = adaptRaceTimelineViewToReplayData(view);
        if (adapted.timeline.finalResult.length === 0) {
          // Bkz. dosya başı doc yorumu — hiçbir katılımcının bitiş verisi
          // tam değilse (beklenmedik/bozuk veri) `RaceViewer` BOŞ veriyle
          // mount edilmez, açık bir hata durumu gösterilir.
          setError('Bu yarışın tekrar (replay) verisi eksik — hiçbir katılımcının bitiş kaydı bulunamadı.');
          return;
        }
        setReplayData(adapted);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Yarış tekrarı yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [raceId]);

  if (error) {
    return (
      <main className="page-container">
        <BackLink />
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)', marginTop: 'var(--space-md)' }}>
          <p style={{ color: 'var(--color-status-critical)', margin: 0 }}>{error}</p>
        </GlassPanel>
      </main>
    );
  }

  if (!replayData) {
    return (
      <main className="page-container">
        <BackLink />
        <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-md)' }}>Yarış tekrarı yükleniyor…</p>
      </main>
    );
  }

  return (
    <main style={{ width: '100%', height: '100%', background: '#0b1220', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 'var(--space-sm)', left: 'var(--space-sm)', zIndex: 10 }}>
        <BackLink />
      </div>
      <RaceViewer timeline={replayData.timeline} horseNamesById={replayData.horseNamesById} />
    </main>
  );
}

function BackLink(): React.ReactElement {
  return (
    <Link
      href="/replays"
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
      ← Yarış Geçmişi
    </Link>
  );
}
