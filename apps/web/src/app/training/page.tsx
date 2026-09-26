'use client';

/**
 * Antrenman — daha önce dürüst bir "yakında" placeholder'ıydı (bkz. git
 * geçmişi) çünkü ekranın kendisi Faz 2 kapsamı dışında bırakılmıştı.
 * Backend (`POST /horses/:id/train`, `apps/api/src/domain/training/`)
 * FAZ 1'den beri TAM ÇALIŞIR durumdaydı — `claude/hizli-bitirme-plani.md`
 * madde 4: bu, en ucuz/en yüksek etkili sıradaki adımdı (yeni backend
 * YAZILMADI, yalnızca zaten var olan uç noktaya gerçek bir arayüz
 * eklendi).
 *
 * `TrainingType`/`TrainingIntensity` listeleri `apps/api/src/domain/
 * training/validation.ts`'teki `TRAINING_TYPES`/`TRAINING_INTENSITIES`
 * ile BİREBİR aynı tutulmalıdır (apps/web, apps/api'nin domain koduna
 * import edemez — ayrı bir derleme birimi/paket sınırı, bkz.
 * docs/ARCHITECTURE.md §4 katman ayrımı) — burada KASITLI olarak
 * kopyalanmıştır, backend'in kendi bağımsız domain doğrulaması zaten
 * nihai otoritedir (istemci burada YALNIZCA doğru seçenekleri sunar).
 *
 * "Antrenman Geçmişi" paneli (bu turda EKLENDİ — docs/AUDIT_REPORT.md
 * "Antrenman geçmişi gösterimi" bulgusu): `GET /horses/:id/training-history`
 * (bu turda backend'e eklendi, bkz. `training.controller.ts`) seçili atın
 * son 20 antrenmanını döner; her at seçiminde YENİDEN çekilir, her başarılı
 * antrenman sonrası da TAZELENİR (`handleTrain`'in sonundaki `loadHistory`
 * çağrısı).
 */

import { useEffect, useMemo, useState } from 'react';
import type { PublicHorse, TrainHorseResult, TrainingIntensity, TrainingSession, TrainingType } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HorseAvatar } from '../../components/ui/HorseAvatar';
import { StatBar } from '../../components/ui/StatBar';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

const TRAINING_TYPES: readonly TrainingType[] = ['speed', 'sprint', 'stamina', 'start', 'cornering', 'tempo', 'rest'];
const TRAINING_INTENSITIES: readonly TrainingIntensity[] = ['low', 'medium', 'high'];
const DEFAULT_DURATION_MINUTES = 30;

const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  speed: 'Hız',
  sprint: 'Sprint',
  stamina: 'Dayanıklılık',
  start: 'Çıkış',
  cornering: 'Viraj',
  tempo: 'Tempo',
  rest: 'Dinlenme',
};

const INTENSITY_LABELS: Record<TrainingIntensity, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
};

/** `TRAINING_HISTORY_LIMIT` (`apps/api/src/domain/training/validation.ts`) ile BİREBİR aynı tutulmalıdır — apps/web apps/api'nin domain koduna import edemez (bkz. dosya başı doc yorumu). */
const TRAINING_HISTORY_DISPLAY_NOTE = '20 antrenman';

const STAT_FIELD_LABELS: Record<string, string> = {
  speed: 'Hız',
  sprint: 'Sprint',
  stamina: 'Dayanıklılık',
  startSpeed: 'Çıkış Hızı',
  cornering: 'Viraj',
  midSpeed: 'Orta Mesafe Hızı',
};

export default function TrainingPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [horsesError, setHorsesError] = useState<string | null>(null);
  const [selectedHorseId, setSelectedHorseId] = useState<string | null>(null);
  const [type, setType] = useState<TrainingType>('speed');
  const [intensity, setIntensity] = useState<TrainingIntensity>('medium');
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [isTraining, setIsTraining] = useState(false);
  const [result, setResult] = useState<TrainHorseResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Antrenman geçmişi (bu turda EKLENDİ — docs/AUDIT_REPORT.md "Antrenman
  // geçmişi gösterimi" bulgusu). `null` = henüz yüklenmedi, `[]` = at hiç
  // antrenman yapmamış (ikisi ayrı state, "yükleniyor" ile "boş" karışmasın).
  const [history, setHistory] = useState<TrainingSession[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHorses = async (ownerId: string) => {
    setHorsesError(null);
    try {
      const data = await apiClient.getHorsesByOwner(ownerId);
      setHorses(data);
      setSelectedHorseId((current) => current ?? data[0]?.id ?? null);
    } catch (err: unknown) {
      setHorsesError(err instanceof Error ? err.message : 'Atlar yüklenemedi');
    }
  };

  useEffect(() => {
    if (!player) {
      return;
    }
    setHorses(null);
    void loadHorses(player.id);
    // NOT: bu repo'nun kök `.eslintrc.cjs`'inde `eslint-plugin-react-hooks`
    // KURULU DEĞİL (bkz. CI Hata — `market/page.tsx` doc yorumundaki AYNI
    // ders) — bu yüzden burada bir `eslint-disable` yorumu YAZILMAZ; bağımlılık
    // dizisi bilinçli olarak yalnızca `player?.id` (tüm `player` nesnesi değil).
  }, [player?.id]);

  const selectedHorse = useMemo(
    () => horses?.find((horse) => horse.id === selectedHorseId) ?? null,
    [horses, selectedHorseId],
  );

  const canTrain = selectedHorse !== null && selectedHorse.status === 'active' && !isTraining;

  const loadHistory = async (horseId: string) => {
    setHistoryError(null);
    try {
      const data = await apiClient.getTrainingHistory(horseId);
      setHistory(data);
    } catch (err: unknown) {
      setHistoryError(err instanceof Error ? err.message : 'Antrenman geçmişi yüklenemedi');
    }
  };

  useEffect(() => {
    if (!selectedHorseId) {
      setHistory(null);
      return;
    }
    setHistory(null);
    void loadHistory(selectedHorseId);
  }, [selectedHorseId]);

  const handleTrain = async () => {
    if (!selectedHorse || !player) {
      return;
    }
    setIsTraining(true);
    setMessage(null);
    setResult(null);
    try {
      const trainResult = await apiClient.trainHorse(selectedHorse.id, { type, intensity, durationMinutes });
      setResult(trainResult);
      setMessage(
        trainResult.injuryOccurred
          ? 'Antrenman tamamlandı — ama at bu sırada sakatlandı.'
          : 'Antrenman tamamlandı!',
      );
      await loadHorses(player.id);
      await loadHistory(selectedHorse.id);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Antrenman başarısız oldu');
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Antrenman</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Bir at seç, bir antrenman türü belirle — sonuçlar gerçek Race Engine istatistiklerini etkiler.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Antrenman yapabilmek için önce bir seyis/jokey hesabı oluştur.
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
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Ahırında antrenman yapabilecek bir at bulunamıyor.
          </p>
        </GlassPanel>
      ) : null}

      {player && horses && horses.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--space-lg)', gridTemplateColumns: 'minmax(0, 1fr)' }} className="training-grid">
          <GlassPanel>
            <h2 style={sectionTitleStyle()}>At Seç</h2>
            <div style={{ display: 'grid', gap: '8px' }}>
              {horses.map((horse) => (
                <button
                  key={horse.id}
                  type="button"
                  onClick={() => setSelectedHorseId(horse.id)}
                  style={horseRowStyle(horse.id === selectedHorseId)}
                >
                  <HorseAvatar horseId={horse.id} size={40} />
                  <div style={{ display: 'grid', gap: '2px', textAlign: 'left', flex: 1 }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{horse.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{horseStatusLabel(horse.status)}</span>
                  </div>
                </button>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel>
            <h2 style={sectionTitleStyle()}>Antrenman Programı</h2>

            {selectedHorse ? (
              <div style={{ display: 'grid', gap: '6px', marginBottom: 'var(--space-md)' }}>
                <StatBar label="Enerji" value={selectedHorse.energy} />
                <StatBar label="Yorgunluk" value={selectedHorse.fatigue} higherIsBetter={false} />
                <StatBar label="Moral" value={selectedHorse.morale} />
              </div>
            ) : null}

            {selectedHorse && selectedHorse.status !== 'active' ? (
              <p style={{ color: 'var(--color-status-warning)', fontSize: '13px' }}>
                {horseStatusLabel(selectedHorse.status)} durumundaki bir at antrenmana katılamaz.
              </p>
            ) : null}

            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              <label style={labelStyle()}>Tür</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {TRAINING_TYPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setType(option)}
                    style={chipStyle(option === type)}
                  >
                    {TRAINING_TYPE_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              <label style={labelStyle()}>Yoğunluk</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {TRAINING_INTENSITIES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setIntensity(option)}
                    style={chipStyle(option === intensity)}
                  >
                    {INTENSITY_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
              <label htmlFor="duration-input" style={labelStyle()}>
                Süre (dakika): {durationMinutes}
              </label>
              <input
                id="duration-input"
                type="range"
                min={15}
                max={120}
                step={15}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </div>

            <button type="button" disabled={!canTrain} onClick={() => void handleTrain()} style={primaryButtonStyle(!canTrain)}>
              {isTraining ? 'Antrenman yapılıyor…' : 'Antrenmana Başla'}
            </button>

            {message ? (
              <p style={{ marginTop: 'var(--space-md)', color: result?.injuryOccurred ? 'var(--color-status-critical)' : 'var(--color-text-primary)' }}>
                {message}
              </p>
            ) : null}

            {result ? (
              <div style={{ marginTop: 'var(--space-md)', display: 'grid', gap: '4px', fontSize: '13px' }}>
                {Object.entries(result.statChanges).map(([field, delta]) => (
                  <span key={field} style={{ color: 'var(--color-status-positive)' }}>
                    {STAT_FIELD_LABELS[field] ?? field}: +{delta}
                  </span>
                ))}
                <span style={{ color: 'var(--color-text-secondary)' }}>Yorgunluk artışı: +{result.fatigueGain}</span>
              </div>
            ) : null}
          </GlassPanel>

          <GlassPanel style={{ gridColumn: '1 / -1' }}>
            <h2 style={sectionTitleStyle()}>Antrenman Geçmişi</h2>
            {selectedHorse ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: 0, marginBottom: 'var(--space-md)' }}>
                {selectedHorse.name} için son {TRAINING_HISTORY_DISPLAY_NOTE}
              </p>
            ) : null}

            {historyError ? <p style={{ color: 'var(--color-status-critical)' }}>{historyError}</p> : null}

            {selectedHorse && history === null && !historyError ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Geçmiş yükleniyor…</p>
            ) : null}

            {selectedHorse && history && history.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Bu at henüz hiç antrenman yapmadı.</p>
            ) : null}

            {selectedHorse && history && history.length > 0 ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                {history.map((session) => (
                  <div key={session.id} style={historyRowStyle()}>
                    <div style={{ display: 'grid', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {TRAINING_TYPE_LABELS[session.type]} · {INTENSITY_LABELS[session.intensity]}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {formatRelativeDate(session.createdAt)} · {session.durationMinutes} dk
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: '2px', textAlign: 'right', fontSize: '12px' }}>
                      {Object.entries(session.statGain).length > 0 ? (
                        <span style={{ color: 'var(--color-status-positive)' }}>
                          {Object.entries(session.statGain)
                            .map(([field, delta]) => `${STAT_FIELD_LABELS[field] ?? field} +${delta}`)
                            .join(', ')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>Stat etkisi yok</span>
                      )}
                      <span style={{ color: 'var(--color-status-warning)' }}>Yorgunluk: {session.fatigueGain >= 0 ? '+' : ''}{session.fatigueGain}</span>
                      {session.injuryOccurred ? (
                        <span style={{ color: 'var(--color-status-critical)', fontWeight: 600 }}>Sakatlandı</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </GlassPanel>
        </div>
      ) : null}

      <style>{`
        @media (min-width: 900px) {
          .training-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) !important;
          }
        }
      `}</style>
    </main>
  );
}

function horseStatusLabel(status: PublicHorse['status']): string {
  const labels: Record<PublicHorse['status'], string> = {
    active: 'Hazır',
    injured: 'Sakat',
    retired: 'Emekli',
    resting: 'Dinleniyor',
  };
  return labels[status];
}

function sectionTitleStyle(): React.CSSProperties {
  return { fontSize: '15px', color: 'var(--color-text-primary)', marginTop: 0, marginBottom: 'var(--space-md)' };
}

function labelStyle(): React.CSSProperties {
  return { fontSize: '12px', color: 'var(--color-text-secondary)' };
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
  };
}

function chipStyle(selected: boolean): React.CSSProperties {
  // AUDIT_REPORT.md F1: minHeight eklendi - onceden ~28px, 44px dokunma
  // hedefi kuralinin altindaydi.
  return {
    minHeight: '44px',
    padding: '8px 14px',
    borderRadius: '999px',
    border: `1px solid ${selected ? 'var(--color-accent-gold)' : 'var(--color-border)'}`,
    background: selected ? 'var(--color-accent-gold)' : 'transparent',
    color: selected ? '#1a1405' : 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function historyRowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'var(--space-sm)',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  };
}

// `apps/web/src/app/replays/page.tsx`'teki AYNI yardımcı fonksiyonun
// kopyası (o dosyanın doc yorumundaki AYNI gerekçeyle: küçük, tek-kullanımlık
// bir format yardımcısı için ortak bir modül İCAT EDİLMEDİ).
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
