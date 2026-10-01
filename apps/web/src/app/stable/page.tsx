'use client';

/**
 * Ahırım — `docs/GAME_DESIGN.md` §5 Ahır ekranı, proje sahibinin paylaştığı
 * UI mockup'ındaki at portresi + stat bar'lar + yıldız derecelendirme
 * paneli. Daha önce bu rota HİÇ VAR OLMUYORDU (bkz. Faz 2 araştırma
 * notları) — tek "ahır benzeri" görünüm eski `app/page.tsx`'in düz metin
 * listesiydi (avatar/stat bar/rating YOKTU).
 *
 * Tüm veriler GERÇEKTİR (`GET /horses?ownerId=` → `PublicHorse[]`,
 * `packages/shared-types/src/horse.ts`) — health/fitness/fatigue/energy/
 * morale zaten var olan 0-100 alanlardır, yıldız derecelendirme `quality`
 * puanından İSTEMCİ TARAFINDA türetilir (bkz. `StarRating.tsx` doc
 * yorumu), yeni bir backend alanı İCAT EDİLMEZ.
 *
 * SOY AĞACI (bu dilimde BAĞLANDI) — her at kartındaki "Soy Ağacı" düğmesi
 * `GET /horses/:id/pedigree` çağırır ve `PedigreeTree.tsx`'i render eder.
 * Bu, o bileşenin İLK gerçek veri kaynağıdır: daha önce hiçbir yerden
 * çağrılmıyordu (bkz. `PedigreeTree.tsx` dosya başı doc yorumu — orada
 * yazan "backend wiring YOK" notu bu dilimle GEÇERSİZ olmuştur).
 * **Tembel yüklenir** (kart açılmadan istek atılmaz) — ahırda 10 at varsa
 * 10 gereksiz istek oluşmasın diye.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Activity, BatteryMedium, Dumbbell, HeartPulse, Network, Smile, Zap } from 'lucide-react';
import type { HorsePedigreeView, PublicHorse, StableSummaryView, StableUpgradeResult } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HorseHeadIcon } from '../../components/ui/HorseHeadIcon';
import { StarRating } from '../../components/ui/StarRating';
import { StatBar } from '../../components/ui/StatBar';
import { BreedingPanel } from '../../features/breeding/BreedingPanel';
import { JockeyPanel } from '../../features/jockey/JockeyPanel';
import { PedigreeTree } from '../../features/pedigree/PedigreeTree';
import { apiClient } from '../../lib/api-client';
import { formatCurrency, hasEnoughFunds } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

export default function StablePage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer, refresh } = usePlayer();
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!player) {
      return;
    }
    let cancelled = false;
    setHorses(null);
    setError(null);
    void apiClient
      .getHorsesByOwner(player.id)
      .then((data) => {
        if (!cancelled) setHorses(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Atlar yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [player]);

  /**
   * Tay doğduktan SONRA çağrılır (`BreedingPanel`): ahır listesi tazelenir
   * (yeni tay orada görünmelidir) **ve** oyuncu bağlamı yenilenir — damızlık
   * ücreti ödendiyse üst bardaki bakiye aksi halde sayfa yenilenene kadar
   * ESKİ değeri gösterirdi (`StableUpgradeCard`'ın `onUpgraded` notuyla AYNI
   * gerekçe). Burada `cancelled` koruması YOKTUR çünkü bu, kullanıcı
   * eylemiyle tetiklenen bir tazelemedir — bileşen kaldırılırsa React
   * uyarı verir ama sızıntı olmaz; yarışan iki tazeleme de aynı veriyi yazar.
   */
  const handleBred = useCallback(async (): Promise<void> => {
    if (!player) {
      return;
    }
    setError(null);
    try {
      setHorses(await apiClient.getHorsesByOwner(player.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Atlar yüklenemedi');
    }
    await refresh();
  }, [player, refresh]);

  return (
    <main className="page-container">
      <h1 className="page-title" style={{ marginBottom: '4px' }}>Ahırım</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Atlarının durumunu takip et, en güçlülerini yarışa hazırla.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Ahırını görebilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} className="btn-gold">
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {player ? <StableUpgradeCard ownerId={player.id} onUpgraded={refresh} /> : null}

      {player && horses === null && !error ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Ahır yükleniyor…</p>
      ) : null}

      {horses && horses.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Ahırında kayıtlı at bulunamadı.</p>
        </GlassPanel>
      ) : null}

      {horses && horses.length > 0 ? (
        // 01.10.2026 tasarım yenilemesi: atlar sayfanın ASIL içeriğidir —
        // yükseltme kartının hemen altında, yetiştirme/jokeyden ÖNCE gelir.
        <div className="horse-grid">
          {horses.map((horse) => (
            <HorseCard key={horse.id} horse={horse} />
          ))}
        </div>
      ) : null}
      {player && horses !== null ? <BreedingPanel ownerId={player.id} horses={horses} onBred={handleBred} /> : null}

      {/*
        JOKEY PANELİ (29.09.2026, FINAL_PROJECT_AUDIT #18) — `horses`e BAĞLI
        DEĞİLDİR: jokey oyuncunun kendisine aittir, tek bir ata değil
        (`jockeys.owner_id`), ve ahırı boş bir oyuncu da jokey kiralamak
        isteyebilir. Bu yüzden `BreedingPanel`in aksine at listesini
        beklemez — yalnızca `player` yeterlidir.
      */}
      {player ? <JockeyPanel playerId={player.id} /> : null}

    </main>
  );
}

/**
 * Ahır Yükseltme kartı — `POST /players/:id/stable/upgrade` (brief §32).
 *
 * NEDEN VAR: bu uç nokta, `UpgradeStableUseCase` ve `Idempotency-Key`
 * sertleştirmesi FAZ 1'den beri yerinde ve e2e testleriyle korunuyordu —
 * ama bu arayüzde KARŞILIĞI YOKTU. Yani oyuncunun biriken parasını
 * harcayıp ilerleyebildiği ana yol, ekrandan ULAŞILAMAZ durumdaydı.
 *
 * Sayılar SUNUCUDAN gelir: fiyat ve kazanılacak kapasite `nextUpgrade`
 * alanındadır (bkz. `packages/shared-types/src/stable.ts`). Bu bileşen
 * hiçbir tutar HESAPLAMAZ; yalnızca gösterir ve "bakiye yeterli mi"
 * karşılaştırmasını yapar. Gerçek düşüş sunucuda `SELECT ... FOR UPDATE`
 * + `economy_transactions` defter kaydıyla olur (CLAUDE.md "PARA/MUTASYON
 * YOLU"). Düğmenin önden kapatılması yalnızca bir KOLAYLIKTIR — güvenlik
 * sınırı DEĞİLDİR; sunucu yetersiz bakiyeyi zaten 409 ile reddeder.
 */
function StableUpgradeCard({ ownerId, onUpgraded }: { ownerId: string; onUpgraded: () => Promise<void> }): React.ReactElement {
  const { player } = usePlayer();
  const [summary, setSummary] = useState<StableSummaryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [result, setResult] = useState<StableUpgradeResult | null>(null);

  const loadSummary = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setSummary(await apiClient.getStableSummary(ownerId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ahır özeti yüklenemedi');
    }
  }, [ownerId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleUpgrade = useCallback(async (): Promise<void> => {
    setIsUpgrading(true);
    setError(null);
    setResult(null);
    try {
      // Her YENİ deneme için TAZE bir anahtar üretilir — `market/page.tsx`
      // ve `races/page.tsx` ile AYNI `crypto.randomUUID()` kalıbı. Aynı
      // anahtarın bilerek tekrarlanması durumunda sunucu AYNI sonucu döner
      // ve bakiyeden İKİNCİ kez düşmez (bkz. `api-client.ts` `upgradeStable`).
      const upgradeResult = await apiClient.upgradeStable(ownerId, crypto.randomUUID());
      setResult(upgradeResult);
      await loadSummary();
      // Bakiye üst çubukta (`TopBar`) da görünür; oyuncu bağlamı
      // tazelenmezse harcama sayfa yenilenene kadar orada GÖRÜNMEZ kalırdı.
      await onUpgraded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Yükseltme başarısız oldu');
    } finally {
      setIsUpgrading(false);
    }
  }, [ownerId, loadSummary, onUpgraded]);

  if (summary === null) {
    return (
      <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>{error ?? 'Ahır durumu yükleniyor…'}</p>
      </GlassPanel>
    );
  }

  const offer = summary.nextUpgrade;
  const isEnabled = offer !== null && player !== null && hasEnoughFunds(player, offer.cost) && !isUpgrading;

  return (
    <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-lg)', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: '4px', minWidth: '160px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Ahır Seviyesi</span>
          <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-accent-gold)', lineHeight: 1.1 }}>
            {summary.stableLevel}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Kapasite: {summary.horseCount} / {summary.capacity} at
          </span>
        </div>

        <div style={{ flex: 1, minWidth: '220px' }}>
          <StatBar label="Ortalama Kondisyon" value={summary.averageCondition} />
          {summary.healthWarnings.length > 0 ? (
            <p style={{ color: 'var(--color-status-warning)', fontSize: '12px', marginBottom: 0 }}>
              Sağlığı düşük: {summary.healthWarnings.join(', ')}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: '8px', minWidth: '240px' }}>
          {offer === null ? (
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>En yüksek ahır seviyesine ulaştın.</span>
          ) : (
            <>
              <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                Seviye {offer.nextLevel} · kapasite {offer.nextCapacity} ata çıkar
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isEnabled ? 'var(--color-accent-gold)' : 'var(--color-status-critical)',
                }}
              >
                Maliyet: {formatCurrency(offer.cost.currency, offer.cost.amount)}
              </span>
              <button type="button" onClick={() => void handleUpgrade()} disabled={!isEnabled} className="btn-gold">
                {isUpgrading ? 'Yükseltiliyor…' : 'Ahırı Yükselt'}
              </button>
              {!isEnabled && !isUpgrading ? (
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  Yeterli bakiyen yok — günlük ödülünü alarak veya yarış kazanarak para biriktir.
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      {result !== null ? (
        <p style={{ marginTop: 'var(--space-md)', marginBottom: 0, color: 'var(--color-status-positive)', fontSize: '13px' }}>
          Ahır seviye {result.newStableLevel} oldu · kapasite {result.newCapacity} · ödenen{' '}
          {formatCurrency(result.cost.currency, result.cost.amount)} · kalan bakiye{' '}
          {formatCurrency('money', result.newBalance.money)}
        </p>
      ) : null}

      {error !== null ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{error}</p> : null}
    </GlassPanel>
  );
}

function HorseCard({ horse }: { horse: PublicHorse }): React.ReactElement {
  // docs/AUDIT_REPORT.md "§25 Stable görsel yönetim ekranı" bulgusunun
  // "piyasa değeri tahmini ... ayrı dilim" notu (bu turda EKLENDİ) —
  // `calculateMarketValue()` brief §30'dan beri VARDI ama hiçbir yerden
  // ÇAĞRILMIYORDU. Her at kartı KENDİ değerini bağımsız çeker (liste
  // uç noktası `PublicHorse[]` bu türetilmiş alanı TAŞIMAZ, bkz.
  // `get-horse-market-value.use-case.ts` doc yorumu) — `StableSummaryCard`
  // ile AYNI "bağımsız fetch" deseni.
  const [marketValue, setMarketValue] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMarketValue(null);
    void apiClient
      .getHorseMarketValue(horse.id)
      .then((data) => {
        if (!cancelled) setMarketValue(data.estimatedValue);
      })
      .catch(() => {
        // Sessizce yut — değer tahmini ikincil bir bilgidir, kartın geri
        // kalanının (sağlık/kondisyon/statü) gösterimini ENGELLEMEMELİDİR.
      });
    return () => {
      cancelled = true;
    };
  }, [horse.id]);

  // Soy ağacı — `marketValue` ile AYNI "bağımsız, tembel fetch" deseni,
  // tek farkla: bu KULLANICI ETKİLEŞİMİYLE tetiklenir (ahırdaki her at için
  // otomatik istek atmak gereksiz yük olurdu).
  const [pedigree, setPedigree] = useState<HorsePedigreeView | null>(null);
  const [isPedigreeOpen, setIsPedigreeOpen] = useState(false);
  const [pedigreeError, setPedigreeError] = useState<string | null>(null);

  const togglePedigree = useCallback(async (): Promise<void> => {
    if (isPedigreeOpen) {
      setIsPedigreeOpen(false);
      return;
    }
    setIsPedigreeOpen(true);
    if (pedigree !== null) {
      return; // Zaten yüklendi — tekrar istek atılmaz.
    }
    setPedigreeError(null);
    try {
      setPedigree(await apiClient.getHorsePedigree(horse.id));
    } catch (err: unknown) {
      setPedigreeError(err instanceof Error ? err.message : 'Soy ağacı yüklenemedi');
    }
  }, [horse.id, isPedigreeOpen, pedigree]);

  return (
    <GlassPanel style={{ padding: 0, overflow: 'hidden' }}>
      {/* Sahne bandı — CSS degrade + projeye özgü at silüeti (görsel dosyası YOK). */}
      <div className="horse-card-stage">
        <HorseHeadIcon size={150} gradient withMane className="horse-card-silhouette" />
        <div className="horse-card-title">
          <span className="horse-card-name">{horse.name}</span>
          <span className="featured-meta">
            {breedGenderLabel(horse.breed, horse.gender)} · Seviye {horse.level}
          </span>
          <StarRating score={horse.quality} />
        </div>
        <StatusBadge status={horse.status} />
      </div>

      <div style={{ padding: 'var(--space-lg)' }}>
      <div style={{ display: 'grid', gap: '10px' }}>
        <StatBar icon={<HeartPulse size={14} />} label="Sağlık" value={horse.health} />
        <StatBar icon={<BatteryMedium size={14} />} label="Enerji" value={horse.energy} />
        <StatBar icon={<Activity size={14} />} label="Kondisyon" value={horse.fitness} />
        <StatBar icon={<Zap size={14} />} label="Yorgunluk" value={horse.fatigue} higherIsBetter={false} />
        <StatBar icon={<Smile size={14} />} label="Moral" value={horse.morale} />
      </div>

      <div className="featured-actions" style={{ marginTop: 'var(--space-md)' }}>
        <Link href="/training" className="btn-action btn-action-blue">
          <Dumbbell size={18} aria-hidden="true" />
          Antrenman
        </Link>
        <Link href="/care" className="btn-action btn-action-green">
          <HeartPulse size={18} aria-hidden="true" />
          Bakım
        </Link>
      </div>

      <div
        style={{
          marginTop: 'var(--space-md)',
          paddingTop: 'var(--space-sm)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--color-text-muted)',
        }}
      >
        <span>Potansiyel tahmini: {horse.potentialEstimate.min}–{horse.potentialEstimate.max}</span>
        {marketValue !== null ? (
          <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>
            Değer: {formatCurrency('money', marketValue)}
          </span>
        ) : null}
      </div>

      <button type="button" onClick={() => void togglePedigree()} className="btn-outline" style={{ width: '100%', marginTop: 'var(--space-md)' }}>
        <Network size={16} aria-hidden="true" />
        {isPedigreeOpen ? 'Soy Ağacını Kapat' : 'Soy Ağacı'}
      </button>

      {isPedigreeOpen ? (
        pedigreeError !== null ? (
          <p style={{ color: 'var(--color-status-critical)', fontSize: '12px', marginBottom: 0 }}>{pedigreeError}</p>
        ) : pedigree === null ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginBottom: 0 }}>Soy ağacı yükleniyor…</p>
        ) : (
          // Soy kaydı OLMAYAN at da geçerli bir sonuçtur (başlangıç atları
          // hiçbir zaman çiftleştirilmedi) — `PedigreeTree` bu durumda tüm
          // düğümleri "Bilinmiyor" olarak gösterir, hata DEĞİL.
          <div style={{ marginTop: 'var(--space-md)' }}>
            <PedigreeTree pedigree={pedigree.pedigree} horseNamesById={pedigree.horseNamesById} />
          </div>
        )
      ) : null}
      </div>
    </GlassPanel>
  );
}

function StatusBadge({ status }: { status: PublicHorse['status'] }): React.ReactElement | null {
  if (status === 'active') {
    return null;
  }
  const labels: Record<Exclude<PublicHorse['status'], 'active'>, { text: string; color: string }> = {
    injured: { text: 'Sakat', color: 'var(--color-status-critical)' },
    retired: { text: 'Emekli', color: 'var(--color-text-muted)' },
    resting: { text: 'Dinleniyor', color: 'var(--color-status-warning)' },
  };
  const info = labels[status];
  return (
    <span
      style={{
        marginLeft: 'auto',
        alignSelf: 'flex-start',
        fontSize: '11px',
        padding: '3px 8px',
        borderRadius: '999px',
        border: `1px solid ${info.color}`,
        color: info.color,
      }}
    >
      {info.text}
    </span>
  );
}

function breedGenderLabel(breed: string, gender: PublicHorse['gender']): string {
  const genderLabels: Record<PublicHorse['gender'], string> = {
    mare: 'Kısrak',
    stallion: 'Aygır',
    gelding: 'İğdiş',
  };
  return `${breed} · ${genderLabels[gender]}`;
}

