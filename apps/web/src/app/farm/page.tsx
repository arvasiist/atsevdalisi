'use client';

/**
 * Çiftlik — brief §32 (bu turda GERÇEKTEN BAĞLANDI).
 *
 * ÖNCEDEN: bu rota `ComingSoon` yer tutucusuydu. `facilities` tablosu
 * (`database/migrations/0013_create_facilities.up.sql`), `config/farm.config.json`
 * ve `domain/farm/farm.ts` FAZ 2'den beri VARDI ama üçünü birbirine bağlayan
 * hiçbir katman yoktu — tablo ölü şemaydı, domain yalnızca birim testinden
 * çağrılıyordu. Bu turda `GET /players/:id/farm` ve
 * `POST /players/:id/farm/facilities/:type/upgrade` eklendi ve bu ekran
 * ikisine de bağlandı.
 *
 * TÜM SAYILAR SUNUCUDAN gelir: seviye, tavan seviye, bonus ve sıradaki
 * yükseltmenin maliyeti `FarmSummaryView` içinde hazır gelir (bkz.
 * `packages/shared-types/src/facility.ts`). Bu ekran hiçbir tutar/oran
 * HESAPLAMAZ — yalnızca gösterir ve "bakiye yeterli mi" karşılaştırmasını
 * yapar. Gerçek düşüş sunucuda `SELECT ... FOR UPDATE` + `economy_transactions`
 * defter kaydıyla olur (CLAUDE.md "PARA/MUTASYON YOLU"). Düğmenin önden
 * kapatılması yalnızca bir KOLAYLIKTIR — güvenlik sınırı DEĞİLDİR; sunucu
 * yetersiz bakiyeyi zaten 409 ile reddeder.
 *
 * AHIR BU EKRANDA YOKTUR: ahırın kendi yükseltmesi `/stable` sayfasındadır
 * (bkz. `domain/farm/farm.ts` dosya başı doc yorumu).
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  FacilitySummaryView,
  FacilityType,
  FarmSummaryView,
} from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCost, hasEnoughFunds } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

/**
 * Tesis tipinin ekranda görünen adı ve ne işe yaradığı. `FacilityType`
 * union'ı derleme zamanında tüm tipleri garanti eder — bu tablo eksik kalırsa
 * TypeScript derleme hatası verir (sessizce boş görünmez).
 *
 * `direction` YALNIZCA GÖSTERİM içindir ve domain'deki karşılığı vardır:
 * `paddock` artış (`getPaddockRecoveryMultiplier` → `toIncreaseMultiplier`),
 * diğer beşi azaltma (`toReductionMultiplier`), `staff_building` ise mutlak
 * sayı (`getMaxStaffCapacity`). Yeni bir tesis tipi eklenirse buranın
 * güncellenmesi gerekir.
 */
const FACILITY_LABELS: Record<
  FacilityType,
  { name: string; effect: string; direction: 'increase' | 'reduction' | 'absolute' }
> = {
  paddock: { name: 'Paddock', effect: 'Dinlenme sonrası toparlanma', direction: 'increase' },
  training_track: {
    name: 'Antrenman Pisti',
    effect: 'Antrenmanda sakatlık riski',
    direction: 'reduction',
  },
  vet_center: { name: 'Veteriner Merkezi', effect: 'Tedavi maliyeti', direction: 'reduction' },
  farrier_area: {
    name: 'Nalbant Alanı',
    effect: 'Nal/eklem kaynaklı sakatlık riski',
    direction: 'reduction',
  },
  breeding_center: {
    name: 'Üreme Merkezi',
    effect: 'Doğumda sağlık riski',
    direction: 'reduction',
  },
  warehouse: { name: 'Depo', effect: 'Yem maliyeti', direction: 'reduction' },
  staff_building: { name: 'Personel Binası', effect: 'Personel kapasitesi', direction: 'absolute' },
};

/** Oran → yüzde. Adlandırılmış sabit (CLAUDE.md "SİHİRLİ SAYI YOK"). */
const PERCENT = 100;

export default function FarmPage(): React.ReactElement {
  const {
    player,
    isLoading: isPlayerLoading,
    error: playerError,
    createPlayer,
    refresh,
  } = usePlayer();
  const [summary, setSummary] = useState<FarmSummaryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyType, setBusyType] = useState<FacilityType | null>(null);

  const loadSummary = useCallback(async (ownerId: string): Promise<void> => {
    setError(null);
    try {
      setSummary(await apiClient.getFarm(ownerId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Çiftlik yüklenemedi');
    }
  }, []);

  useEffect(() => {
    if (!player) {
      setSummary(null);
      return;
    }
    void loadSummary(player.id);
  }, [player, loadSummary]);

  const handleUpgrade = useCallback(
    async (ownerId: string, type: FacilityType): Promise<void> => {
      setBusyType(type);
      setError(null);
      try {
        // Her YENİ deneme için TAZE bir anahtar üretilir — `/stable` ve
        // `market/page.tsx` ile AYNI `crypto.randomUUID()` kalıbı. Aynı
        // anahtarın tekrar kullanılması, sunucunun isteği yinelenen sayıp
        // İLK yanıtı döndürmesine yol açardı (para ikinci kez düşmezdi ama
        // kullanıcı da yeni seviyeyi göremezdi).
        await apiClient.upgradeFacility(ownerId, type, crypto.randomUUID());
        await loadSummary(ownerId);
        // Bakiye değişti — üst çubuktaki para göstergesi tazelenmeli.
        await refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Tesis yükseltilemedi');
      } finally {
        setBusyType(null);
      }
    },
    [loadSummary, refresh],
  );

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
        Çiftlik
      </h1>
      <p
        style={{
          color: 'var(--color-text-secondary)',
          marginTop: 0,
          marginBottom: 'var(--space-lg)',
        }}
      >
        Tesislerini inşa et ve yükselt; her seviye bir bonusu güçlendirir.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Çiftliğini kurabilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button
            type="button"
            onClick={() => void createPlayer()}
            style={upgradeButtonStyle(true)}
          >
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? (
            <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p>
          ) : null}
        </GlassPanel>
      ) : null}

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {player && summary === null && !error ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Çiftlik yükleniyor…</p>
      ) : null}

      {player && summary ? (
        <>
          <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
              Personel kapasitesi:{' '}
            </span>
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>
              {summary.staffCapacity}
            </span>
          </GlassPanel>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 'var(--space-md)',
            }}
          >
            {summary.facilities.map((facility) => (
              <FacilityCard
                key={facility.type}
                facility={facility}
                player={player}
                isBusy={busyType === facility.type}
                onUpgrade={() => void handleUpgrade(player.id, facility.type)}
              />
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

function FacilityCard({
  facility,
  player,
  isBusy,
  onUpgrade,
}: {
  facility: FacilitySummaryView;
  player: { money: number; gems: number };
  isBusy: boolean;
  onUpgrade: () => void;
}): React.ReactElement {
  const label = FACILITY_LABELS[facility.type];
  const isBuilt = facility.level > 0;
  // 01.10.2026 — etkisi oyunda bağlı olmayan tesis satılmaz (sunucu 409 `FACILITY_INACTIVE`).
  if (!facility.isActive) {
    return (
      <GlassPanel
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', opacity: 0.7 }}
      >
        <div>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 700, fontSize: '16px' }}>
            {label.name}
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
            {' '}
            · seviye {facility.level}/{facility.maxLevel}
          </span>
        </div>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
          Şu an etkisiz: bakım ücretsiz olduğu için düşürülecek bir tedavi maliyeti yok. İnşa
          kapalı.
        </span>
      </GlassPanel>
    );
  }
  const isMaxed = facility.nextUpgrade === null;
  const affordable =
    facility.nextUpgrade !== null && hasEnoughFunds(player, facility.nextUpgrade.cost);
  const canUpgrade = !isMaxed && affordable && !isBusy;

  return (
    <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <div>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 700, fontSize: '16px' }}>
          {label.name}
        </span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
          {' '}
          · seviye {facility.level}/{facility.maxLevel}
        </span>
      </div>

      <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
        {label.effect}:{' '}
        <span style={{ color: 'var(--color-status-positive)' }}>
          {formatBonus(facility, label.direction)}
        </span>
      </div>

      {isMaxed ? (
        <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
          En yüksek seviyede.
        </span>
      ) : (
        <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
          {isBuilt ? 'Yükseltme' : 'İnşa'}:{' '}
          <span style={{ color: 'var(--color-text-primary)' }}>
            {formatCost(facility.nextUpgrade!.cost)}
          </span>
        </span>
      )}

      {!isMaxed && !affordable ? (
        <span style={{ color: 'var(--color-status-warning)', fontSize: '12px' }}>
          Bakiye yetersiz.
        </span>
      ) : null}

      <button
        type="button"
        disabled={!canUpgrade}
        onClick={onUpgrade}
        style={upgradeButtonStyle(canUpgrade)}
      >
        {isBusy ? 'İşleniyor…' : isBuilt ? 'Yükselt' : 'İnşa Et'}
      </button>
    </GlassPanel>
  );
}

/**
 * Bonusun gösterimi. `direction`'a göre İŞARET ve BİRİM değişir (bkz.
 * `FACILITY_LABELS` doc yorumu) — değerin kendisi SUNUCUDAN gelir, burada
 * yalnızca okunabilir hâle getirilir.
 */
function formatBonus(
  facility: FacilitySummaryView,
  direction: 'increase' | 'reduction' | 'absolute',
): string {
  if (facility.level === 0) {
    return 'inşa edilmedi';
  }
  if (direction === 'absolute') {
    return `+${facility.bonusValue.toLocaleString('tr-TR')} kişi`;
  }
  const percent = Math.round(facility.bonusValue * PERCENT).toLocaleString('tr-TR');
  return direction === 'increase' ? `+%${percent}` : `−%${percent}`;
}

function upgradeButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    // Kart içinde düğme HER ZAMAN en altta dursun (kartların yükseklikleri
    // farklı olabilir) — `app/stable/page.tsx`'teki AYNI görünüm.
    marginTop: 'auto',
    // AUDIT_REPORT.md F1 ile AYNI kural: 44px dokunma hedefi.
    minHeight: '44px',
    padding: '12px 24px',
    background: enabled ? 'var(--color-accent-gold)' : 'transparent',
    color: enabled ? '#1a1405' : 'var(--color-text-muted)',
    border: enabled ? 'none' : '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '14px',
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
