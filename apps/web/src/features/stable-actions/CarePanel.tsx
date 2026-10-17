'use client';

/**
 * AHIR İÇİNDE BAKIM (08.10.2026). Eski `/care` sayfasının içeriği — sahibinin
 * isteğiyle ayrı menü sayfası kalktı, bakım ahır sahnesindeki "Bakım"
 * simgesinden açılır ve sahnedeki at için yapılır. Davranış değişmedi:
 * `POST /horses/:id/care`, `POST /horses/:id/feed`, `GET /horses/:id/feed-status`.
 *
 * `CareActionType` listesi `apps/api/src/domain/care/validation.ts`'teki
 * `CARE_ACTION_TYPES` ile BİREBİR aynı tutulmalıdır (apps/web, apps/api'nin
 * domain kodunu import edemez). Yem kalemleri (16.10.2026) sunucunun
 * `feed-status` yanıtından kategoriyle gelir; yerel liste yoktur.
 *
 * Durum bazlı engelleme YOK: bakımın (özellikle `vet`) işi sakat bir atı
 * `active`'e döndürmektir; sunucu kendi kurallarını (bekleme süresi,
 * `InvalidCareInputError`) uygular ve 409 mesajı olduğu gibi gösterilir.
 */

import Link from 'next/link';
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
import { FEED_CATEGORY_LABELS, FEED_CATEGORY_ORDER, FEED_TYPE_DESCRIPTIONS, FEED_TYPE_LABELS } from '../care/feed-labels';
import { apiClient } from '../../lib/api-client';

const CARE_ACTION_TYPES: readonly CareActionType[] = [
  'groom',
  'water',
  'clean',
  'vet',
  'farrier',
  'rest',
];

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

const UPBRINGING_STAT_LABELS: Record<NonNullable<FeedHorseResult['upbringingGain']>['stat'], string> = {
  speed: 'Hız',
  stamina: 'Dayanıklılık',
  acceleration: 'İvme',
  sprint: 'Sprint',
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

      {/* 16.10.2026 — yem / tay / takviye / ilaç kategorileri (brief §8). Liste ve
          koşullar SUNUCUDAN (`feed-status`); stokta olmayan ücretli kalem
          gösterilmez, Market'ten alınır. */}
      {FEED_CATEGORY_ORDER.map((category) => {
        const items = (feedStatus?.items ?? []).filter(
          (entry) => entry.category === category && (!entry.stocked || (entry.quantity ?? 0) > 0 || entry.type === 'saman'),
        );
        if (items.length === 0) return null;
        return (
          <div key={category} className="stable-action-group">
            <span className="stable-action-label">{FEED_CATEGORY_LABELS[category]}</span>
            <div className="stable-action-chips">
              {items.map((item) => {
                const option = item.type;
                // Stok 0 ya da günlük sınır dolmuşsa düğme kapanır — sunucu
                // zaten 409 dönerdi, ama nedeni ÖNCEDEN göstermek daha dürüsttür.
                const isOutOfStock = item.stocked && (item.quantity ?? 0) <= 0;
                const isLimitReached = item.dailyLimit !== null && (item.fedInWindow ?? 0) >= item.dailyLimit;
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
                    <span className="stable-chip-detail">{feedItemDetail(item)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="stable-action-muted">
        Yem, takviye ve ilaç <Link href="/shop">Market</Link>&apos;ten alınır; stoktakiler burada görünür.
      </p>

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
          {feedResult.upbringingGain ? (
            <span data-testid="upbringing-gain">
              Yetiştirme: {UPBRINGING_STAT_LABELS[feedResult.upbringingGain.stat]} +{feedResult.upbringingGain.amount}
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
