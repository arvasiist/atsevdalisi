'use client';

/**
 * GÖREVLER (02.10.2026, Faz 11-B, brief §68). Günlük + haftalık görevler ve
 * yönetimin açtığı etkinlikler; 03.10.2026'dan beri yaşam boyu başarımlar. İlerleme ve ödül SUNUCUDAN gelir; "Ödülü al"
 * yalnızca bir istektir — sunucu ilerlemeyi kilit altında yeniden sayar.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  AchievementBoardView,
  LiveEventView,
  QuestBoardView,
  QuestPeriodView,
  QuestView,
} from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { achievementProgressText, achievementTitle } from '../../features/quests/achievement-labels';
import { questProgressText, questState, timeLeftText } from '../../features/quests/quest-labels';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

const PERIOD_TITLES: Record<QuestPeriodView['period'], string> = { daily: 'Bugün', weekly: 'Bu hafta' };

function QuestRow({
  label,
  detail,
  item,
  busy,
  onClaim,
}: {
  label: string;
  detail?: string;
  item: Pick<QuestView, 'progress' | 'target' | 'claimed' | 'rewardMoney'>;
  busy: boolean;
  onClaim: () => void;
}): React.ReactElement {
  const state = questState(item);
  const pct = Math.min(100, (item.progress / item.target) * 100);
  return (
    <li className="quest-row" data-state={state}>
      <div className="quest-main">
        <strong>{label}</strong>
        {detail ? <p className="session-meta">{detail}</p> : null}
        <div
          className="quest-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={item.target}
          aria-valuenow={Math.min(item.progress, item.target)}
          aria-label={label}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="quest-side">
        <span className="quest-reward">{formatCurrency('money', item.rewardMoney)}</span>
        {state === 'claimed' ? (
          <span className="market-badge">Alındı</span>
        ) : (
          <button type="button" className="moderation-primary" disabled={busy || state !== 'ready'} onClick={onClaim}>
            Ödülü al
          </button>
        )}
      </div>
    </li>
  );
}

export default function QuestsPage(): React.ReactElement {
  const { player, isLoading, createPlayer, refresh } = usePlayer();
  const [board, setBoard] = useState<QuestBoardView | null>(null);
  const [achievements, setAchievements] = useState<AchievementBoardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const [quests, earned] = await Promise.all([apiClient.getQuests(), apiClient.getAchievements()]);
      setBoard(quests);
      setAchievements(earned);
      setNow(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Görevler yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    if (player) void load();
  }, [player, load]);

  const claim = async (key: string, action: () => Promise<{ rewardMoney: number }>): Promise<void> => {
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(`${formatCurrency('money', result.rewardMoney)} hesabına eklendi.`);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ödül alınamadı.');
    } finally {
      setBusyKey(null);
    }
  };

  if (!player) {
    return (
      <main className="page-container">
        <h1 className="page-title">Görevler</h1>
        {isLoading ? null : (
          <GlassPanel>
            <p>Görevleri görmek için önce bir oyuncu oluştur.</p>
            <button type="button" className="moderation-primary" onClick={() => void createPlayer()}>
              Oyuncu oluştur
            </button>
          </GlassPanel>
        )}
      </main>
    );
  }

  const period = (view: QuestPeriodView) => (
    <GlassPanel key={view.period}>
      <div className="quest-head">
        <h2>{PERIOD_TITLES[view.period]}</h2>
        <span className="session-meta">Yenilenmesine {timeLeftText(view.endsAt, now)}</span>
      </div>
      <ul className="quest-list">
        {view.quests.map((quest) => (
          <QuestRow
            key={quest.key}
            label={questProgressText(quest.metric, quest.progress, quest.target)}
            item={quest}
            busy={busyKey !== null}
            onClaim={() => void claim(quest.key, () => apiClient.claimQuest(quest.key))}
          />
        ))}
      </ul>
    </GlassPanel>
  );

  const eventRow = (event: LiveEventView) => {
    const ended = new Date(event.endsAt).getTime() <= now.getTime();
    return (
      <QuestRow
        key={event.id}
        label={`${event.title} — ${questProgressText(event.metric, event.progress, event.target)}`}
        detail={`${event.description ? `${event.description} · ` : ''}${
          ended ? `Bitti; ödül ${timeLeftText(event.claimableUntil, now)} içinde alınabilir` : `Bitişe ${timeLeftText(event.endsAt, now)}`
        }`}
        item={event}
        busy={busyKey !== null}
        onClaim={() => void claim(event.id, () => apiClient.claimEvent(event.id))}
      />
    );
  };

  return (
    <main className="page-container" data-testid="quests-page">
      <h1 className="page-title">Görevler</h1>
      {notice ? <p className="quest-notice">{notice}</p> : null}
      {error ? <p className="moderation-error">{error}</p> : null}
      {board === null ? (
        <p className="session-meta">Yükleniyor…</p>
      ) : (
        <div className="quest-grid">
          {board.events.length > 0 ? (
            <GlassPanel>
              <div className="quest-head">
                <h2>Etkinlikler</h2>
              </div>
              <ul className="quest-list">{board.events.map(eventRow)}</ul>
            </GlassPanel>
          ) : null}
          {period(board.daily)}
          {period(board.weekly)}
          {achievements && achievements.achievements.length > 0 ? (
            <GlassPanel>
              <div className="quest-head">
                <h2>Başarımlar</h2>
                <span className="session-meta">
                  {achievements.achievements.filter((a) => a.claimed).length}/{achievements.achievements.length} kazanıldı
                </span>
              </div>
              <ul className="quest-list" data-testid="achievement-list">
                {achievements.achievements.map((achievement) => (
                  <QuestRow
                    key={achievement.key}
                    label={`${achievementTitle(achievement.metric, achievement.target)} · ${achievementProgressText(
                      achievement.progress,
                      achievement.target,
                    )}`}
                    item={achievement}
                    busy={busyKey !== null}
                    onClaim={() =>
                      void claim(`achievement:${achievement.key}`, () => apiClient.claimAchievement(achievement.key))
                    }
                  />
                ))}
              </ul>
            </GlassPanel>
          ) : null}
        </div>
      )}
    </main>
  );
}
