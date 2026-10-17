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

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  Award,
  BatteryMedium,
  Dumbbell,
  HeartPulse,
  Network,
  Smile,
  Trophy,
  Warehouse,
  Wrench,
  Zap,
} from 'lucide-react';
import type {
  HorsePedigreeView,
  PublicHorse,
  StableSummaryView,
} from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HorseHeadIcon } from '../../components/ui/HorseHeadIcon';
import { StarRating } from '../../components/ui/StarRating';
import { StatBar } from '../../components/ui/StatBar';
import { BreedingPanel } from '../../features/breeding/BreedingPanel';
import { JockeyPanel } from '../../features/jockey/JockeyPanel';
import { PedigreeTree } from '../../features/pedigree/PedigreeTree';
import { HorseCareerPanel } from '../../features/horse-profile/HorseCareerPanel';
import { describeUpbringing, statRows } from '../../features/horse-profile/horse-profile';
import { describeNeeds, needsTrainingPenalty } from '../../features/horse-profile/horse-needs';
import { pickFeaturedHorse } from '../../features/home-scene/featured-horse';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';
import { breedLabel } from '../../features/breeds/breed-catalog';
import { PersonalityChips } from '../../features/personality/PersonalityChips';
import { StableActionDock } from '../../features/stable-actions/StableActionDock';
import { describeComfort } from '../../features/stable-actions/stable-upgrade';
import { StableUpgradePanel } from '../../features/stable-actions/StableUpgradePanel';
import { stallContextFrom } from '../../features/stable-actions/StableLayoutPanel';
import { sceneNeighbors } from '../../features/stable-scene/stall-map';
import type { StableSceneNeighbor } from '../../features/stable-scene/StableScene3D';
import { PlayerOverview } from '../../features/home/PlayerOverview';
import { OnboardingPanel } from '../../features/onboarding/OnboardingPanel';
import { formatRaceReadyIn } from '../../features/race/race-entry';
import {
  RETIREMENT_CONFIRM_MESSAGE,
  canOfferRetirement,
  describeLifeStage,
  formatHorseAge,
} from '../../features/breeding/horse-lifecycle';
import {
  parseStableActionParam,
  type StableActionKey,
} from '../../features/stable-actions/stable-actions';

/**
 * 01.10.2026 — 3D AHIR SAHNESİ (adım 6). Tembel ve istemci tarafında
 * yüklenir (three.js sunucuda çalışmaz). Sayfada TEK Canvas: kartlar sahneye
 * at seçer — her kartta ayrı WebGL bağlamı tarayıcı sınırını aşardı.
 */
const StableScene3D = dynamic(
  () => import('../../features/stable-scene/StableScene3D').then((mod) => mod.StableScene3D),
  {
    ssr: false,
    loading: () => (
      <div
        className="stable3d"
        style={{ display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)' }}
      >
        3D ahır yükleniyor…
      </div>
    ),
  },
);

export default function StablePage(): React.ReactElement {
  const {
    player,
    isLoading: isPlayerLoading,
    error: playerError,
    createPlayer,
    refresh,
  } = usePlayer();
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 16.10.2026 — ahır özeti (kapasite, seviyeler, bölmeler): sahne, panel ve kart ortak kullanır. */
  const [stableSummary, setStableSummary] = useState<StableSummaryView | null>(null);
  /** 3D ahırda gösterilen at; seçilmemişse öne çıkan at (ana sayfayla aynı kural). */
  const [stageHorseId, setStageHorseId] = useState<string | null>(null);
  const stageHorse = useMemo(
    () =>
      horses
        ? (horses.find((item) => item.id === stageHorseId) ?? pickFeaturedHorse(horses))
        : null,
    [horses, stageHorseId],
  );
  const showInStable = useCallback((horseId: string) => {
    setStageHorseId(horseId);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  /**
   * 08.10.2026 — bakım ve ekipman ahırın İÇİNDE: sahnedeki simgelerden ya da
   * kartlardaki düğmelerden açılır. Eski `/care`, `/equipment` adresleri
   * `?panel=` ile buraya yönlenir (sorgu dizesi `useEffect`te okunur —
   * `store` sayfasıyla aynı; `useSearchParams` Suspense sınırı isterdi).
   */
  const [activeAction, setActiveAction] = useState<StableActionKey | null>(null);
  // 16.10.2026 — sorgu dizesi DEĞİŞİNCE de okunur: ahırdayken üst menüden
  // "Bakım"a basmak (`/care` → `/stable?panel=care`) sayfayı yeniden kurmaz;
  // eskiden yalnızca ilk yüklemede okunuyordu ve panel açılmıyordu.
  const applyUrlParams = useCallback((panel: string | null, horse: string | null) => {
    setActiveAction(parseStableActionParam(panel));
    if (horse) setStageHorseId(horse);
  }, []);
  // Panel kapanınca `?panel=` adresten silinir; yoksa aynı bağlantıya ikinci
  // basış adresi değiştirmez ve paneli yeniden açmazdı.
  const router = useRouter();
  const selectStableAction = useCallback(
    (key: StableActionKey | null) => {
      setActiveAction(key);
      if (key === null && new URLSearchParams(window.location.search).has('panel')) {
        router.replace('/stable', { scroll: false });
      }
    },
    [router],
  );
  const openStableAction = useCallback(
    (horseId: string, action: StableActionKey) => {
      setActiveAction(action);
      showInStable(horseId);
    },
    [showInStable],
  );

  // Atlar oyuncu KİMLİĞİNE bağlı yüklenir, nesnesine değil: bakiye tazelemesi
  // (`refresh` — ekipman alımı, ahır yükseltme, tay) yeni bir oyuncu nesnesi
  // üretir; nesneye bağlı efekt atları sıfırlayıp 3D ahırı ve açık paneli
  // baştan kuruyordu (08.10.2026'da yaşandı: alım mesajı kayboluyordu).
  const playerId = player?.id ?? null;
  useEffect(() => {
    if (!playerId) {
      return;
    }
    let cancelled = false;
    setHorses(null);
    setError(null);
    void apiClient
      .getHorsesByOwner(playerId)
      .then((data) => {
        if (!cancelled) setHorses(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Atlar yüklenemedi');
      });
    void apiClient
      .getStableSummary(playerId)
      .then((data) => {
        if (!cancelled) setStableSummary(data);
      })
      .catch(() => {
        // Özet yoksa sahne komşu bölmesiz çizilir; kart kendi hatasını gösterir.
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  /**
   * Tay doğduktan SONRA çağrılır (`BreedingPanel`): ahır listesi tazelenir
   * (yeni tay orada görünmelidir) **ve** oyuncu bağlamı yenilenir — damızlık
   * ücreti ödendiyse üst bardaki bakiye aksi halde sayfa yenilenene kadar
   * ESKİ değeri gösterirdi (`StableUpgradeCard`'ın `onUpgraded` notuyla AYNI
   * gerekçe). Burada `cancelled` koruması YOKTUR çünkü bu, kullanıcı
   * eylemiyle tetiklenen bir tazelemedir — bileşen kaldırılırsa React
   * uyarı verir ama sızıntı olmaz; yarışan iki tazeleme de aynı veriyi yazar.
   */
  /** Bakım/besleme sonrası: kartlar ve sahnedeki at sunucudaki son değeri gösterir. */
  const reloadHorses = useCallback(async (): Promise<void> => {
    if (!player) {
      return;
    }
    try {
      const [nextHorses, nextSummary] = await Promise.all([
        apiClient.getHorsesByOwner(player.id),
        apiClient.getStableSummary(player.id),
      ]);
      setHorses(nextHorses);
      setStableSummary(nextSummary);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Atlar yüklenemedi');
    }
  }, [player]);

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

  // 08.10.2026 — ahır ana sayfadır: sahne üst bar hariç ekranı kaplar,
  // atlar ve paneller kaydırınca altta. Sahnede at değiştirme + "Atlarım".
  // 16.10.2026 — ‹ › koridorda yürür gibi BÖLME sırasıyla gezer.
  const byStall = useMemo(
    () => (horses ? [...horses].sort((a, b) => (a.stallNumber ?? 0) - (b.stallNumber ?? 0)) : []),
    [horses],
  );
  const stageIndex = stageHorse ? byStall.findIndex((item) => item.id === stageHorse.id) : -1;
  const stepStage = (delta: number) => {
    if (byStall.length < 2 || stageIndex < 0) return;
    const next = byStall[(stageIndex + delta + byStall.length) % byStall.length];
    if (next) setStageHorseId(next.id);
  };
  // 16.10.2026 — sahnedeki komşu bölmeler (dolu: at, boş: "+ At al", kilitli: seviye).
  const neighbors = useMemo((): StableSceneNeighbor[] => {
    if (!horses || !stableSummary || !stageHorse?.stallNumber) return [];
    const byId = new Map(horses.map((item) => [item.id, item]));
    return sceneNeighbors(stageHorse.stallNumber, stallContextFrom(stableSummary, horses)).map((neighbor) => ({
      ...neighbor,
      horse: neighbor.state.kind === 'occupied' ? byId.get(neighbor.state.horseId) : undefined,
    }));
  }, [horses, stableSummary, stageHorse]);

  return (
    <main>
      <Suspense fallback={null}>
        <StableUrlParams onChange={applyUrlParams} />
      </Suspense>
      {stageHorse ? (
        <StableScene3D
          horse={stageHorse}
          fullscreen
          neighbors={neighbors}
          onSelectHorse={setStageHorseId}
          onLockedStall={() => selectStableAction('upgrade')}
          stallNumber={stageHorse.stallNumber}
        >
          {player ? <OnboardingPanel /> : null}
          <StableActionDock
            horse={stageHorse}
            active={activeAction}
            onSelect={selectStableAction}
            onHorseChanged={reloadHorses}
            layout={
              player && horses && stableSummary
                ? { playerId: player.id, horses, summary: stableSummary, onShowHorse: setStageHorseId }
                : null
            }
          />
          <div className="stable3d-switcher" data-testid="stable-switcher">
            {byStall.length > 1 ? (
              <button type="button" onClick={() => stepStage(-1)} aria-label="Önceki at">
                ‹
              </button>
            ) : null}
            <a href="#stable-horses">Atlarım{horses ? ` (${horses.length})` : ''} ↓</a>
            {byStall.length > 1 ? (
              <button type="button" onClick={() => stepStage(1)} aria-label="Sonraki at">
                ›
              </button>
            ) : null}
          </div>
        </StableScene3D>
      ) : player || isPlayerLoading ? (
        <div className="stable3d stable3d-full stable3d-loading">Ahır yükleniyor…</div>
      ) : null}

      <div className="page-container" id="stable-horses">
        <h1 className="page-title" style={{ marginBottom: '4px' }}>
          Ahırım
        </h1>
        <p
          style={{
            color: 'var(--color-text-secondary)',
            marginTop: 0,
            marginBottom: 'var(--space-lg)',
          }}
        >
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
            {playerError ? (
              <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>
                {playerError}
              </p>
            ) : null}
          </GlassPanel>
        ) : null}

        {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

        {player ? (
          <StableUpgradeCard
            summary={stableSummary}
            onUpgraded={reloadHorses}
            onOpenUpgrade={
              stageHorse
                ? () => {
                    selectStableAction('upgrade');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                : null
            }
          />
        ) : null}

        {player && horses === null && !error ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Ahır yükleniyor…</p>
        ) : null}

        {horses && horses.length === 0 ? (
          <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              Ahırında kayıtlı at yok. Yarışmak için bir at edin:
            </p>
            <div
              data-testid="empty-stable-actions"
              style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'center', marginTop: 'var(--space-md)', flexWrap: 'wrap' }}
            >
              <Link href="/breeds" className="btn-action btn-action-green">
                Irk mağazası
              </Link>
              <Link href="/market" className="btn-action btn-action-blue">
                At pazarı
              </Link>
            </div>
          </GlassPanel>
        ) : null}

        {horses && horses.length > 0 ? (
          // 01.10.2026 tasarım yenilemesi: atlar sayfanın ASIL içeriğidir —
          // yükseltme kartının hemen altında, yetiştirme/jokeyden ÖNCE gelir.
          <div className="horse-grid">
            {horses.map((horse) => (
              <HorseCard
                key={horse.id}
                horse={horse}
                isOnStage={stageHorse?.id === horse.id}
                onShowInStable={showInStable}
                onOpenAction={openStableAction}
                canRetire={canOfferRetirement(horse, horses)}
                onRetired={reloadHorses}
              />
            ))}
          </div>
        ) : null}
        {player && horses !== null ? (
          <BreedingPanel ownerId={player.id} horses={horses} onBred={handleBred} />
        ) : null}

        {/*
        JOKEY PANELİ (29.09.2026, FINAL_PROJECT_AUDIT #18) — `horses`e BAĞLI
        DEĞİLDİR: jokey oyuncunun kendisine aittir, tek bir ata değil
        (`jockeys.owner_id`), ve ahırı boş bir oyuncu da jokey kiralamak
        isteyebilir. Bu yüzden `BreedingPanel`in aksine at listesini
        beklemez — yalnızca `player` yeterlidir.
      */}
        {player ? (
          <div id="jockey">
            <JockeyPanel playerId={player.id} />
          </div>
        ) : null}

        {player ? <PlayerOverview player={player} /> : null}
      </div>
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
/** `?panel=` / `?horse=` izleyicisi (`useSearchParams` Suspense sınırı ister). */
function StableUrlParams({ onChange }: { onChange: (panel: string | null, horse: string | null) => void }): null {
  const params = useSearchParams();
  const panel = params.get('panel');
  const horse = params.get('horse');
  useEffect(() => {
    onChange(panel, horse);
  }, [panel, horse, onChange]);
  return null;
}

function StableUpgradeCard({
  summary,
  onUpgraded,
  onOpenUpgrade,
}: {
  summary: StableSummaryView | null;
  onUpgraded: () => Promise<void>;
  /**
   * 16.10.2026 — yükseltme "Ahırı Geliştir" panelindedir (tek bileşen). Ahır
   * sahnesi varsa panel sahnede açılır; at yoksa sahne çizilmez → `null` ve
   * panel bu kartın içinde açılır.
   */
  onOpenUpgrade: (() => void) | null;
}): React.ReactElement {
  const [inlineOpen, setInlineOpen] = useState(false);

  if (summary === null) {
    return (
      <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Ahır durumu yükleniyor…</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-lg)', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: '4px', minWidth: '160px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Ahır Seviyesi</span>
          <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-accent-gold)', lineHeight: 1.1 }}>
            {summary.stableLevel}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            {summary.stableName} · Kapasite: {summary.horseCount} / {summary.capacity} at
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            {describeComfort(summary.recoveryBonusPercent)}
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

        <div style={{ display: 'grid', gap: '8px', minWidth: '220px' }}>
          {summary.nextUpgrade === null ? (
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>En yüksek ahır seviyesine ulaştın.</span>
          ) : (
            <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
              Sonraki: {summary.nextUpgrade.nextName} · {summary.nextUpgrade.nextCapacity} at ·{' '}
              {formatCurrency(summary.nextUpgrade.cost.currency, summary.nextUpgrade.cost.amount)}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenUpgrade ?? (() => setInlineOpen((open) => !open))}
            className="btn-gold"
            data-testid="open-stable-upgrade"
          >
            Ahırı Geliştir
          </button>
        </div>
      </div>
      {onOpenUpgrade === null && inlineOpen ? <StableUpgradePanel onUpgraded={onUpgraded} /> : null}
    </GlassPanel>
  );
}

function HorseCard({
  horse,
  isOnStage,
  onShowInStable,
  onOpenAction,
  canRetire,
  onRetired,
}: {
  horse: PublicHorse;
  isOnStage: boolean;
  onShowInStable: (horseId: string) => void;
  onOpenAction: (horseId: string, action: StableActionKey) => void;
  /** 15.10.2026 — S5: emekli olmayan ve son yarış atı olmayan atta "Emekli et". */
  canRetire: boolean;
  onRetired: () => Promise<void>;
}): React.ReactElement {
  const [isRetiring, setIsRetiring] = useState(false);
  const [retireError, setRetireError] = useState<string | null>(null);
  const retire = useCallback(async (): Promise<void> => {
    if (!window.confirm(`${horse.name}: ${RETIREMENT_CONFIRM_MESSAGE}`)) return;
    setIsRetiring(true);
    setRetireError(null);
    try {
      await apiClient.retireHorse(horse.id);
      await onRetired();
    } catch (err: unknown) {
      setRetireError(err instanceof Error ? err.message : 'At emekli edilemedi');
    } finally {
      setIsRetiring(false);
    }
  }, [horse.id, horse.name, onRetired]);

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
  // 16.10.2026 — kariyer paneli (brief §3); açıldığında kendisi yükler.
  const [isCareerOpen, setIsCareerOpen] = useState(false);
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
            {horse.ageMonths !== undefined ? ` · ${formatHorseAge(horse.ageMonths)}` : null}
            {describeLifeStage(horse.lifeStage) !== null ? (
              <span data-testid={`life-stage-${horse.id}`} title="Yaş evresi: yarışta hız, ivme ve dayanıklılığa uygulanır">
                {` · ${describeLifeStage(horse.lifeStage)}`}
              </span>
            ) : null}
          </span>
          <StarRating score={horse.quality} />
        </div>
        <StatusBadge status={horse.status} />
      </div>

      <div style={{ padding: 'var(--space-lg)' }}>
        <PersonalityChips personality={horse.personality} />
        <div style={{ display: 'grid', gap: '10px' }}>
          <StatBar icon={<HeartPulse size={14} />} label="Sağlık" value={horse.health} />
          <StatBar icon={<BatteryMedium size={14} />} label="Enerji" value={horse.energy} />
          <StatBar icon={<Activity size={14} />} label="Kondisyon" value={horse.fitness} />
          <StatBar
            icon={<Zap size={14} />}
            label="Yorgunluk"
            value={horse.fatigue}
            higherIsBetter={false}
          />
          <StatBar icon={<Smile size={14} />} label="Moral" value={horse.morale} />
        </div>
        {horse.stats ? (
          <div
            data-testid={`horse-stats-${horse.id}`}
            className="horse-stat-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '6px',
              marginTop: 'var(--space-sm)',
            }}
          >
            {statRows(horse.stats).map((row) => (
              <div
                key={row.key}
                style={{
                  textAlign: 'center',
                  padding: '4px 2px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{row.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{row.value}</div>
              </div>
            ))}
          </div>
        ) : null}
        {horse.upbringing ? (
          <p
            data-testid={`upbringing-${horse.id}`}
            style={{ margin: 'var(--space-sm) 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}
          >
            {describeUpbringing(horse.upbringing)} · <Link href="/shop">Market</Link>
          </p>
        ) : null}
        {horse.needs ? (
          <div className="horse-needs" data-testid={`needs-${horse.id}`}>
            {describeNeeds(horse.needs, new Date()).map((line) => (
              <button
                key={line.key}
                type="button"
                className="horse-need"
                data-level={line.level}
                onClick={() => onOpenAction(horse.id, 'care')}
                title="Bakım panelini aç"
              >
                <span aria-hidden="true">{line.icon}</span> {line.text}
              </button>
            ))}
            {needsTrainingPenalty(horse.needs) ? (
              <span className="horse-need-penalty">{needsTrainingPenalty(horse.needs)}</span>
            ) : null}
          </div>
        ) : null}
        {horse.raceReadyAt ? (
          <p
            style={{
              margin: 'var(--space-sm) 0 0',
              fontSize: '12px',
              color: 'var(--color-text-muted)',
            }}
          >
            Dinleniyor — yarışa {formatRaceReadyIn(horse.raceReadyAt, new Date())} hazır.
          </p>
        ) : null}

        <div
          className="featured-actions featured-actions-3"
          style={{ marginTop: 'var(--space-md)' }}
        >
          <Link href="/training" className="btn-action btn-action-blue">
            <Dumbbell size={18} aria-hidden="true" />
            Antrenman
          </Link>
          <button
            type="button"
            className="btn-action btn-action-green"
            onClick={() => onOpenAction(horse.id, 'care')}
          >
            <HeartPulse size={18} aria-hidden="true" />
            Bakım
          </button>
          <button
            type="button"
            className="btn-action btn-action-blue"
            onClick={() => onOpenAction(horse.id, 'equipment')}
          >
            <Wrench size={18} aria-hidden="true" />
            Ekipman
          </button>
        </div>

        <button
          type="button"
          onClick={() => onShowInStable(horse.id)}
          className="btn-outline"
          style={{ width: '100%', marginTop: 'var(--space-md)' }}
          disabled={isOnStage}
        >
          <Warehouse size={16} aria-hidden="true" />
          {isOnStage ? 'Ahırda gösteriliyor' : 'Ahırda Göster'}
        </button>

        {horse.status === 'retired' ? (
          <p style={{ margin: 'var(--space-sm) 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Emekli — yarışmaz, damızlık yapar (aşağıdaki Yetiştirme bölümü).
          </p>
        ) : canRetire ? (
          <button
            type="button"
            onClick={() => void retire()}
            className="btn-outline"
            style={{ width: '100%', marginTop: 'var(--space-sm)' }}
            disabled={isRetiring}
          >
            <Award size={16} aria-hidden="true" />
            {isRetiring ? 'Emekli ediliyor…' : 'Emekli et (damızlığa ayır)'}
          </button>
        ) : null}
        {retireError !== null ? (
          <p style={{ color: 'var(--color-status-critical)', fontSize: '12px', margin: '6px 0 0' }}>{retireError}</p>
        ) : null}

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
          <span>
            Potansiyel tahmini: {horse.potentialEstimate.min}–{horse.potentialEstimate.max}
          </span>
          {marketValue !== null ? (
            <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>
              Değer: {formatCurrency('money', marketValue)}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setIsCareerOpen((open) => !open)}
          className="btn-outline"
          style={{ width: '100%', marginTop: 'var(--space-md)' }}
          aria-expanded={isCareerOpen}
        >
          <Trophy size={16} aria-hidden="true" />
          {isCareerOpen ? 'Kariyeri Kapat' : 'Kariyer ve Geçmiş'}
        </button>
        {isCareerOpen ? (
          <div style={{ marginTop: 'var(--space-sm)' }}>
            <HorseCareerPanel horseId={horse.id} />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void togglePedigree()}
          className="btn-outline"
          style={{ width: '100%', marginTop: 'var(--space-md)' }}
        >
          <Network size={16} aria-hidden="true" />
          {isPedigreeOpen ? 'Soy Ağacını Kapat' : 'Soy Ağacı'}
        </button>

        {isPedigreeOpen ? (
          pedigreeError !== null ? (
            <p style={{ color: 'var(--color-status-critical)', fontSize: '12px', marginBottom: 0 }}>
              {pedigreeError}
            </p>
          ) : pedigree === null ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginBottom: 0 }}>
              Soy ağacı yükleniyor…
            </p>
          ) : (
            // Soy kaydı OLMAYAN at da geçerli bir sonuçtur (başlangıç atları
            // hiçbir zaman çiftleştirilmedi) — `PedigreeTree` bu durumda tüm
            // düğümleri "Bilinmiyor" olarak gösterir, hata DEĞİL.
            <div style={{ marginTop: 'var(--space-md)' }}>
              <PedigreeTree
                pedigree={pedigree.pedigree}
                horseNamesById={pedigree.horseNamesById}
                recordsById={pedigree.recordsById}
              />
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
  const labels: Record<
    Exclude<PublicHorse['status'], 'active'>,
    { text: string; color: string }
  > = {
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
  return `${breedLabel(breed)} · ${genderLabels[gender]}`;
}
