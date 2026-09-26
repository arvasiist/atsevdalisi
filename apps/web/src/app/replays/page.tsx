'use client';

/**
 * `/replays` — "AT SEVDALISI — Master Development Brief" §22 "PHASE 12 —
 * REPLAY" (bu sayfa bu turda EKLENDİ — `docs/AUDIT_REPORT.md`'nin
 * "MISSING FEATURES" listesindeki "§22 Replay (bağımsız gözatma): Canlı
 * yayın + temel oynatma VAR; ayrı bir 'geçmiş yarışları ara/izle'
 * kütüphane ekranı HÂLÂ YOK ... (Sıradaki aday dilim.)" bulgusunun
 * kapatılması).
 *
 * Backend ucu (`GET /players/:id/recent-races`) ZATEN VARDI (Ana Sayfa'nın
 * `RecentRacesPanel`'i tarafından `limit=5` ile kullanılıyordu) — burada
 * eksik olan yalnızca bunu ayrı, kendi başına gezilebilir bir "kütüphane"
 * ekranına dönüştürmekti. `limit` burada backend'in gerçek üst sınırına
 * (`apps/api/src/application/use-cases/get-recent-race-results.use-case.ts`
 * içindeki `MAX_RECENT_RACE_LIMIT = 20` — bu sabit paylaşılan bir pakette
 * DEĞİL, backend'in kendi dosyasında yaşıyor, bu yüzden burada UYDURULMAZ,
 * backend'in ZATEN UYGULADIĞI clamp'e göre en büyük anlamlı değer olan
 * 20 kullanılır) kadar çekilir — dashboard panelinin `5`'inin aksine, bu
 * ekranın amacı TAM geçmişi (üst sınıra kadar) göstermektir.
 *
 * Her satır `/replays/[raceId]`'e bağlanır (bkz. o dosyanın doc yorumu) —
 * `race.raceId` zaten `RecentRaceResultView`'in bir alanı (bkz.
 * `packages/shared-types/src/race.ts`), yeni bir kimlik İCAT EDİLMEZ.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RecentRaceResultView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

// Bkz. dosya başı doc yorumu — backend'in `MAX_RECENT_RACE_LIMIT`'iyle eşleşir.
const REPLAY_LIBRARY_LIMIT = 20;

export default function ReplaysPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [races, setRaces] = useState<RecentRaceResultView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!player) {
      return;
    }
    let cancelled = false;
    setRaces(null);
    setError(null);
    void apiClient
      .getRecentRaces(player.id, REPLAY_LIBRARY_LIMIT)
      .then((data) => {
        if (!cancelled) setRaces(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Yarış geçmişi yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [player]);

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Yarış Geçmişi</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Koştuğun yarışları tekrar izle — her satır, o yarışın tam 3D tekrarını (replay) açar.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Yarış geçmişini görebilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {player && races === null && !error ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Yarış geçmişi yükleniyor…</p>
      ) : null}

      {races && races.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Henüz bir yarış koşmadın.{' '}
            <Link href="/stable" style={{ color: 'var(--color-accent-focus)' }}>
              Ahırından bir atınla pratik yarışa çık.
            </Link>
          </p>
        </GlassPanel>
      ) : null}

      {races && races.length > 0 ? (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-sm)' }}>
          {races.map((race) => (
            <li key={race.raceId}>
              <Link href={`/replays/${race.raceId}`} style={{ textDecoration: 'none' }}>
                <GlassPanel
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    padding: 'var(--space-md)',
                    cursor: 'pointer',
                    border:
                      race.finishPosition === 1 ? '1px solid var(--color-accent-gold)' : '1px solid var(--color-border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                      {race.horseName}
                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> · {race.raceName}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {race.distanceMeters}m · {surfaceLabel(race.surface)} · {formatRelativeDate(race.finishedAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: race.finishPosition === 1 ? 'var(--color-accent-gold)' : 'var(--color-text-secondary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {race.finishPosition}.
                    </div>
                    <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>
                      ▶
                    </span>
                  </div>
                </GlassPanel>
              </Link>
            </li>
          ))}
        </ol>
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
