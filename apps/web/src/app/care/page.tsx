'use client';

/**
 * Bakım — `training/page.tsx` ile AYNI durumdaydı: dürüst bir "yakında"
 * placeholder'ı bile YOKTU (dashboard'un `NAV_ITEMS`'ında hiç kartı
 * yoktu), oysa backend (`POST /horses/:id/care`, `POST /horses/:id/feed`
 * — FAZ 1 wiring, beşinci dilim) FAZ 1'den beri TAM ÇALIŞIR durumdaydı.
 * `claude/hizli-bitirme-plani.md`'nin Antrenman ekranı için izlediği AYNI
 * gerekçe burada da geçerli: bu, yeni bir backend YAZMADAN en ucuz/en
 * yüksek etkili sıradaki adımdı (Master Brief §25 "PHASE 14 — STABLE"nin
 * istediği Condition/Training/Feed/Health bilgilerinden "Feed" ve bakım
 * eylemleri, `stable/page.tsx`'in ZATEN gösterdiği health/fitness/fatigue/
 * energy/morale'a EK olarak buradan yönetilebilir hale gelir).
 *
 * `CareActionType`/`FeedType` listeleri `apps/api/src/domain/care/
 * validation.ts`'teki `CARE_ACTION_TYPES`/`FEED_TYPES` ile BİREBİR aynı
 * tutulmalıdır (apps/web, apps/api'nin domain koduna import edemez —
 * `training/page.tsx`'in AYNI kısıtı, bkz. docs/ARCHITECTURE.md §4).
 *
 * KASITLI FARK (training/page.tsx'e kıyasla): `canTrain` yalnızca
 * `status === 'active'` bir atı kabul ediyordu, ama bakımın (özellikle
 * `vet`) TAM OLARAK işi sakat bir atı `active`'e geri döndürmektir (bkz.
 * `PerformCareActionUseCase`'in `canRecoverFromInjury` çağrısı) — bu
 * yüzden burada durum bazlı bir engelleme YOK, backend zaten kendi
 * kurallarını (cooldown, `InvalidCareInputError`) uyguluyor.
 *
 * Cooldown bilgisi ÖNCEDEN gösterilmiyor: `CareLogRepository`'nin yalnızca
 * `findLastPerformedAt` (application-içi) metodu var, oyuncuya kalan
 * süreyi ÖNCEDEN göstermek için bir GET uç noktası YOK — bu YENİ bir
 * sorgu/endpoint gerektirirdi (bilinçli olarak bu dilimin kapsamı
 * dışında bırakıldı). Bunun yerine, backend'in 409 hatası (mesajında
 * kalan dakika bilgisiyle, bkz. `CareActionOnCooldownError`) olduğu gibi
 * gösterilir — `training/page.tsx`'in hata mesajı gösterme deseniyle
 * AYNI.
 */

import { useEffect, useMemo, useState } from 'react';
import type {
  CareActionType,
  FeedHorseResult,
  FeedType,
  PerformCareActionResult,
  PublicHorse,
} from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HorseAvatar } from '../../components/ui/HorseAvatar';
import { StatBar } from '../../components/ui/StatBar';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

const CARE_ACTION_TYPES: readonly CareActionType[] = ['groom', 'water', 'clean', 'vet', 'farrier', 'rest'];
const FEED_TYPES: readonly FeedType[] = ['standard', 'energy', 'protein', 'recovery', 'performance'];

const CARE_ACTION_LABELS: Record<CareActionType, string> = {
  groom: 'Tımar',
  water: 'Su',
  clean: 'Temizlik',
  vet: 'Veteriner',
  farrier: 'Nalbant',
  rest: 'Dinlendir',
};

const CARE_ACTION_DESCRIPTIONS: Record<CareActionType, string> = {
  groom: 'Moral ve sağlığı hafifçe artırır.',
  water: 'Enerjiyi tazeler, iyileşme oranını yükseltir.',
  clean: 'Sağlığı artırır, sakatlık riskini azaltır.',
  vet: 'Sakatlık riskini büyük ölçüde azaltır — sakat bir atı aktif duruma döndürebilir.',
  farrier: 'Eklem durumunu ve sakatlık riskini iyileştirir.',
  rest: 'Yorgunluğu düşürür, enerjiyi tazeler.',
};

const FEED_TYPE_LABELS: Record<FeedType, string> = {
  standard: 'Standart',
  energy: 'Enerji',
  protein: 'Protein',
  recovery: 'İyileşme',
  performance: 'Performans',
};

const FEED_TYPE_DESCRIPTIONS: Record<FeedType, string> = {
  standard: 'Dengeli, temel bir öğün.',
  energy: 'Enerjiyi belirgin şekilde artırır.',
  protein: 'Enerji ile birlikte kondisyonu de destekler.',
  recovery: 'Toparlanmaya odaklı, hafif bir öğün.',
  performance: 'En güçlü etkili öğün — daha yüksek bir bedeli vardır.',
};

const HEALTH_FIELD_LABELS: Record<keyof PerformCareActionResult['newHealth'], string> = {
  injuryRisk: 'Sakatlık Riski',
  recoveryRate: 'İyileşme Oranı',
  jointCondition: 'Eklem Durumu',
  weightCondition: 'Kilo Durumu',
};

export default function CarePage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [horsesError, setHorsesError] = useState<string | null>(null);
  const [selectedHorseId, setSelectedHorseId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [careResult, setCareResult] = useState<PerformCareActionResult | null>(null);
  const [feedResult, setFeedResult] = useState<FeedHorseResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

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
    // KURULU DEĞİL (bkz. `training/page.tsx`'teki AYNI ders) — bağımlılık
    // dizisi bilinçli olarak yalnızca `player?.id`.
  }, [player?.id]);

  const selectedHorse = useMemo(
    () => horses?.find((horse) => horse.id === selectedHorseId) ?? null,
    [horses, selectedHorseId],
  );

  const canAct = selectedHorse !== null && !isBusy;

  const handleCareAction = async (actionType: CareActionType) => {
    if (!selectedHorse || !player) {
      return;
    }
    setIsBusy(true);
    setMessage(null);
    setMessageIsError(false);
    setCareResult(null);
    setFeedResult(null);
    try {
      const result = await apiClient.careHorse(selectedHorse.id, actionType);
      setCareResult(result);
      setMessage(
        result.newStatus === 'active' && selectedHorse.status === 'injured'
          ? `${CARE_ACTION_LABELS[actionType]} tamamlandı — at iyileşti ve tekrar aktif!`
          : `${CARE_ACTION_LABELS[actionType]} tamamlandı.`,
      );
      await loadHorses(player.id);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Bakım eylemi başarısız oldu');
      setMessageIsError(true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleFeed = async (feedType: FeedType) => {
    if (!selectedHorse || !player) {
      return;
    }
    setIsBusy(true);
    setMessage(null);
    setMessageIsError(false);
    setCareResult(null);
    setFeedResult(null);
    try {
      const result = await apiClient.feedHorse(selectedHorse.id, feedType);
      setFeedResult(result);
      setMessage(`${FEED_TYPE_LABELS[feedType]} öğünü verildi.`);
      await loadHorses(player.id);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Besleme başarısız oldu');
      setMessageIsError(true);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Bakım</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Bir at seç, bakım eylemi veya öğün ver — sağlık ve yaşamsal değerleri gerçek zamanlı güncellenir.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Bakım yapabilmek için önce bir seyis/jokey hesabı oluştur.
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
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Ahırında bakım yapılabilecek bir at bulunamıyor.</p>
        </GlassPanel>
      ) : null}

      {player && horses && horses.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--space-lg)', gridTemplateColumns: 'minmax(0, 1fr)' }} className="care-grid">
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
            <h2 style={sectionTitleStyle()}>Bakım & Besleme</h2>

            {selectedHorse ? (
              <div style={{ display: 'grid', gap: '6px', marginBottom: 'var(--space-md)' }}>
                <StatBar label="Sağlık" value={selectedHorse.health} />
                <StatBar label="Enerji" value={selectedHorse.energy} />
                <StatBar label="Kondisyon" value={selectedHorse.fitness} />
                <StatBar label="Yorgunluk" value={selectedHorse.fatigue} higherIsBetter={false} />
                <StatBar label="Moral" value={selectedHorse.morale} />
              </div>
            ) : null}

            {selectedHorse && selectedHorse.status === 'injured' ? (
              <p style={{ color: 'var(--color-status-warning)', fontSize: '13px' }}>
                Bu at sakat — Veteriner bakımı iyileşmeyi hızlandırabilir ve uygun eşikler karşılanırsa atı tekrar aktif duruma döndürebilir.
              </p>
            ) : null}

            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              <label style={labelStyle()}>Bakım Eylemi</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {CARE_ACTION_TYPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={!canAct}
                    title={CARE_ACTION_DESCRIPTIONS[option]}
                    onClick={() => void handleCareAction(option)}
                    style={chipStyle(false, !canAct)}
                  >
                    {CARE_ACTION_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
              <label style={labelStyle()}>Besleme</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {FEED_TYPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={!canAct}
                    title={FEED_TYPE_DESCRIPTIONS[option]}
                    onClick={() => void handleFeed(option)}
                    style={chipStyle(false, !canAct)}
                  >
                    {FEED_TYPE_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            {isBusy ? <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>İşleniyor…</p> : null}

            {message ? (
              <p style={{ marginTop: 'var(--space-md)', color: messageIsError ? 'var(--color-status-critical)' : 'var(--color-text-primary)' }}>
                {message}
              </p>
            ) : null}

            {careResult ? (
              <div style={{ marginTop: 'var(--space-md)', display: 'grid', gap: '4px', fontSize: '13px' }}>
                {(Object.keys(careResult.newHealth) as Array<keyof PerformCareActionResult['newHealth']>).map((field) => (
                  <span key={field} style={{ color: 'var(--color-text-secondary)' }}>
                    {HEALTH_FIELD_LABELS[field]}: {Math.round(careResult.newHealth[field])}
                  </span>
                ))}
              </div>
            ) : null}

            {feedResult ? (
              <div style={{ marginTop: 'var(--space-md)', display: 'grid', gap: '4px', fontSize: '13px' }}>
                <span style={{ color: 'var(--color-status-positive)' }}>Enerji: {Math.round(feedResult.newVitals.energy)}</span>
              </div>
            ) : null}
          </GlassPanel>
        </div>
      ) : null}

      <style>{`
        @media (min-width: 900px) {
          .care-grid {
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

function chipStyle(selected: boolean, disabled: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '8px 14px',
    borderRadius: '999px',
    border: `1px solid ${selected ? 'var(--color-accent-gold)' : 'var(--color-border)'}`,
    background: disabled ? 'var(--color-bg-surface-elevated)' : selected ? 'var(--color-accent-gold)' : 'transparent',
    color: disabled ? 'var(--color-text-muted)' : selected ? '#1a1405' : 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
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
