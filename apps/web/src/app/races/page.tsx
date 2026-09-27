'use client';

/**
 * Yarışlar — daha önce dürüst bir "yakında" placeholder'ıydı çünkü
 * backend'de bir `GET /races` (yarış takvimi) uç noktası HÂLÂ YOK. Ama
 * `POST /horses/:id/practice-race` (docs/API.md §4, brief §6 Race Engine)
 * FAZ 1'in sekizinci/dokuzuncu diliminden beri TAM ÇALIŞIR durumdaydı —
 * `claude/hizli-bitirme-plani.md`: Antrenman/Online ekranlarıyla AYNI
 * gerekçeyle (yeni backend YAZILMADI, yalnızca zaten var olan uç noktaya
 * gerçek bir arayüz eklendi) bu artık atınla gerçek bir yarış koşabildiğin
 * bir ekran. Planlanmış turnuva takvimi (brief §7 `Race`/`RaceEntry`
 * tabloları, zamanlanmış `startTime` alanı) hâlâ dürüstçe "yakında" olarak
 * bırakılıyor — sahte bir takvim UYDURULMUYOR.
 *
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ) — AUDIT_REPORT.md'de
 * belgelenen boşluğun kapatılması: `handleRace` sonucu artık yalnızca
 * statik `RaceResultPanel` DEĞİL, `LiveRaceViewer` (canlı, WebSocket-
 * beslemeli 3D görüntüleyici — bkz. o dosyanın doc yorumu) İLE BİRLİKTE
 * gösterilir. `LiveRaceViewer` finansal sonucu TEKRARLAMAZ (`result`
 * REST'ten ZATEN anında dönmüştür) — yalnızca EK bir görsel katmandır.
 *
 * YARIŞ EKONOMİSİ (proje sahibinin açık talebi, 27.09.2026 — bu turda
 * EKLENDİ): "yarışlar ücretli olsun, verilen ücret kadarıyla giriş yapan
 * kişiler çarpan olsun ve bir yarışta 8 / 10 / 12 / 14 / 16 at koşabilsin,
 * HAZIR OLAN kişiler yarışabilsinler". Bu ekran artık:
 *  - KADEME seçtirir (mahalli → şampiyona; alan 8→16, giriş 100→2000 Çip),
 *  - seçili kademenin giriş ücretini, alan büyüklüğünü ve 1. sıra çarpanını
 *    yarıştan ÖNCE gösterir (kaynak `config/economy.config.json`, bkz.
 *    `features/race/race-entry.ts` — istemci kendi fiyatını UYDURMAZ),
 *  - at HAZIR değilse (sağlık/enerji/yorgunluk/durum) düğmeyi kilitler ve
 *    TEK bir gerekçe yazar.
 *
 * DİKKAT — bu ekrandaki hiçbir sayı OTORİTE DEĞİLDİR: giriş ücreti, havuz ve
 * ödül her zaman sunucunun yarış yanıtından okunur (`entryFee`/`prizePool`/
 * `prizeWon`). Kademe listesi ve hazır olma eşikleri sunucuyla AYNI config
 * dosyalarından geldiği için kaymaz; yine de sunucu reddederse (ör. `409
 * INSUFFICIENT_ENERGY`) yarış BAŞLAMAZ.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  FinalStretchPlan,
  PracticeRaceResult,
  PublicHorse,
  RacingStyle,
  RiskLevel,
  StartApproach,
} from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HorseAvatar } from '../../components/ui/HorseAvatar';
import { StatBar } from '../../components/ui/StatBar';
import { LiveRaceViewer } from '../../features/race-viewer/LiveRaceViewer';
import {
  DEFAULT_RACE_TIER_ID,
  findRaceTier,
  formatMultiplier,
  formatRakePercent,
  getRaceEntryBlocker,
  getTopPayoutMultipliers,
  RACE_ENTRY_BLOCKER_LABELS,
  RACE_RAKE,
  RACE_TIERS,
} from '../../features/race/race-entry';
import { API_BASE_URL, apiClient, getAuthToken } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

const RACING_STYLES: readonly RacingStyle[] = ['front_runner', 'tracker', 'mid_pack', 'closer'];
const RISK_LEVELS: readonly RiskLevel[] = ['low', 'normal', 'high'];
const START_APPROACHES: readonly StartApproach[] = ['aggressive', 'balanced', 'controlled'];
const FINAL_STRETCH_PLANS: readonly FinalStretchPlan[] = ['early_sprint', 'normal', 'late_sprint'];

const RACING_STYLE_LABELS: Record<RacingStyle, string> = {
  front_runner: 'Öncü',
  tracker: 'Takipçi',
  mid_pack: 'Orta Grup',
  closer: 'Kapanışçı',
};

const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
};

const START_APPROACH_LABELS: Record<StartApproach, string> = {
  aggressive: 'Agresif',
  balanced: 'Dengeli',
  controlled: 'Kontrollü',
};

const FINAL_STRETCH_PLAN_LABELS: Record<FinalStretchPlan, string> = {
  early_sprint: 'Erken Sprint',
  normal: 'Normal',
  late_sprint: 'Geç Sprint',
};

const SURFACE_LABELS: Record<PracticeRaceResult['surface'], string> = {
  grass: 'Çim',
  dirt: 'Toprak',
  synthetic: 'Sentetik',
};

const WEATHER_LABELS: Record<PracticeRaceResult['weather'], string> = {
  sunny: 'Güneşli',
  rainy: 'Yağmurlu',
  windy: 'Rüzgarlı',
  cloudy: 'Bulutlu',
  hot: 'Sıcak',
  cold: 'Soğuk',
};

export default function RacesPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [horsesError, setHorsesError] = useState<string | null>(null);
  const [selectedHorseId, setSelectedHorseId] = useState<string | null>(null);
  const [tierId, setTierId] = useState<string | null>(DEFAULT_RACE_TIER_ID);
  const [racingStyle, setRacingStyle] = useState<RacingStyle>('mid_pack');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('normal');
  const [startApproach, setStartApproach] = useState<StartApproach>('balanced');
  const [finalStretchPlan, setFinalStretchPlan] = useState<FinalStretchPlan>('normal');
  const [isRacing, setIsRacing] = useState(false);
  const [result, setResult] = useState<PracticeRaceResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadHorses = async (ownerId: string) => {
    setHorsesError(null);
    try {
      const data = await apiClient.getHorsesByOwner(ownerId);
      setHorses(data);
      setSelectedHorseId((current) => current ?? data.find((h) => h.status === 'active')?.id ?? null);
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
    // KURULU DEĞİL (bkz. `training/page.tsx` doc yorumundaki AYNI ders) —
    // bu yüzden burada bir `eslint-disable` yorumu YAZILMAZ.
  }, [player?.id]);

  const selectedHorse = useMemo(
    () => horses?.find((horse) => horse.id === selectedHorseId) ?? null,
    [horses, selectedHorseId],
  );

  const selectedTier = useMemo(() => findRaceTier(tierId), [tierId]);

  /**
   * Düğmeyi kilitleyen TEK gerekçe. `null` ise at yarışa hazırdır. Sunucu
   * yine de son sözü söyler (bkz. dosya başı doc yorumu) — bu kontrol
   * yalnızca oyuncunun boşuna para/idempotency anahtarı harcamasını ve
   * anlamsız bir hata mesajı görmesini engeller.
   */
  const entryBlocker = selectedHorse === null ? null : getRaceEntryBlocker(selectedHorse);
  const canRace = selectedHorse !== null && entryBlocker === null && selectedTier !== null && !isRacing;

  const handleRace = async () => {
    if (!selectedHorse || !player || !selectedTier) {
      return;
    }
    setIsRacing(true);
    setMessage(null);
    setResult(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const raceResult = await apiClient.runPracticeRace(
        selectedHorse.id,
        { racingStyle, riskLevel, startApproach, finalStretchPlan, tierId: selectedTier.id },
        idempotencyKey,
      );
      setResult(raceResult);
      await loadHorses(player.id);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Yarış başlatılamadı');
    } finally {
      setIsRacing(false);
    }
  };

  const ownEntry = result?.finalResult.find((entry) => entry.horseId === selectedHorse?.id) ?? null;
  const ownExplanation = result?.explanations.find((entry) => entry.horseId === selectedHorse?.id) ?? null;

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Yarışlar</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-md)' }}>
        Bir kademe ve at seç, yarış taktiğini belirle — kademenin alanı kadar at (8–16) gerçek Race Engine ile
        anında koşar. Giriş ücreti bakiyeden düşer, ödül havuzdan kazanıldığın sıraya göre dağıtılır.
      </p>

      <GlassPanel style={{ marginBottom: 'var(--space-lg)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
        Not: planlanmış turnuva/yarış takvimi henüz yok (backend'de bir `GET /races` uç noktası bulunmuyor) — bu,
        dürüstçe belirtilmiş bilinen bir sınırlama. Şimdilik yalnızca anlık pratik yarış mevcut. Yarış Görüntüleyiciyi
        (3D) görsel bir demo olarak denemek istersen:{' '}
        <Link href="/races/demo" style={{ color: 'var(--color-accent-focus)', fontWeight: 600 }}>
          buradan
        </Link>
        .
      </GlassPanel>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Yarışabilmek için önce bir seyis/jokey hesabı oluştur.
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
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Yarıştırabileceğin bir at bulunamıyor.</p>
        </GlassPanel>
      ) : null}

      {result && selectedHorse ? (
        <GlassPanel style={{ marginBottom: 'var(--space-lg)', padding: 0, overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '420px', position: 'relative' }}>
            {(() => {
              const authToken = getAuthToken();
              // `authToken` normalde her zaman doludur (bu ekran zaten
              // `player` girişi gerektirir) — ama `getAuthToken()`'ın
              // GERÇEK bir sözleşmesi (null dönebilir) olduğundan bunu
              // sessizce `!` ile ZORLAMAK yerine (bu oturumun genel
              // ilkesi) açıkça kontrol edip dürüst bir "bağlanılamıyor"
              // durumu gösteriyoruz.
              if (!authToken) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
                    Canlı görüntüleyici için oturum token'ı bulunamadı.
                  </div>
                );
              }
              return (
                <LiveRaceViewer
                  key={result.raceId}
                  apiBaseUrl={API_BASE_URL}
                  token={authToken}
                  raceId={result.raceId}
                  ownHorseId={selectedHorse.id}
                />
              );
            })()}
          </div>
        </GlassPanel>
      ) : null}

      {player && horses && horses.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--space-lg)', gridTemplateColumns: 'minmax(0, 1fr)' }} className="races-grid">
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
            <h2 style={sectionTitleStyle()}>Yarış Kurulumu</h2>

            {selectedHorse ? (
              <div style={{ display: 'grid', gap: '6px', marginBottom: 'var(--space-md)' }}>
                <StatBar label="Sağlık" value={selectedHorse.health} />
                <StatBar label="Enerji" value={selectedHorse.energy} />
                <StatBar label="Yorgunluk" value={selectedHorse.fatigue} higherIsBetter={false} />
                <StatBar label="Moral" value={selectedHorse.morale} />
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              <label style={labelStyle()}>Yarış Kademesi</label>
              <div style={{ display: 'grid', gap: '6px' }}>
                {RACE_TIERS.map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setTierId(tier.id)}
                    style={tierRowStyle(tier.id === tierId)}
                  >
                    <div style={{ display: 'grid', gap: '2px', textAlign: 'left', flex: 1 }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {tier.label}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {tier.fieldSize} at — giriş {formatCurrency('money', tier.entryFee)}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent-gold)' }}>
                      1. sıra {formatMultiplier(getTopPayoutMultipliers(tier, 1)[0] ?? 0)}
                    </span>
                  </button>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>
                Havuz, koşan her atın giriş ücretinden oluşur (botlar dahil); dağıtılmayan{' '}
                {formatRakePercent(RACE_RAKE)} kadarı kesinti olarak alınır. Ödül, ödediğin giriş ücretinin
                yukarıdaki katıdır.
              </p>
            </div>

            {selectedHorse && entryBlocker ? (
              <p style={{ color: 'var(--color-status-warning)', fontSize: '13px' }}>
                {entryBlocker === 'HORSE_NOT_ACTIVE'
                  ? `${horseStatusLabel(selectedHorse.status)} durumundaki bir at yarışamaz.`
                  : `${RACE_ENTRY_BLOCKER_LABELS[entryBlocker]} — bu at yarışa hazır değil.`}
              </p>
            ) : null}

            <TacticGroup label="Yarış Stili" options={RACING_STYLES} labels={RACING_STYLE_LABELS} value={racingStyle} onChange={setRacingStyle} />
            <TacticGroup label="Risk Seviyesi" options={RISK_LEVELS} labels={RISK_LEVEL_LABELS} value={riskLevel} onChange={setRiskLevel} />
            <TacticGroup
              label="Çıkış Yaklaşımı"
              options={START_APPROACHES}
              labels={START_APPROACH_LABELS}
              value={startApproach}
              onChange={setStartApproach}
            />
            <TacticGroup
              label="Bitiş Planı"
              options={FINAL_STRETCH_PLANS}
              labels={FINAL_STRETCH_PLAN_LABELS}
              value={finalStretchPlan}
              onChange={setFinalStretchPlan}
              last
            />

            <button type="button" disabled={!canRace} onClick={() => void handleRace()} style={primaryButtonStyle(!canRace)}>
              {isRacing
                ? 'Yarışılıyor…'
                : selectedTier
                  ? `${formatCurrency('money', selectedTier.entryFee)} Öde ve Yarışa Başla`
                  : 'Yarışa Başla'}
            </button>

            {message ? <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-status-critical)' }}>{message}</p> : null}

            {result ? (
              <RaceResultPanel
                result={result}
                ownHorseId={selectedHorse?.id ?? null}
                ownFinishPosition={ownEntry?.finishPosition ?? null}
                ownExplanation={ownExplanation}
              />
            ) : null}
          </GlassPanel>
        </div>
      ) : null}

      <style>{`
        @media (min-width: 900px) {
          .races-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) !important;
          }
        }
      `}</style>
    </main>
  );
}

function TacticGroup<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
  last,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
  last?: boolean;
}): React.ReactElement {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: last ? 'var(--space-lg)' : 'var(--space-md)' }}>
      <label style={labelStyle()}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {options.map((option) => (
          <button key={option} type="button" onClick={() => onChange(option)} style={chipStyle(option === value)}>
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

function RaceResultPanel({
  result,
  ownHorseId,
  ownFinishPosition,
  ownExplanation,
}: {
  result: PracticeRaceResult;
  ownHorseId: string | null;
  ownFinishPosition: number | null;
  ownExplanation: { positives: string[]; negatives: string[] } | null;
}): React.ReactElement {
  const won = ownFinishPosition === 1;
  return (
    <div style={{ marginTop: 'var(--space-lg)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: won ? 'var(--color-status-positive)' : 'var(--color-text-primary)' }}>
        {ownFinishPosition ? `${ownFinishPosition}. sırada bitirdin` : 'Yarış tamamlandı'}
      </h3>
      <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
        {result.tierLabel} ({result.fieldSize} at) — {result.distanceMeters}m — {SURFACE_LABELS[result.surface]} —{' '}
        {WEATHER_LABELS[result.weather]}
      </p>

      <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
        <span>Giriş ücreti: {formatCurrency('money', result.entryFee)}</span>
        <span>Ödül havuzu: {formatCurrency('money', result.prizePool)}</span>
        <span style={{ color: result.prizeWon > 0 ? 'var(--color-status-positive)' : 'var(--color-text-secondary)' }}>
          Kazanılan ödül: {formatCurrency('money', result.prizeWon)}
        </span>
        <span style={{ color: 'var(--color-text-primary)' }}>
          Yeni bakiye: {formatCurrency('money', result.newBalance.money)} / {formatCurrency('gems', result.newBalance.gems)}
        </span>
      </div>

      <div style={{ display: 'grid', gap: '4px', marginBottom: 'var(--space-md)' }}>
        {[...result.finalResult]
          .sort((a, b) => a.finishPosition - b.finishPosition)
          .map((entry) => (
            <div
              key={entry.horseId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: entry.horseId === ownHorseId ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              }}
            >
              <span>{entry.finishPosition}. {entry.horseId === ownHorseId ? 'Atın' : `Rakip (${entry.horseId.slice(0, 6)})`}</span>
              <span>{(entry.finishTimeMs / 1000).toFixed(2)} sn</span>
            </div>
          ))}
      </div>

      {ownExplanation ? (
        <div style={{ display: 'grid', gap: '2px', fontSize: '12px' }}>
          {ownExplanation.positives.map((line, i) => (
            <span key={`pos-${i}`} style={{ color: 'var(--color-status-positive)' }}>+ {line}</span>
          ))}
          {ownExplanation.negatives.map((line, i) => (
            <span key={`neg-${i}`} style={{ color: 'var(--color-status-critical)' }}>− {line}</span>
          ))}
        </div>
      ) : null}
    </div>
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

function tierRowStyle(selected: boolean): React.CSSProperties {
  // `horseRowStyle` ile AYNI görsel dil (seçili öğe altın çerçeve) — ama
  // `minHeight: 44px` EKLENDİ: `chipStyle`in AUDIT_REPORT.md F1 gerekçesiyle
  // aynı 44px dokunma hedefi kuralı, bu satırlar da dokunmatik hedeftir.
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minHeight: '44px',
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
