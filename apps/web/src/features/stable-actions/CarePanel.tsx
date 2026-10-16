'use client';

/**
 * AHIR İÇİNDE BAKIM (08.10.2026). Eski `/care` sayfasının içeriği — sahibinin
 * isteğiyle ayrı menü sayfası kalktı, bakım ahır sahnesindeki "Bakım"
 * simgesinden açılır ve sahnedeki at için yapılır. Davranış değişmedi:
 * `POST /horses/:id/care`, `POST /horses/:id/feed`, `GET /horses/:id/feed-status`.
 *
 * `CareActionType`/`FeedType` listeleri `apps/api/src/domain/care/
 * validation.ts`'teki `CARE_ACTION_TYPES`/`FEED_TYPES` ile BİREBİR aynı
 * tutulmalıdır (apps/web, apps/api'nin domain koduna import edemez).
 *
 * Durum bazlı engelleme YOK: bakımın (özellikle `vet`) işi sakat bir atı
 * `active`'e döndürmektir; sunucu kendi kurallarını (bekleme süresi,
 * `InvalidCareInputError`) uygular ve 409 mesajı olduğu gibi gösterilir.
 */

import { useEffect, useState } from 'react';
import type {
  CareActionType,
  FeedHorseResult,
  FeedStatusView,
  FeedType,
  PerformCareActionResult,
  PublicHorse,
} from '@at-sevdalisi/shared-types';
import { StatBar } from '../../components/ui/StatBar';
import { FEED_TYPE_LABELS } from '../care/feed-labels';
import { apiClient } from '../../lib/api-client';

const CARE_ACTION_TYPES: readonly CareActionType[] = [
  'groom',
  'water',
  'clean',
  'vet',
  'farrier',
  'rest',
];
/** `apps/api/src/domain/care/validation.ts` `FEED_TYPES` ile BİREBİR aynı sırada. */
const FEED_TYPES: readonly FeedType[] = ['saman', 'arpa', 'mama', 'havuc', 'vitamin'];

export const CARE_ACTION_LABELS: Record<CareActionType, string> = {
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

const FEED_TYPE_DESCRIPTIONS: Record<FeedType, string> = {
  saman: 'Bedava, enerji verir. At başına günde en fazla 3 kez.',
  arpa: 'Enerjiyi en çok artıran kalem, kilo durumunu da destekler.',
  mama: 'Arpa’dan az enerji ama daha çok kondisyon verir.',
  havuc: 'Enerji vermez; moral ve toparlanma sağlar.',
  vitamin: 'Sağlık ve toparlanma için takviye.',
};

const HEALTH_FIELD_LABELS: Record<keyof PerformCareActionResult['newHealth'], string> = {
  injuryRisk: 'Sakatlık Riski',
  recoveryRate: 'İyileşme Oranı',
  jointCondition: 'Eklem Durumu',
  weightCondition: 'Kilo Durumu',
};

export interface CarePanelProps {
  horse: PublicHorse;
  /** Bakım/besleme sonrası at listesini (ve sahnedeki atı) tazeler. */
  onHorseChanged: () => Promise<void>;
}

export function CarePanel({ horse, onHorseChanged }: CarePanelProps): React.ReactElement {
  const [isBusy, setIsBusy] = useState(false);
  const [careResult, setCareResult] = useState<PerformCareActionResult | null>(null);
  const [feedResult, setFeedResult] = useState<FeedHorseResult | null>(null);
  // Kalem başına stok + bu atın kalan günlük hakkı — SUNUCUDAN gelir.
  const [feedStatus, setFeedStatus] = useState<FeedStatusView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  // At değişince eski sonuçlar başka bir ata aitmiş gibi görünmesin.
  useEffect(() => {
    setCareResult(null);
    setFeedResult(null);
    setMessage(null);
  }, [horse.id]);

  /**
   * Yem durumu yalnızca BİLGİ panelidir: alınamazsa düğmeler yine çalışır
   * (sunucu kendi kurallarını uygular ve gerekirse 409 döner).
   */
  useEffect(() => {
    let isCurrent = true;
    setFeedStatus(null);
    void apiClient
      .getHorseFeedStatus(horse.id)
      .then((status) => {
        if (isCurrent) setFeedStatus(status);
      })
      .catch(() => {
        if (isCurrent) setFeedStatus(null);
      });
    return () => {
      isCurrent = false;
    };
  }, [horse.id]);

  const resetFeedback = () => {
    setMessage(null);
    setMessageIsError(false);
    setCareResult(null);
    setFeedResult(null);
  };

  const handleCareAction = async (actionType: CareActionType) => {
    const wasInjured = horse.status === 'injured';
    setIsBusy(true);
    resetFeedback();
    try {
      const result = await apiClient.careHorse(horse.id, actionType);
      setCareResult(result);
      setMessage(
        result.newStatus === 'active' && wasInjured
          ? `${CARE_ACTION_LABELS[actionType]} tamamlandı — at iyileşti ve tekrar aktif!`
          : `${CARE_ACTION_LABELS[actionType]} tamamlandı.`,
      );
      await onHorseChanged();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Bakım eylemi başarısız oldu');
      setMessageIsError(true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleFeed = async (feedType: FeedType) => {
    setIsBusy(true);
    resetFeedback();
    try {
      const result = await apiClient.feedHorse(horse.id, feedType);
      setFeedResult(result);
      setMessage(`${FEED_TYPE_LABELS[feedType]} verildi.`);
      await onHorseChanged();
      // Kalan hak/stok SUNUCUDAN tazelenir — istemci kendi sayacını yürütmez.
      try {
        setFeedStatus(await apiClient.getHorseFeedStatus(horse.id));
      } catch {
        // Bilgi paneli; başarısızlığı beslemeyi etkilemez.
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Besleme başarısız oldu');
      setMessageIsError(true);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="stable-action-body" data-testid="stable-care-panel">
      <div style={{ display: 'grid', gap: '6px' }}>
        <StatBar label="Sağlık" value={horse.health} />
        <StatBar label="Enerji" value={horse.energy} />
        <StatBar label="Kondisyon" value={horse.fitness} />
        <StatBar label="Yorgunluk" value={horse.fatigue} higherIsBetter={false} />
        <StatBar label="Moral" value={horse.morale} />
      </div>

      {horse.status === 'injured' ? (
        <p className="stable-action-warning">
          Bu at sakat — Veteriner bakımı iyileşmeyi hızlandırabilir ve uygun eşikler karşılanırsa
          atı tekrar aktif duruma döndürebilir.
        </p>
      ) : null}

      <div className="stable-action-group">
        <span className="stable-action-label">Bakım</span>
        <div className="stable-action-chips">
          {CARE_ACTION_TYPES.map((option) => (
            <button
              key={option}
              type="button"
              disabled={isBusy}
              title={CARE_ACTION_DESCRIPTIONS[option]}
              onClick={() => void handleCareAction(option)}
              className="stable-chip"
            >
              {CARE_ACTION_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="stable-action-group">
        <span className="stable-action-label">Besleme</span>
        <div className="stable-action-chips">
          {FEED_TYPES.map((option) => {
            const item = feedStatus?.items.find((entry) => entry.type === option) ?? null;
            // Stok 0 ya da günlük sınır dolmuşsa düğme kapanır — sunucu
            // zaten 409 dönerdi, ama nedeni ÖNCEDEN göstermek daha dürüsttür.
            const isOutOfStock = item !== null && item.stocked && (item.quantity ?? 0) <= 0;
            const isLimitReached =
              item !== null && item.dailyLimit !== null && (item.fedInWindow ?? 0) >= item.dailyLimit;
            const isDisabled = isBusy || isOutOfStock || isLimitReached;
            return (
              <button
                key={option}
                type="button"
                disabled={isDisabled}
                title={FEED_TYPE_DESCRIPTIONS[option]}
                onClick={() => void handleFeed(option)}
                className="stable-chip"
              >
                {FEED_TYPE_LABELS[option]}
                {item ? <span className="stable-chip-detail">{feedItemDetail(item)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {isBusy ? <p className="stable-action-muted">İşleniyor…</p> : null}

      {message ? (
        <p
          className="stable-action-message"
          data-error={messageIsError ? 'true' : undefined}
          role={messageIsError ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}

      {careResult ? (
        <div className="stable-action-result">
          {(Object.keys(careResult.newHealth) as Array<keyof PerformCareActionResult['newHealth']>).map(
            (field) => (
              <span key={field}>
                {HEALTH_FIELD_LABELS[field]}: {Math.round(careResult.newHealth[field])}
              </span>
            ),
          )}
          {careResult.staffMultiplier > 1 ? (
            <span className="stable-action-bonus">
              Personel etkisi: +%{Math.round((careResult.staffMultiplier - 1) * 100)}
            </span>
          ) : null}
          {careResult.farmMultiplier > 1 ? (
            <span className="stable-action-bonus">
              Padok etkisi: +%{Math.round((careResult.farmMultiplier - 1) * 100)}
            </span>
          ) : null}
        </div>
      ) : null}

      {feedResult ? (
        <div className="stable-action-result">
          <span>Enerji: {Math.round(feedResult.newVitals.energy)}</span>
          {feedResult.remainingToday !== null ? (
            <span>
              Bugün kalan {FEED_TYPE_LABELS[feedResult.feedType]} hakkı: {feedResult.remainingToday}
            </span>
          ) : null}
          {feedResult.stockAfter !== null ? (
            <span>
              Stokta kalan {FEED_TYPE_LABELS[feedResult.feedType]}: {feedResult.stockAfter}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bir kalemin düğme üstündeki kısa durumu. TÜM sayılar sunucudan gelir
 * (`FeedItemView`) — burada hiçbir oran/tutar hesaplanmaz.
 */
export function feedItemDetail(item: FeedStatusView['items'][number]): string {
  const parts: string[] = [];
  if (item.stocked) {
    parts.push(`stok ${item.quantity ?? 0}`);
  }
  if (item.dailyLimit !== null) {
    parts.push(`bugün ${item.fedInWindow ?? 0}/${item.dailyLimit}`);
  }
  if (item.price !== null && item.discountPercent > 0) {
    parts.push(`depo indirimi %${item.discountPercent}`);
  }
  return parts.join(' · ');
}
