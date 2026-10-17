'use client';

/**
 * KARİYER (16.10.2026, brief §10) — stadyumdan stadyuma. Puan bitmiş yarış
 * sonuçlarından SUNUCUDA türetilir; kademe masaları ve yurt dışı pistlerini
 * açar (katılım kapısı sunucuda). Kademe ödülü Görevler → Başarımlar'dan alınır.
 * Seyahat beklemesi yoktur: pist kademeyle açılır, yarışa hemen katılınır.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CareerView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { careerProgressPercent, describeNextGoal, formatPlace } from '../../features/career/career-view';
import { hippodromeLabel } from '../../features/race-viewer/hippodrome-theme';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

export default function CareerPage(): React.ReactElement {
  const { player, isLoading, createPlayer } = usePlayer();
  const [view, setView] = useState<CareerView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await apiClient.getCareer());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kariyer yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    if (player) void load();
  }, [player, load]);

  if (!player) {
    return (
      <main className="page-container">
        <h1 className="page-title">Kariyer</h1>
        {isLoading ? null : (
          <GlassPanel>
            <p>Kariyerini görmek için önce bir oyuncu oluştur.</p>
            <button type="button" className="moderation-primary" onClick={() => void createPlayer()}>
              Oyuncu oluştur
            </button>
          </GlassPanel>
        )}
      </main>
    );
  }

  return (
    <main className="page-container" data-testid="career-page">
      <h1 className="page-title">Kariyer</h1>
      {error ? (
        <p className="moderation-error">
          {error}{' '}
          <button type="button" className="stable-chip" onClick={() => void load()}>
            Tekrar dene
          </button>
        </p>
      ) : null}
      {view === null ? (
        error ? null : <p className="session-meta">Yükleniyor…</p>
      ) : (
        <div className="quest-grid">
          <GlassPanel>
            <div className="quest-head">
              <h2>
                {view.tier.name} <span className="session-meta">· {view.points} kariyer puanı</span>
              </h2>
            </div>
            <div
              className="quest-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={careerProgressPercent(view)}
              aria-label="Sıradaki kademeye ilerleme"
            >
              <span style={{ width: `${careerProgressPercent(view)}%` }} />
            </div>
            <p data-testid="career-next-goal" style={{ marginBottom: 0 }}>
              {describeNextGoal(view)}
            </p>
            <p className="session-meta" style={{ margin: 0 }}>
              Kademe ödülleri <Link href="/quests">Görevler → Başarımlar</Link>&apos;da alınır. Pistler ve masalar{' '}
              <Link href="/hippodromes">Hipodromlar</Link> ekranında.
            </p>
          </GlassPanel>

          <GlassPanel>
            <div className="quest-head">
              <h2>Kademeler</h2>
            </div>
            <ol className="career-ladder">
              {view.tiers.map((tier) => (
                <li key={tier.key} data-reached={tier.reached ? 'true' : 'false'}>
                  <strong>
                    {tier.reached ? '✓ ' : '🔒 '}
                    {tier.name}
                  </strong>{' '}
                  <span className="session-meta">{tier.requiredPoints} puan</span>
                  <span className="session-meta" style={{ display: 'block' }}>
                    {tier.description}
                    {tier.unlocksTables.length > 0 ? ` Masalar: ${tier.unlocksTables.map((t) => t.label).join(', ')}.` : ''}
                    {tier.unlocksHippodromes.length > 0
                      ? ` Pistler: ${tier.unlocksHippodromes.map((h) => h.name).join(', ')}.`
                      : ''}
                  </span>
                </li>
              ))}
            </ol>
          </GlassPanel>

          <GlassPanel>
            <div className="quest-head">
              <h2>Puan tablosu</h2>
            </div>
            <table className="career-table">
              <thead>
                <tr>
                  <th>Yarış</th>
                  <th>1.</th>
                  <th>2.</th>
                  <th>3.</th>
                  <th>Diğer</th>
                </tr>
              </thead>
              <tbody>
                {view.racePoints.map((row) => (
                  <tr key={row.classKey}>
                    <td>{row.classLabel}</td>
                    {row.points.map((value, index) => (
                      <td key={index}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassPanel>

          <GlassPanel>
            <div className="quest-head">
              <h2>Kariyer geçmişi</h2>
            </div>
            {view.history.length === 0 ? (
              <p className="session-meta">
                Henüz bitmiş yarışın yok. <Link href="/races">Yarışlar</Link>&apos;dan bir pratik yarışla başla.
              </p>
            ) : (
              <table className="career-table" data-testid="career-history">
                <thead>
                  <tr>
                    <th>Yarış</th>
                    <th>Pist</th>
                    <th>Sınıf</th>
                    <th>Derece</th>
                    <th>Puan</th>
                  </tr>
                </thead>
                <tbody>
                  {view.history.map((row) => (
                    <tr key={row.raceId}>
                      <td>
                        <Link href={`/replays/${row.raceId}`}>{row.raceName}</Link>
                        <span className="session-meta" style={{ display: 'block' }}>
                          {new Date(row.startTime).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </td>
                      <td>{hippodromeLabel(row.hippodrome)}</td>
                      <td>{row.classLabel}</td>
                      <td>{formatPlace(row.finishPosition, row.fieldSize)}</td>
                      <td>+{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </GlassPanel>
        </div>
      )}
    </main>
  );
}
